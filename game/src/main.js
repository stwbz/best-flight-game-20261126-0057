// Boot and the one loop. Input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. Screens: title, play, paused, debrief,
// run complete, game over.
//
// ?seed=N fixes the world. ?shot=cover|sortie|landing|title (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { CONFIG, SORTIES, DEG } from './config.js';
import { createRenderer } from './render.js';
import { buildWorld } from './world.js';
import { buildAircraft } from './aircraft.js';
import { createFlightState, updateFlight, windVector, EVENT_CRASH, EVENT_LANDED, EVENT_STALL } from './flight-model.js';
import { createMission, currentSortie, updateMission, ringDistance, activeRing, allRingsDone, finishSortie, nextSortie, finalTally } from './missions.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, ACTION_GEAR, ACTION_FLAPS, ACTION_DROP, ACTION_MUTE } from './input.js';
import { createHUD } from './hud.js';
import { stageShot } from './shots.js';

const BEST_KEY = 'emberline-best-v1';
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
if (Number.isInteger(seedParam)) CONFIG.seed = seedParam >>> 0;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const { renderer, scene, camera, updateChaseCamera, setDusk } = createRenderer(canvas);
const world = buildWorld(scene, CONFIG.seed);
const aircraft = buildAircraft();
scene.add(aircraft.group);
scene.add(aircraft.blob);

const hud = createHUD(document.getElementById('hud-root'), world.heightAt);
const input = createInput(window);

let mission = createMission();
let sortie = currentSortie(mission);
let state = createFlightState(sortie);
let ringMeshes = world.buildRings(sortie.rings);
let screen = 'title';
let debriefs = [];
let stallWarnedAt = -10;
let fuelWarned = false;
let atcText = '';
let atcUntil = 0;
let muted = false;
let audio = null;

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}
function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

// --- audio: small WebAudio synth, started on the first user gesture ---
function ensureAudio() {
  if (audio || muted) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const eng = ctx.createGain();
    eng.gain.value = 0.0;
    osc.connect(lp);
    lp.connect(eng);
    eng.connect(master);
    osc.start();
    audio = { ctx, master, osc, eng };
  } catch {
    audio = null;
  }
}
function tone(freq, dur, type, vol, when = 0) {
  if (!audio || muted) return;
  const { ctx, master } = audio;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, ctx.currentTime + when);
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
  o.connect(g);
  g.connect(master);
  o.start(ctx.currentTime + when);
  o.stop(ctx.currentTime + when + dur + 0.05);
}
function chime() {
  tone(880, 0.18, 'sine', 0.25);
  tone(1318, 0.3, 'sine', 0.2, 0.09);
}
function thud() {
  tone(70, 0.35, 'sine', 0.5);
}
function crashSound() {
  tone(55, 0.7, 'sawtooth', 0.4);
  tone(38, 0.9, 'square', 0.25, 0.05);
}

// --- ATC messages ---
function say(text, seconds = 4) {
  atcText = text;
  atcUntil = state.time + seconds;
  hud.setAtc(text);
}
function defaultAtc() {
  if (mission.ringIndex < sortie.rings.length) {
    return `EMBERLINE TOWER — FLY RING ${mission.ringIndex + 1} OF ${sortie.rings.length} · RWY ${sortie.landingRunway} AFTER`;
  }
  return `EMBERLINE TOWER — ALL RINGS CLEAR · CLEARED TO LAND RWY ${sortie.landingRunway}`;
}

// --- sortie lifecycle ---
function startSortie(index) {
  mission.sortieIndex = index;
  mission.ringIndex = 0;
  mission.ringsPassed = 0;
  mission.dropped = false;
  mission.dropResult = null;
  mission.sortieScore = 0;
  mission.debrief = null;
  sortie = SORTIES[index];
  state = createFlightState(sortie);
  const wind = windVector(sortie);
  state.windX = wind.x;
  state.windZ = wind.z;
  ringMeshes = world.buildRings(sortie.rings);
  setDusk(sortie.dusk === 1);
  stallWarnedAt = -10;
  fuelWarned = false;
  updateChaseCamera(state, 0, true);
  say(`EMBERLINE TOWER — SORTIE ${sortie.id} ${sortie.name} · ${sortie.brief}`, 6);
  if (sortie.windKt) say(`WIND ${sortie.windKt} KT FROM ${sortie.windFromDeg}° — EXPECT DRIFT ON FINAL`, 5);
}

function startRun() {
  mission = createMission();
  debriefs = [];
  startSortie(0);
  screen = 'play';
  hud.hideScreens();
  ensureAudio();
  announce('Flying. Sortie 1, First Light.');
}

function syncRings() {
  ringMeshes.forEach((mesh, i) => {
    mesh.material = i < mission.ringIndex ? world.ringMats.passed : i === mission.ringIndex ? world.ringMats.next : world.ringMats.upcoming;
  });
}

function announce(message) {
  status.textContent = message;
}

// --- main loop ---
let accumulator = 0;
let last = performance.now();

function stepGame(dt) {
  const actions = input.takeActions();
  if (actions & ACTION_MUTE) {
    muted = !muted;
    if (audio) audio.master.gain.value = muted ? 0 : 0.5;
    say(muted ? 'AUDIO MUTED' : 'AUDIO ON', 2);
  }
  if (actions & ACTION_PAUSE) {
    screen = 'pause';
    hud.showPause();
    return;
  }
  if (actions & ACTION_RESTART) {
    startRun();
    return;
  }
  const axes = input.axes();
  const flightInput = {
    pitch: axes.pitch,
    roll: axes.roll,
    throttleDelta: axes.throttleDelta,
    gearToggle: !!(actions & ACTION_GEAR),
    flapsToggle: !!(actions & ACTION_FLAPS),
  };
  const dropPressed = !!(actions & ACTION_DROP);
  const events = updateFlight(state, flightInput, dt, world.heightAt, sortie);
  const missionEvents = updateMission(mission, state, dropPressed);
  if (missionEvents.includes('ring')) {
    chime();
    const left = sortie.rings.length - mission.ringIndex;
    say(left > 0 ? `RING CLEAR — ${left} TO GO · +100 PTS · +3 FUEL` : 'ALL RINGS CLEAR — BRING HER HOME', 4);
  }
  if (missionEvents.includes('drop-ok')) {
    chime();
    say('SUPPLY DELIVERED TO THE LIGHTHOUSE — +200 PTS', 4);
  }
  if (missionEvents.includes('drop-miss')) {
    say('DROP MISSED THE ZONE — THE CRATE IS IN THE SEA', 4);
  }
  if (events & EVENT_STALL && state.time - stallWarnedAt > 4) {
    stallWarnedAt = state.time;
    say('STALL — NOSE DOWN, POWER UP', 3);
  }
  if (!fuelWarned && state.fuel < 25) {
    fuelWarned = true;
    say('FUEL LOW — LAND SOON OR DITCH', 5);
  }
  if (state.time > atcUntil) hud.setAtc(defaultAtc());
  if (events & EVENT_LANDED) {
    const debrief = finishSortie(mission, state, false);
    debriefs.push(debrief);
    thud();
    if (mission.score > readBest()) saveBest(mission.score);
    const isLast = mission.sortieIndex === SORTIES.length - 1;
    screen = 'debrief';
    hud.showDebrief(debrief, isLast);
    announce(`Landed. Grade ${debrief.grade}, ${debrief.points} points.`);
  } else if (events & EVENT_CRASH) {
    const debrief = finishSortie(mission, state, true);
    debriefs.push(debrief);
    crashSound();
    screen = 'over';
    hud.showGameOver(debrief, mission.score);
    announce('Aircraft down. Run over.');
  }
  syncRings();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, CONFIG.maxFrame);
  last = now;
  if (screen === 'play') {
    accumulator += dt;
    while (accumulator >= CONFIG.step) {
      stepGame(CONFIG.step);
      accumulator -= CONFIG.step;
      if (screen !== 'play') break;
    }
  } else if (screen === 'title') {
    // Idle drift on the title screen: the world lives behind the menu, and
    // the HUD shows the parked numbers so the tapes are not blank.
    world.update(dt, now / 1000);
    hud.update(state, mission, sortie, now, activeRing(mission) ? ringDistance(mission, state) : null);
  }
  if (screen === 'play' || screen === 'pause' || screen === 'debrief' || screen === 'over') {
    aircraft.pose(state, world.heightAt);
    updateChaseCamera(state, dt, false);
    world.update(dt, state.time);
    const ring = activeRing(mission);
    hud.update(state, mission, sortie, now, ring ? ringDistance(mission, state) : null);
    if (audio && !muted) {
      audio.osc.frequency.value = 50 + state.throttle * 42 + state.speed * 0.18;
      audio.eng.gain.value = screen === 'play' ? 0.02 + state.throttle * 0.05 : 0.0;
    }
  }
  renderer.render(scene, camera);
}

function handleConfirm() {
  if (screen === 'title') {
    startRun();
  } else if (screen === 'debrief') {
    const isLast = mission.sortieIndex === SORTIES.length - 1;
    if (isLast) {
      screen = 'run-complete';
      hud.showRunComplete(finalTally(mission, debriefs));
    } else {
      startSortie(mission.sortieIndex + 1);
      screen = 'play';
      hud.hideScreens();
    }
  } else if (screen === 'over' || screen === 'run-complete') {
    startRun();
  } else if (screen === 'pause') {
    screen = 'play';
    hud.hideScreens();
    // Flush actions pressed while paused: a stale PAUSE bit would otherwise
    // re-pause the game on the very next step.
    input.takeActions();
  }
}

// Pause when the tab hides mid-flight.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play') {
    screen = 'pause';
    hud.showPause();
  }
});

hud.startBtn.addEventListener('click', () => {
  ensureAudio();
  handleConfirm();
});
window.addEventListener('keydown', (e) => {
  // Enter/Space confirm on every non-play screen; P/Esc also resume from pause
  // (stepGame, the only ACTION_PAUSE reader, does not run while paused).
  const resume = e.code === 'Enter' || e.code === 'Space' ||
    (screen === 'pause' && (e.code === 'KeyP' || e.code === 'Escape'));
  if (screen !== 'play' && resume) {
    e.preventDefault();
    handleConfirm();
  }
});

// --- screenshot mode ---
if (shot) {
  const staged = stageShot(shot, world.heightAt, world.buildRings);
  state = staged.state;
  mission = staged.mission;
  sortie = staged.sortie;
  ringMeshes = staged.rings;
  setDusk(sortie.dusk === 1);
  syncRings();
  aircraft.pose(state, world.heightAt);
  updateChaseCamera(state, 0, true, staged.screen === 'title' ? 5 : 0);
  world.update(0, state.time);
  if (staged.screen === 'title') {
    hud.showTitle(readBest());
  } else {
    hud.hideScreens();
    hud.setAtc(defaultAtc());
    if (shot === 'landing') hud.setAtc(`EMBERLINE TOWER — FINAL RWY ${sortie.landingRunway} · CLEARED TO LAND · GEAR DOWN`);
  }
  hud.update(state, mission, sortie, performance.now(), activeRing(mission) ? ringDistance(mission, state) : null);
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
} else {
  hud.showTitle(readBest());
  updateChaseCamera(state, 0, true);
  announce('Emberline. Press Enter or click Start to fly.');
  requestAnimationFrame(frame);
}

// Test seam for the smoke test: no gameplay logic lives behind it.
window.__TEST__ = {
  ready: true,
  state: () => ({
    screen,
    sortie: sortie.id,
    ring: mission.ringIndex,
    score: mission.score,
    speed: Math.round(state.speed * 10) / 10,
    altitude: Math.round(state.y),
    fuel: Math.round(state.fuel),
    hull: Math.round(state.hull),
    crashed: state.crashed,
    landed: state.landed,
  }),
};
