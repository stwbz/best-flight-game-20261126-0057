// DOM HUD: speed tape, altitude tape, compass strip, attitude indicator,
// minimap radar, mission panel, fuel/hull/throttle bars, ATC bar, and the
// title / pause / game-over / debrief screens. Canvas tapes redraw only when
// their rounded value changes, so the HUD costs almost nothing per frame.
import { CONFIG, RUNWAY } from './config.js';

const KT = 1.94384; // m/s to knots
const FT = 3.28084; // m to feet

function el(tag, cls, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}

function makeCanvas(w, h, cls, parent) {
  const c = el('canvas', cls, parent);
  c.width = w;
  c.height = h;
  return c;
}

export function createHUD(root, heightAt) {
  const hud = el('div', 'hud', root);

  // --- top-left: mission panel ---
  const missionPanel = el('div', 'panel mission', hud);
  const missionTitle = el('div', 'mission-title', missionPanel);
  const missionLine = el('div', 'mission-line', missionPanel);
  const missionScore = el('div', 'mission-score', missionPanel);

  // --- top-center: compass ---
  const compass = makeCanvas(420, 40, 'compass', hud);
  const compassCtx = compass.getContext('2d');

  // --- left: speed tape; right: altitude tape ---
  const speedTape = makeCanvas(74, 240, 'tape speed', hud);
  const speedCtx = speedTape.getContext('2d');
  const altTape = makeCanvas(74, 240, 'tape alt', hud);
  const altCtx = altTape.getContext('2d');

  // --- bottom-left: attitude indicator + bars ---
  const leftBottom = el('div', 'left-bottom', hud);
  const attitude = makeCanvas(124, 124, 'attitude', leftBottom);
  const attCtx = attitude.getContext('2d');
  const bars = el('div', 'bars', leftBottom);
  const thrBar = barRow(bars, 'THR');
  const fuelBar = barRow(bars, 'FUEL');
  const hullBar = barRow(bars, 'HULL');

  // --- bottom-right: minimap radar ---
  const radar = makeCanvas(176, 176, 'radar', hud);
  const radarCtx = radar.getContext('2d');
  const radarLabel = el('div', 'radar-label', hud);
  radarLabel.textContent = 'TAC MAP';

  // --- bottom-center: ATC bar ---
  const atc = el('div', 'atc', hud);

  // --- centre: flight-path marker ---
  const fpm = el('div', 'fpm', hud);

  // --- screens ---
  const titleScreen = el('div', 'screen title-screen', hud);
  titleScreen.innerHTML = `
    <h1>EMBERLINE</h1>
    <h2>Volcano Island Airlift</h2>
    <p class="story">Golden hour over the Emberline archipelago. Fly the supply
    run — thread the rings, mind your fuel, and bring her home on RWY 27.</p>
    <div class="controls">
      <span><b>↑ / W</b> climb</span><span><b>↓ / S</b> descend</span>
      <span><b>← → / A D</b> bank</span><span><b>Shift / Ctrl</b> throttle</span>
      <span><b>G</b> gear</span><span><b>F</b> drop supply</span>
      <span><b>P</b> pause</span><span><b>R</b> restart</span>
    </div>
    <button class="big-btn" id="start-btn">START SORTIE 1 — FIRST LIGHT</button>
    <p class="best" id="best-line"></p>`;
  const pauseScreen = el('div', 'screen pause-screen', hud);
  pauseScreen.innerHTML = `<h1>PAUSED</h1><p>Press P or Enter to keep flying.</p>`;
  const overScreen = el('div', 'screen over-screen', hud);
  const debriefScreen = el('div', 'screen debrief-screen', hud);

  // Pre-render the minimap landmass once (deterministic from heightAt).
  const mapBase = document.createElement('canvas');
  mapBase.width = 176;
  mapBase.height = 176;
  const mapCtx = mapBase.getContext('2d');
  mapCtx.fillStyle = '#0a2030';
  mapCtx.fillRect(0, 0, 176, 176);
  const S = CONFIG.worldSize;
  for (let py = 0; py < 88; py += 1) {
    for (let px = 0; px < 88; px += 1) {
      const x = (px / 88 - 0.5) * S;
      const z = (py / 88 - 0.5) * S;
      const h = heightAt(x, z);
      if (h > 0.5) {
        mapCtx.fillStyle = h > 55 ? '#6b5a48' : '#3f7a2e';
        mapCtx.fillRect(px * 2, py * 2, 2, 2);
      }
    }
  }
  // Runway on the map.
  mapCtx.fillStyle = '#e8e8e8';
  const rwx = ((RUNWAY.cx + S / 2) / S) * 176;
  const rwz = ((RUNWAY.cz + S / 2) / S) * 176;
  mapCtx.fillRect(rwx - 17, rwz - 1, 34, 2);

  const cache = { speed: -1, alt: -1, heading: -1, pitch: 999, bank: 999, thr: -1, fuel: -1, hull: -1, ring: -1, msg: '' };
  let radarTimer = -1000;
  let missionLineTimer = -1000;

  function barRow(parent, label) {
    const row = el('div', 'bar-row', parent);
    const lab = el('span', 'bar-label', row);
    lab.textContent = label;
    const track = el('div', 'bar-track', row);
    const fill = el('div', 'bar-fill', track);
    const val = el('span', 'bar-val', row);
    return { fill, val };
  }

  function drawTape(ctx, w, h, value, step, unit, color) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8, 18, 26, 0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    const mid = h / 2;
    const pxPerUnit = 2.4;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const first = Math.floor((value - mid / pxPerUnit) / step) * step;
    for (let v = first; v < value + mid / pxPerUnit + step; v += step) {
      const y = mid - (v - value) * pxPerUnit;
      if (y < 4 || y > h - 4) continue;
      const major = v % (step * 5) === 0;
      ctx.strokeStyle = major ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(major ? 14 : 8, y);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#e8f2f5';
        ctx.fillText(String(Math.round(v)), 18, y + 4);
      }
    }
    // Current value box.
    ctx.fillStyle = color;
    ctx.fillRect(0, mid - 13, w, 26);
    ctx.fillStyle = '#08121a';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(value)), w / 2, mid + 5);
    ctx.fillStyle = '#9fb8c4';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText(unit, w / 2, h - 6);
  }

  function drawCompass(headingDeg) {
    const w = 420;
    const h = 40;
    const ctx = compassCtx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8, 18, 26, 0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const pxPerDeg = 3;
    const start = Math.floor((headingDeg - w / 2 / pxPerDeg) / 10) * 10;
    for (let d = start; d < headingDeg + w / 2 / pxPerDeg + 10; d += 5) {
      const dd = ((d % 360) + 360) % 360;
      const x = w / 2 + (d - headingDeg) * pxPerDeg;
      if (x < 0 || x > w) continue;
      const major = dd % 30 === 0;
      ctx.strokeStyle = major ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.moveTo(x, major ? 14 : 22);
      ctx.lineTo(x, 30);
      ctx.stroke();
      if (major) {
        const label = dd === 0 ? 'N' : dd === 90 ? 'E' : dd === 180 ? 'S' : dd === 270 ? 'W' : String(dd / 10);
        ctx.fillStyle = '#e8f2f5';
        ctx.fillText(label, x, 12);
      }
    }
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 6, 30);
    ctx.lineTo(w / 2 + 6, 30);
    ctx.lineTo(w / 2, 38);
    ctx.fill();
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 13px system-ui, sans-serif';
    // Opaque chip behind the readout so tick labels never show through it.
    const label = String(Math.round(headingDeg)).padStart(3, '0') + '°';
    const lw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(8, 18, 26, 0.9)';
    ctx.fillRect(w / 2 - lw / 2 - 5, 1, lw + 10, 16);
    ctx.fillStyle = '#ffb347';
    ctx.fillText(label, w / 2, 13);
  }

  function drawAttitude(pitch, bank) {
    const s = 124;
    const ctx = attCtx;
    const cx = s / 2;
    const cy = s / 2;
    const r = 56;
    ctx.clearRect(0, 0, s, s);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-bank);
    const pitchPx = pitch * 90;
    ctx.fillStyle = '#3a7bd5';
    ctx.fillRect(-r, -r - pitchPx, r * 2, r + pitchPx);
    ctx.fillStyle = '#8a6a45';
    ctx.fillRect(-r, -pitchPx, r * 2, r + pitchPx);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, -pitchPx);
    ctx.lineTo(r, -pitchPx);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed wings marker.
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy);
    ctx.lineTo(cx - 12, cy);
    ctx.moveTo(cx + 12, cy);
    ctx.lineTo(cx + 34, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy + 4);
    ctx.stroke();
  }

  function drawRadar(state, mission, sortie) {
    const ctx = radarCtx;
    ctx.clearRect(0, 0, 176, 176);
    ctx.drawImage(mapBase, 0, 0);
    const toMap = (x, z) => [((x + S / 2) / S) * 176, ((z + S / 2) / S) * 176];
    // Rings.
    sortie.rings.forEach((ring, i) => {
      const [mx, mz] = toMap(ring.x, ring.z);
      ctx.beginPath();
      ctx.arc(mx, mz, 4, 0, Math.PI * 2);
      if (i < mission.ringIndex) {
        ctx.fillStyle = '#2ecc71';
        ctx.fill();
      } else if (i === mission.ringIndex) {
        ctx.strokeStyle = '#ff7a1a';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(42,157,244,0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
    // Drop zone.
    if (sortie.dropZone) {
      const [mx, mz] = toMap(sortie.dropZone.x, sortie.dropZone.z);
      ctx.strokeStyle = '#ffd23f';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(mx, mz, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Aircraft triangle, pointing along heading.
    const [px, pz] = toMap(state.x, state.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(state.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function setBar(bar, frac, text) {
    const pct = Math.round(frac * 100);
    bar.fill.style.width = `${pct}%`;
    bar.fill.style.background = frac < 0.22 ? '#ff453a' : frac < 0.45 ? '#ffb347' : '#2ecc71';
    bar.val.textContent = text;
  }

  function update(state, mission, sortie, nowMs, nextRingDist) {
    const nextRingDistText = nextRingDist === null ? '' : `${Math.round(nextRingDist)} M`;
    const speedKt = state.speed * KT;
    const altFt = Math.max(0, state.y * FT);
    const headingDeg = ((state.heading / Math.PI) * 180 % 360 + 360) % 360;
    const speedR = Math.round(speedKt);
    const altR = Math.round(altFt / 10) * 10;
    const headR = Math.round(headingDeg);
    if (speedR !== cache.speed) {
      cache.speed = speedR;
      drawTape(speedCtx, 74, 240, speedKt, 10, 'KT', '#ffb347');
    }
    if (altR !== cache.alt) {
      cache.alt = altR;
      drawTape(altCtx, 74, 240, altFt, 100, 'FT', '#2a9df4');
    }
    if (headR !== cache.heading) {
      cache.heading = headR;
      drawCompass(headingDeg);
    }
    if (Math.abs(state.pitch - cache.pitch) > 0.01 || Math.abs(state.bank - cache.bank) > 0.01) {
      cache.pitch = state.pitch;
      cache.bank = state.bank;
      drawAttitude(state.pitch, state.bank);
    }
    const thrR = Math.round(state.throttle * 20);
    if (thrR !== cache.thr) {
      cache.thr = thrR;
      setBar(thrBar, state.throttle, `${Math.round(state.throttle * 100)}%`);
    }
    const fuelR = Math.round(state.fuel);
    if (fuelR !== cache.fuel) {
      cache.fuel = fuelR;
      setBar(fuelBar, state.fuel / CONFIG.fuelMax, `${fuelR}`);
    }
    const hullR = Math.round(state.hull);
    if (hullR !== cache.hull) {
      cache.hull = hullR;
      setBar(hullBar, state.hull / CONFIG.hullMax, `${hullR}%`);
    }
    if (mission.ringIndex !== cache.ring) {
      cache.ring = mission.ringIndex;
      const total = sortie.rings.length;
      missionTitle.textContent = `SORTIE ${sortie.id} — ${sortie.name} · ${sortie.title}`;
    }
    // Mission line refreshes twice a second so the distance stays live.
    if (nowMs - missionLineTimer > 500) {
      missionLineTimer = nowMs;
      const total = sortie.rings.length;
      missionLine.textContent = mission.ringIndex >= total
        ? 'ALL RINGS CLEAR — LAND RWY ' + sortie.landingRunway
        : `RING ${mission.ringIndex + 1}/${total} · ${nextRingDistText} TO TARGET`;
    }
    missionScore.textContent = `PTS ${mission.score} · TIME ${fmtTime(state.time)}${sortie.windKt ? ` · WIND ${sortie.windKt}KT` : ''}`;
    if (nowMs - radarTimer > 120) {
      radarTimer = nowMs;
      drawRadar(state, mission, sortie);
    }
  }

  function fmtTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function setAtc(text) {
    if (text === cache.msg) return;
    cache.msg = text;
    atc.textContent = text;
  }

  function showOnly(screen) {
    for (const s of [titleScreen, pauseScreen, overScreen, debriefScreen]) {
      s.style.display = s === screen ? 'flex' : 'none';
    }
    // The title screen is a poster over the live world: hide the flight HUD
    // chrome behind it so the title reads clean.
    hud.classList.toggle('title-mode', screen === titleScreen);
  }
  function hideScreens() {
    showOnly(null);
  }
  function showTitle(best) {
    showOnly(titleScreen);
    const bestLine = titleScreen.querySelector('#best-line');
    if (bestLine) bestLine.textContent = best > 0 ? `Best run: ${best} pts` : 'First flight — the islands are waiting.';
  }
  function showPause() {
    showOnly(pauseScreen);
  }
  function showGameOver(debrief, totalScore) {
    showOnly(overScreen);
    overScreen.innerHTML = `<h1>${debrief.crashed ? 'AIRCRAFT DOWN' : 'SORTIE FAILED'}</h1>
      <p>${debrief.crashed ? 'The airframe is lost in the archipelago. The run ends here.' : 'The sortie ended before the runway.'}</p>
      <p class="score-line">SCORE ${totalScore} PTS</p>
      <p>Press R or Enter to fly again.</p>`;
  }
  function showDebrief(debrief, isLast) {
    showOnly(debriefScreen);
    debriefScreen.innerHTML = `<h1>SORTIE ${debrief.sortie} — ${debrief.grade}</h1>
      <p class="score-line">${debrief.name} · ${debrief.title}</p>
      <p>Rings ${debrief.rings} · Landing ${debrief.grade} · Fuel left ${debrief.fuelLeft}</p>
      ${debrief.drop ? `<p>Drop: ${debrief.drop}</p>` : ''}
      <p class="score-line">+${debrief.points} PTS</p>
      <p>${isLast ? 'Run complete — press Enter for the final tally.' : 'Press Enter for the next sortie.'}</p>`;
  }
  function showRunComplete(tally) {
    showOnly(debriefScreen);
    debriefScreen.innerHTML = `<h1>${tally.title}</h1>
      <p class="score-line">TOTAL ${tally.total} PTS</p>
      <p>Landings: ${tally.grades.join(' · ')}</p>
      <p>Perfect landings: ${tally.perfects} / 3</p>
      <p>Press R or Enter to fly the run again.</p>`;
  }

  const startBtn = titleScreen.querySelector('#start-btn');
  return {
    update,
    setAtc,
    hideScreens,
    showTitle,
    showPause,
    showGameOver,
    showDebrief,
    showRunComplete,
    startBtn,
    root: hud,
  };
}
