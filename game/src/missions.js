// Missions: three sorties, each with its own rings, wind and landing. The
// mission owns the score and the ring state; the flight model owns the
// aircraft. Ring passes are distance checks against the active ring.
import { CONFIG, SORTIES } from './config.js';

export const RING_RADIUS = 24; // pass when the aircraft is this close to centre
export const RING_TORUS = 13; // visual torus radius, for reference

export function createMission() {
  return {
    sortieIndex: 0,
    ringIndex: 0,
    score: 0,
    ringsPassed: 0,
    dropped: false,
    dropResult: null,
    sortieScore: 0,
    debrief: null, // { grade, points, fuelLeft } once landed or crashed
    done: false,
    totalGrade: null,
  };
}

export function currentSortie(mission) {
  return SORTIES[mission.sortieIndex];
}

export function activeRing(mission) {
  const sortie = currentSortie(mission);
  if (mission.ringIndex >= sortie.rings.length) return null;
  return sortie.rings[mission.ringIndex];
}

// Distance from the aircraft to the active ring centre.
export function ringDistance(mission, state) {
  const ring = activeRing(mission);
  if (!ring) return Infinity;
  const dx = state.x - ring.x;
  const dy = state.y - ring.y;
  const dz = state.z - ring.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Check the active ring and the drop zone. Returns a list of event names
// ('ring', 'drop-ok', 'drop-miss') for the frame.
export function updateMission(mission, state, dropPressed) {
  const events = [];
  const sortie = currentSortie(mission);
  const ring = activeRing(mission);
  if (ring && ringDistance(mission, state) <= RING_RADIUS) {
    mission.ringIndex += 1;
    mission.ringsPassed += 1;
    mission.score += CONFIG.ringPoints;
    mission.sortieScore += CONFIG.ringPoints;
    state.fuel = Math.min(sortie.fuel, state.fuel + CONFIG.fuelRingBonus);
    events.push('ring');
  }
  if (sortie.dropZone && !mission.dropped && dropPressed) {
    mission.dropped = true;
    const dx = state.x - sortie.dropZone.x;
    const dz = state.z - sortie.dropZone.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const ok = dist <= sortie.dropZone.radius && state.y >= 40 && state.y <= 160;
    mission.dropResult = ok ? 'SUPPLY DELIVERED' : 'DROP MISSED';
    if (ok) {
      mission.score += 200;
      mission.sortieScore += 200;
      events.push('drop-ok');
    } else {
      events.push('drop-miss');
    }
  }
  return events;
}

export function allRingsDone(mission) {
  return mission.ringIndex >= currentSortie(mission).rings.length;
}

// Called once when a sortie ends (landed or crashed). Returns the debrief.
export function finishSortie(mission, state, crashed) {
  const sortie = currentSortie(mission);
  let points = 0;
  let grade = 'CRASH';
  if (!crashed && state.landedGrade) {
    grade = state.landedGrade.grade;
    points += state.landedGrade.points;
    if (allRingsDone(mission)) points += CONFIG.sortieBonus;
    points += Math.round(state.fuel) * CONFIG.fuelBonusPerUnit;
  }
  mission.score += points;
  mission.sortieScore += points;
  mission.debrief = {
    sortie: sortie.id,
    name: sortie.name,
    title: sortie.title,
    grade,
    points,
    rings: `${mission.ringsPassed}/${sortie.rings.length}`,
    fuelLeft: Math.round(state.fuel),
    drop: mission.dropResult,
    crashed,
  };
  return mission.debrief;
}

// Advance to the next sortie. Returns the next sortie, or null when the run
// is complete.
export function nextSortie(mission) {
  if (mission.sortieIndex + 1 >= SORTIES.length) {
    mission.done = true;
    return null;
  }
  mission.sortieIndex += 1;
  mission.ringIndex = 0;
  mission.ringsPassed = 0;
  mission.dropped = false;
  mission.dropResult = null;
  mission.sortieScore = 0;
  mission.debrief = null;
  return SORTIES[mission.sortieIndex];
}

// Final tally once all three sorties are done.
export function finalTally(mission, debriefs) {
  const grades = debriefs.map((d) => d.grade);
  const total = mission.score;
  const perfects = grades.filter((g) => g === 'PERFECT').length;
  const title = perfects === 3 ? 'ACE OF EMBERLINE' : total >= 2200 ? 'ISLAND VETERAN' : total >= 1400 ? 'SUPPLY PILOT' : 'ROOKIE WINGS';
  return { total, grades, perfects, title };
}
