// Screenshot scenes behind ?shot=cover|sortie|landing|title. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot, so the frame is what a short game really
// looks like and the same seed always gives the same frame. No wall clock,
// no unseeded random: the staged state is a pure function of (shot, seed).
import { CONFIG, SORTIES } from './config.js';
import { createFlightState, updateFlight, windVector } from './flight-model.js';
import { createMission, updateMission, ringDistance, activeRing, allRingsDone } from './missions.js';
import { angleDiff, clamp } from './random.js';

const STEP = CONFIG.step;

// Steer toward a point: bank to the heading, pitch to the altitude. With a
// terrain floor (unless `floor` is false): never descend below the terrain
// 150 m ahead + 45 m until close to the target, so the route over the
// volcano stays in clear air. The rings themselves sit in clear air.
function autopilotTo(state, tx, ty, tz, speedTarget, heightAt, floor = true) {
  const dx = tx - state.x;
  const dz = tz - state.z;
  const wantHeading = Math.atan2(dx, dz);
  const headingErr = angleDiff(wantHeading, state.heading);
  // Heading error positive means the target is to the LEFT (heading grows
  // leftward), so a positive error needs a left bank: negative roll.
  const roll = clamp(-headingErr * 1.6, -1, 1);
  const distToTarget = Math.hypot(dx, dz);
  let wantAlt = ty;
  if (floor && heightAt && distToTarget > 250) {
    // Floor from the terrain below AND 150 m ahead: a turn must not carry
    // the aircraft sideways into a slope it has already passed.
    const aheadX = state.x + Math.sin(state.heading) * 150;
    const aheadZ = state.z + Math.cos(state.heading) * 150;
    wantAlt = Math.max(ty, heightAt(state.x, state.z) + 35, heightAt(aheadX, aheadZ) + 45);
  }
  const altErr = wantAlt - state.y;
  const pitch = clamp(altErr * 0.012, -1, 1);
  // Slow down near the ring: a tighter turn radius threads the ring first
  // time. Never idle the engine in staging: a dead throttle reads as a dead
  // engine in the screenshot.
  const nearTarget = distToTarget < 300 ? 48 : speedTarget;
  let throttleDelta = state.speed < nearTarget ? 1 : state.speed > nearTarget + 8 ? -1 : 0;
  if (state.throttle < 0.15) throttleDelta = 1; // never idle in staging
  return { pitch, roll, throttleDelta, gearToggle: false, flapsToggle: false };
}

function runSteps(state, mission, sortie, heightAt, seconds, steer, stopWhen) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const input = steer(state);
    updateFlight(state, input, STEP, heightAt, sortie);
    updateMission(mission, state, false);
    if (state.crashed || state.landed) break;
    if (stopWhen && stopWhen(state, mission)) break;
  }
}

// Stop on a straight, level approach: close to the target, wings nearly
// level and the nose on the target. A mid-turn frame looks like a crash.
function levelApproach(state, mission) {
  if (mission.ringIndex < 2) return false;
  const ring = activeRing(mission);
  if (!ring || ringDistance(mission, state) > 300) return false;
  if (Math.abs(state.bank) > 0.3) return false;
  const wantHeading = Math.atan2(ring.x - state.x, ring.z - state.z);
  return Math.abs(angleDiff(wantHeading, state.heading)) < 0.25;
}
export function stageShot(name, heightAt, buildRings) {
  const seed = CONFIG.seed;
  if (name === 'title') {
    const sortie = SORTIES[0];
    const mission = createMission();
    const state = createFlightState(sortie);
    const wind = windVector(sortie);
    state.windX = wind.x;
    state.windZ = wind.z;
    const rings = buildRings(sortie.rings);
    // Fly south toward the last ring for a while, so the title sits over the
    // bright lagoon with the volcano behind — not inside the volcano's shadow.
    // 9 s stops well short of the ring: the ring reads ahead, not around us.
    const lastRing = sortie.rings[sortie.rings.length - 1];
    runSteps(state, mission, sortie, heightAt, 9, (s) => autopilotTo(s, lastRing.x, lastRing.y, lastRing.z, 52, heightAt));
    return { screen: 'title', state, mission, sortie, rings };
  }

  if (name === 'sortie') {
    const sortie = SORTIES[1];
    const mission = createMission();
    mission.sortieIndex = 1;
    const state = createFlightState(sortie);
    const wind = windVector(sortie);
    state.windX = wind.x;
    state.windZ = wind.z;
    const rings = buildRings(sortie.rings);
    // Fly the volcano circuit until the third ring is close ahead, wings level.
    runSteps(
      state, mission, sortie, heightAt, 120,
      (s) => {
        const ring = activeRing(mission);
        return ring ? autopilotTo(s, ring.x, ring.y, ring.z, 55, heightAt) : { pitch: 0, roll: 0, throttleDelta: 0, gearToggle: false, flapsToggle: false };
      },
      (s, m) => levelApproach(s, m),
    );
    return { screen: 'play', state, mission, sortie, rings };
  }

  if (name === 'landing') {
    const sortie = SORTIES[0];
    const mission = createMission();
    const state = createFlightState(sortie);
    const wind = windVector(sortie);
    state.windX = wind.x;
    state.windZ = wind.z;
    const rings = buildRings(sortie.rings);
    mission.ringIndex = sortie.rings.length; // all rings clear
    // Place the aircraft on final for RWY 27, over the sea east of the strip:
    // 360 m out, gear down, on slope, so the runway fills the frame.
    state.x = 1050;
    state.y = 45;
    state.z = 120;
    state.heading = (3 * Math.PI) / 2; // west, toward the runway
    state.pitch = -0.06;
    state.bank = 0;
    state.speed = 46;
    state.throttle = 0.32;
    state.gearDown = true;
    runSteps(state, mission, sortie, heightAt, 5, (s) => {
      const distToThreshold = Math.max(0, s.x - 690);
      const wantAlt = 6 + distToThreshold * 0.055;
      return autopilotTo(s, 430, wantAlt, 120, 44, heightAt, false);
    });
    return { screen: 'play', state, mission, sortie, rings };
  }

  // Default: cover. Sortie 1, lagoon circuit, stop with ring 3 close ahead
  // and the runway in the distance behind it.
  const sortie = SORTIES[0];
  const mission = createMission();
  const state = createFlightState(sortie);
  const wind = windVector(sortie);
  state.windX = wind.x;
  state.windZ = wind.z;
  const rings = buildRings(sortie.rings);
  runSteps(
    state, mission, sortie, heightAt, 120,
    (s) => {
      const ring = activeRing(mission);
      return ring ? autopilotTo(s, ring.x, ring.y, ring.z, 54, heightAt) : { pitch: 0, roll: 0, throttleDelta: 0, gearToggle: false, flapsToggle: false };
    },
    (s, m) => levelApproach(s, m),
  );
  return { screen: 'play', state, mission, sortie, rings };
}
