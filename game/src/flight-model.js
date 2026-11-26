// Arcade flight model: throttle and turn discipline, a stall to respect, and
// landings that read as what happened. Fixed-step only — never called with a
// variable dt. State is plain data so the screenshot autopilot can drive the
// same code the player flies.
import { CONFIG, RUNWAY, DEG } from './config.js';
import { clamp, angleDiff } from './random.js';

export function createFlightState(sortie) {
  const s = sortie.start;
  return {
    x: s.x,
    y: s.y,
    z: s.z,
    heading: s.headingDeg * DEG,
    pitch: 0,
    bank: 0,
    speed: s.speed,
    verticalSpeed: 0,
    throttle: 0.55,
    fuel: sortie.fuel,
    hull: CONFIG.hullMax,
    gearDown: true,
    flaps: false,
    onGround: false,
    crashed: false,
    landed: false,
    landedGrade: null,
    windX: 0,
    windZ: 0,
    time: 0,
  };
}

// Wind as a lateral push, in m/s, from the sortie's wind.
export function windVector(sortie) {
  if (!sortie.windKt) return { x: 0, z: 0 };
  const from = sortie.windFromDeg * DEG;
  const speed = sortie.windKt * 0.514444; // knots to m/s
  // Wind blows FROM `from`, so the push points the opposite way.
  return { x: -Math.sin(from) * speed, z: -Math.cos(from) * speed };
}

// One fixed step of flight. `input` is {pitch: -1..1, roll: -1..1,
// throttleDelta: -1..1, gearToggle, flapsToggle} sampled per frame.
// `heightAt` answers terrain height at (x, z). Returns event flags.
export const EVENT_NONE = 0;
export const EVENT_CRASH = 1;
export const EVENT_LANDED = 2;
export const EVENT_STALL = 4;

export function updateFlight(state, input, dt, heightAt, sortie) {
  if (state.crashed || state.landed) return EVENT_NONE;
  const cfg = CONFIG;
  let events = EVENT_NONE;
  state.time += dt;

  // --- controls ---
  state.throttle = clamp(state.throttle + input.throttleDelta * dt * 0.6, 0, 1);
  if (input.gearToggle) state.gearDown = !state.gearDown;
  if (input.flapsToggle) state.flaps = !state.flaps;

  // --- attitude targets from input, eased toward ---
  const bankTarget = clamp(input.roll * cfg.maxBank, -cfg.maxBank, cfg.maxBank);
  const pitchTarget = clamp(input.pitch * cfg.maxPitch, -cfg.maxPitch, cfg.maxPitch);
  const bankRate = cfg.rollRate * dt;
  const pitchRate = cfg.pitchRate * dt;
  state.bank += clamp(bankTarget - state.bank, -bankRate, bankRate);
  state.pitch += clamp(pitchTarget - state.pitch, -pitchRate, pitchRate);

  // --- speed: thrust minus drag, gravity along the flight path ---
  const stallFactor = clamp((state.speed - cfg.stallSpeed * 0.55) / (cfg.stallSpeed * 0.45), 0, 1);
  const thrust = state.throttle * cfg.maxThrustAccel * (0.35 + 0.65 * stallFactor);
  const drag = cfg.dragBase + cfg.dragK * state.speed * state.speed;
  const accel = thrust - drag - cfg.gravity * Math.sin(state.pitch) * 0.55;
  state.speed = clamp(state.speed + accel * dt, 0, cfg.maxSpeed);
  const stalled = state.speed < cfg.stallSpeed;

  // --- turn: banked lift turns the nose toward the low wing. Bank right
  // (positive) rolls the right wing down and turns the heading down with it.
  const turnRate = (cfg.gravity * Math.tan(state.bank)) / Math.max(state.speed, 8);
  state.heading -= turnRate * dt * (stalled ? 0.35 : 1) * cfg.turnAuthority;

  // --- velocity: forward along heading/pitch, wind pushing sideways ---
  const lift = clamp(state.speed / cfg.stallSpeed, 0, 1.15);
  let vy = state.speed * Math.sin(state.pitch) * lift;
  if (stalled) vy -= (cfg.stallSpeed - state.speed) * 0.55; // the wing mushes
  if (state.flaps) vy -= 1.5; // flaps trade speed for a steeper, slower descent
  const fx = Math.sin(state.heading) * Math.cos(state.pitch);
  const fz = Math.cos(state.heading) * Math.cos(state.pitch);
  const vx = fx * state.speed + state.windX;
  const vz = fz * state.speed + state.windZ;
  state.x += vx * dt;
  state.z += vz * dt;
  state.y += vy * dt;
  state.verticalSpeed = vy;
  if (stalled) events |= EVENT_STALL;

  // --- fuel: throttle is the tap; empty tanks end the sortie ---
  state.fuel -= (cfg.fuelBurnBase + cfg.fuelBurnThrottle * state.throttle) * dt;
  if (state.fuel <= 0) {
    state.fuel = 0;
    state.throttle = 0;
  }

  // --- ground ---
  const ground = heightAt(state.x, state.z);
  const gearClearance = state.gearDown ? 2.2 : 1.1;
  if (state.y <= ground + gearClearance) {
    state.y = ground + gearClearance;
    return handleGroundContact(state, ground, events);
  }
  return events;
}

function onRunwayStrip(state) {
  const dx = state.x - RUNWAY.cx;
  const dz = state.z - RUNWAY.cz;
  return Math.abs(dx) <= RUNWAY.length / 2 && Math.abs(dz) <= RUNWAY.width / 2;
}

function headingAligned(state, runwayDeg) {
  const diff = Math.abs(angleDiff(state.heading, runwayDeg * DEG));
  return diff < 12 * DEG || diff > 168 * DEG; // either direction counts
}

export function gradeLanding(state) {
  const vs = Math.abs(state.verticalSpeed);
  if (vs > CONFIG.landingCrashVs) return { grade: 'CRASH', points: 0 };
  const aligned = headingAligned(state, RUNWAY.headingDeg);
  const inZone = Math.abs(state.x - RUNWAY.cx) < RUNWAY.length * 0.32;
  if (vs <= CONFIG.landingPerfectVs && aligned && inZone && state.gearDown) {
    return { grade: 'PERFECT', points: CONFIG.landingPerfect };
  }
  if (vs <= CONFIG.landingGoodVs && aligned && state.gearDown) {
    return { grade: 'GOOD', points: CONFIG.landingGood };
  }
  if (vs <= CONFIG.landingHardVs) return { grade: 'HARD', points: CONFIG.landingHard };
  return { grade: 'CRASH', points: 0 };
}

function handleGroundContact(state, ground, events) {
  // Water or open terrain is never a landing.
  if (ground <= 0.5 || !onRunwayStrip(state)) {
    state.crashed = true;
    state.hull = 0;
    return events | EVENT_CRASH;
  }
  // On the strip: it is a landing attempt, graded by how it arrived.
  const result = gradeLanding(state);
  if (result.grade === 'CRASH') {
    state.crashed = true;
    state.hull = 0;
    return events | EVENT_CRASH;
  }
  if (!state.gearDown) {
    // Belly landing: survives, but the airframe pays for it.
    state.hull = Math.max(0, state.hull - 30);
  } else if (result.grade === 'HARD') {
    state.hull = Math.max(0, state.hull - 18);
  }
  state.landed = true;
  state.landedGrade = result;
  state.onGround = true;
  state.speed = Math.max(0, state.speed - 30);
  return events | EVENT_LANDED;
}
