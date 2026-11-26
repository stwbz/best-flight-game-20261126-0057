// Emberline — Volcano Island Airlift. All tunable gameplay constants in one
// place. Units are metres, seconds, metres per second, degrees where noted.
export const CONFIG = {
  seed: 20261126,
  // --- world ---
  worldSize: 2600, // terrain spans -1300..1300 on x and z
  seaLevel: 0,
  // --- flight model ---
  maxThrustAccel: 26, // m/s^2 at full throttle
  dragK: 0.0022, // quadratic drag coefficient
  dragBase: 1.2, // base drag (m/s^2)
  stallSpeed: 22, // m/s; below this the wing stops flying
  maxSpeed: 98,
  climbAuthority: 1.0,
  turnAuthority: 1.0,
  pitchRate: 0.55, // rad/s at full input
  rollRate: 1.1, // rad/s at full input
  maxBank: 1.05, // rad (~60 deg)
  maxPitch: 0.5, // rad
  gravity: 9.81,
  // --- fuel / hull ---
  fuelMax: 100,
  fuelBurnBase: 0.1, // per second
  fuelBurnThrottle: 0.5, // per second at full throttle
  fuelRingBonus: 3,
  hullMax: 100,
  // --- landing ---
  runwayHeadingDeg: 90, // RWY 09/27: either direction grades (see headingAligned)
  landingPerfectVs: 2.5, // max |vertical speed| m/s for PERFECT
  landingGoodVs: 4.0,
  landingHardVs: 6.0,
  landingCrashVs: 8.0,
  // --- scoring ---
  ringPoints: 100,
  landingPerfect: 500,
  landingGood: 300,
  landingHard: 100,
  sortieBonus: 250,
  fuelBonusPerUnit: 2,
  // --- camera ---
  chaseDistance: 15,
  chaseHeight: 4.6,
  chaseSmooth: 4.2, // 1/s lerp rate
  fovBase: 60,
  fovSpeed: 72,
  // --- loop ---
  step: 1 / 60,
  maxFrame: 0.25,
};

// Runway geometry (metres). Centre (430, 120), heading east-west.
export const RUNWAY = {
  cx: 430,
  cz: 120,
  length: 520,
  width: 28,
  elevation: 6,
  headingDeg: 90,
};

// Sortie definitions. Rings are {x, y, z} in world metres; the drop zone is
// only used by sortie 3.
export const SORTIES = [
  {
    id: 1,
    name: 'FIRST LIGHT',
    title: 'Lagoon Run',
    brief: 'Fly the lagoon circuit — 5 rings — then land RWY 27. Calm air, full tanks.',
    windKt: 0,
    windFromDeg: 0,
    fuel: 100,
    dusk: 0,
    start: { x: -650, y: 300, z: 350, headingDeg: 131, speed: 55 },
    rings: [
      { x: 150, y: 60, z: -350 },
      { x: 450, y: 70, z: -600 },
      { x: 700, y: 80, z: -200 },
      { x: 400, y: 60, z: 250 },
      { x: 0, y: 55, z: 500 },
    ],
    landingRunway: '27',
  },
  {
    id: 2,
    name: 'RIDGE CROSSWIND',
    title: 'Volcano Circuit',
    brief: 'Seven rings around the cone in a 12 kt crosswind. Land RWY 27 — downwind leg, watch the drift.',
    windKt: 12,
    windFromDeg: 315,
    fuel: 100,
    dusk: 0,
    start: { x: -900, y: 320, z: 300, headingDeg: 163, speed: 55 },
    rings: [
      { x: -700, y: 150, z: -350 },
      { x: -260, y: 190, z: -780 },
      { x: 180, y: 170, z: -620 },
      { x: 260, y: 150, z: -160 },
      { x: -40, y: 180, z: 60 },
      { x: -620, y: 160, z: 120 },
      { x: -800, y: 140, z: -200 },
    ],
    landingRunway: '27',
  },
  {
    id: 3,
    name: 'EMBER RUN',
    title: 'Lighthouse Drop',
    brief: 'Eight rings out to the lighthouse. Press F over the drop zone to release the supply crate, then land RWY 27 at dusk.',
    windKt: 6,
    windFromDeg: 200,
    fuel: 110,
    dusk: 1,
    start: { x: -650, y: 300, z: 350, headingDeg: 131, speed: 55 },
    rings: [
      { x: 100, y: 70, z: -400 },
      { x: 480, y: 90, z: -550 },
      { x: 760, y: 80, z: -260 },
      { x: 900, y: 100, z: -500 },
      { x: 1080, y: 90, z: -720 },
      { x: 980, y: 110, z: -900 },
      { x: 700, y: 90, z: -850 },
      { x: 420, y: 70, z: -600 },
    ],
    dropZone: { x: 980, y: 90, z: -720, radius: 80 },
    landingRunway: '27',
  },
];

export const DEG = Math.PI / 180;
