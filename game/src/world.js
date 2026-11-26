// The world: a volcanic archipelago at golden hour, built from one seed.
// Terrain is an analytic height function (island domes + a volcano cone +
// seeded noise), so heightAt() is exact everywhere — the flight model, the
// trees and the mesh all agree. Nothing here is copied from any repo.
import * as THREE from 'three';
import { CONFIG, RUNWAY } from './config.js';
import { makeNoise2D, mulberry32, bump, clamp } from './random.js';

const VOLCANO = { x: -260, z: -350, radius: 420, height: 165, craterRadius: 120, craterDepth: 25 };
const ISLANDS = [
  { x: 0, z: -100, radius: 950, height: 26 },
  { x: 980, z: -720, radius: 380, height: 42 },
  { x: -880, z: 720, radius: 300, height: 38 },
];
const LIGHTHOUSE = { x: 980, z: -950 };

function domeHeight(x, z, island) {
  const dx = x - island.x;
  const dz = z - island.z;
  const d = Math.hypot(dx, dz);
  if (d >= island.radius) return 0;
  const t = 1 - (d * d) / (island.radius * island.radius);
  return island.height * t * t * (3 - 2 * t);
}

export function makeHeightAt(seed) {
  const { fbm } = makeNoise2D(seed + 7);
  return function heightAt(x, z) {
    let h = 0;
    for (const island of ISLANDS) h += domeHeight(x, z, island);
    const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    if (dv < VOLCANO.radius) h += VOLCANO.height * bump(dv, VOLCANO.radius);
    if (dv < VOLCANO.craterRadius) h -= VOLCANO.craterDepth * bump(dv, VOLCANO.craterRadius);
    if (h > 0.5) {
      // Roughness grows with altitude, fades to nothing at the shoreline.
      h += fbm(x / 260, z / 260, 3) * 6 * Math.min(1, h / 20);
    }
    // Flatten the runway strip into the coastal plain.
    const rx = Math.abs(x - RUNWAY.cx);
    const rz = Math.abs(z - RUNWAY.cz);
    if (rx < 330 && rz < 84) {
      const fx = 1 - clamp((rx - 260) / 70, 0, 1);
      const fz = 1 - clamp((rz - 14) / 70, 0, 1);
      const f = Math.min(fx, fz);
      if (f > 0) h = h * (1 - f) + RUNWAY.elevation * f;
    }
    return h;
  };
}

// Paint the terrain mesh by height and slope: sand, grass, rock, basalt.
function terrainColor(h, noiseVal, out) {
  if (h < 0.5) out.setHex(0x3d6b52); // seabed, seen through the water
  else if (h < 3.5) out.setHex(0xd9b380); // beach sand
  else if (h < 55) out.setHex(0x5d8a3c); // lowland green
  else if (h < 120) out.setHex(0x7a6a58); // rock
  else out.setHex(0x4a4038); // basalt
  const shade = 0.92 + noiseVal * 0.08;
  out.multiplyScalar(shade);
  return out;
}

function makeNumberTexture(text, fg = '#ffffff', bg = 'rgba(0,0,0,0)') {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = fg;
  g.font = 'bold 84px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld(scene, seed) {
  const heightAt = makeHeightAt(seed);
  const rng = mulberry32(seed + 31);
  const { fbm } = makeNoise2D(seed + 13);
  const group = new THREE.Group();
  scene.add(group);

  // --- terrain ---
  const SEG = 128;
  const size = CONFIG.worldSize;
  const geo = new THREE.PlaneGeometry(size, size, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    terrainColor(h, fbm(x / 180, z / 180, 2), col);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }),
  );
  terrain.name = 'terrain';
  group.add(terrain);

  // --- sea ---
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 2.4, size * 2.4),
    new THREE.MeshStandardMaterial({ color: 0x2e7f8a, transparent: true, opacity: 0.82, roughness: 0.32, metalness: 0.08 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0.4;
  sea.name = 'sea';
  group.add(sea);

  // --- runway ---
  const runwayGroup = new THREE.Group();
  runwayGroup.position.set(RUNWAY.cx, RUNWAY.elevation, RUNWAY.cz);
  const asphalt = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.length, 0.6, RUNWAY.width),
    new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.9 }),
  );
  asphalt.position.y = 0.3;
  runwayGroup.add(asphalt);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf2f2e8 });
  for (let x = -RUNWAY.length / 2 + 30; x < RUNWAY.length / 2 - 20; x += 48) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(18, 0.12, 1.4), dashMat);
    dash.position.set(x, 0.66, 0);
    runwayGroup.add(dash);
  }
  // Threshold bars + runway numbers.
  for (const end of [-1, 1]) {
    for (let k = -2; k <= 2; k += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(10, 0.12, 2.2), dashMat);
      bar.position.set(end * (RUNWAY.length / 2 - 16), 0.66, k * 4.6);
      runwayGroup.add(bar);
    }
    const label = end < 0 ? '09' : '27';
    const tex = makeNumberTexture(label);
    const num = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 13),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    num.rotation.x = -Math.PI / 2;
    num.rotation.z = end < 0 ? 0 : Math.PI;
    num.position.set(end * (RUNWAY.length / 2 - 52), 0.68, 0);
    runwayGroup.add(num);
  }
  // Edge lights and PAPI.
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  const edgeGeo = new THREE.SphereGeometry(0.55, 6, 6);
  for (let x = -RUNWAY.length / 2 + 10; x <= RUNWAY.length / 2 - 10; x += 40) {
    for (const z of [-RUNWAY.width / 2 - 1.5, RUNWAY.width / 2 + 1.5]) {
      const light = new THREE.Mesh(edgeGeo, edgeMat);
      light.position.set(x, 0.9, z);
      runwayGroup.add(light);
    }
  }
  const papiRed = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const papiWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  // PAPI at both ends: west end serves RWY 09 (left side, north), east end
  // serves RWY 27 (left side, south).
  for (let i = 0; i < 4; i += 1) {
    const boxW = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.4), i < 2 ? papiRed : papiWhite);
    boxW.position.set(-RUNWAY.length / 2 + 34, 0.9, -RUNWAY.width / 2 - 9 - i * 3.4);
    runwayGroup.add(boxW);
    const boxE = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.4), i < 2 ? papiRed : papiWhite);
    boxE.position.set(RUNWAY.length / 2 - 34, 0.9, RUNWAY.width / 2 + 9 + i * 3.4);
    runwayGroup.add(boxE);
  }
  group.add(runwayGroup);

  // --- windsock beside the threshold ---
  const sockPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 9, 6),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6 }),
  );
  sockPole.position.set(RUNWAY.cx - RUNWAY.length / 2 - 24, RUNWAY.elevation + 4.5, RUNWAY.cz - 22);
  group.add(sockPole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 4.4, 8),
    new THREE.MeshStandardMaterial({ color: 0xff6b35, roughness: 0.7 }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(RUNWAY.cx - RUNWAY.length / 2 - 22, RUNWAY.elevation + 8.6, RUNWAY.cz - 22);
  group.add(sock);

  // --- lighthouse on the north island ---
  const lhBase = heightAt(LIGHTHOUSE.x, LIGHTHOUSE.z);
  const lh = new THREE.Group();
  lh.position.set(LIGHTHOUSE.x, lhBase, LIGHTHOUSE.z);
  const bandWhite = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.7 });
  const bandRed = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.7 });
  let y = 0;
  for (let i = 0; i < 4; i += 1) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(3.4 - i * 0.35, 3.8 - i * 0.35, 5.5, 10), i % 2 ? bandRed : bandWhite);
    seg.position.y = y + 2.75;
    lh.add(seg);
    y += 5.5;
  }
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
  );
  lamp.position.y = y + 2;
  lh.add(lamp);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeNumberTexture('●', '#ffe9a8'), transparent: true, opacity: 0.85, depthWrite: false }));
  glow.scale.set(14, 14, 1);
  glow.position.y = y + 2;
  lh.add(glow);
  group.add(lh);

  // --- palms (instanced) and volcanic rocks (instanced) ---
  const palmSpots = [];
  let guard = 0;
  while (palmSpots.length < 320 && guard < 6000) {
    guard += 1;
    const x = (rng() - 0.5) * 2200;
    const z = (rng() - 0.5) * 2200;
    const h = heightAt(x, z);
    if (h < 4 || h > 45) continue;
    if (Math.abs(x - RUNWAY.cx) < 340 && Math.abs(z - RUNWAY.cz) < 90) continue;
    palmSpots.push({ x, z, h, s: 0.8 + rng() * 0.5, r: rng() * Math.PI * 2 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 7, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const canopyGeo = new THREE.IcosahedronGeometry(2.7, 0);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x3f7a2e, flatShading: true, roughness: 0.9 });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, palmSpots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const sc = new THREE.Vector3();
  palmSpots.forEach((p, i) => {
    eul.set(0, p.r, 0);
    q.setFromEuler(eul);
    sc.set(p.s, p.s, p.s);
    m4.compose(new THREE.Vector3(p.x, p.h + 3.5 * p.s, p.z), q, sc);
    trunks.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(p.x, p.h + (7.4 * p.s), p.z), q, new THREE.Vector3(p.s, p.s * 0.62, p.s));
    canopies.setMatrixAt(i, m4);
  });
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  group.add(trunks);
  group.add(canopies);

  const rockSpots = [];
  guard = 0;
  while (rockSpots.length < 90 && guard < 4000) {
    guard += 1;
    const a = rng() * Math.PI * 2;
    const r = 60 + rng() * 380;
    const x = VOLCANO.x + Math.cos(a) * r;
    const z = VOLCANO.z + Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < 55) continue;
    rockSpots.push({ x, z, h, s: 1 + rng() * 3.2, r: rng() * Math.PI });
  }
  const rockGeo = new THREE.IcosahedronGeometry(1.6, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a332c, flatShading: true, roughness: 1 });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockSpots.length);
  rockSpots.forEach((p, i) => {
    eul.set(0, p.r, 0);
    q.setFromEuler(eul);
    m4.compose(new THREE.Vector3(p.x, p.h + 0.4, p.z), q, new THREE.Vector3(p.s, p.s * 0.7, p.s));
    rocks.setMatrixAt(i, m4);
  });
  rocks.instanceMatrix.needsUpdate = true;
  group.add(rocks);

    // --- clouds: flat low-poly puffs drifting east. Unlit warm white so they
  // read as cloud, never as rock, against the ember sky. ---
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffe8d8, transparent: true, opacity: 0.75 });
  const clouds = [];
  for (let i = 0; i < 12; i += 1) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(26 + rng() * 22, 0), cloudMat);
    puff.scale.y = 0.28;
    puff.position.set((rng() - 0.5) * 2400, 270 + rng() * 110, (rng() - 0.5) * 2400);
    puff.userData.drift = 1.5 + rng() * 1.5;
    group.add(puff);
    clouds.push(puff);
  }

  // --- rings ---
  const ringGroup = new THREE.Group();
  group.add(ringGroup);
  const ringGeo = new THREE.TorusGeometry(13, 1.15, 10, 30);
  const ringMats = {
    next: new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff7a1a, emissiveIntensity: 2.2, roughness: 0.4 }),
    upcoming: new THREE.MeshStandardMaterial({ color: 0x2a9df4, emissive: 0x2a9df4, emissiveIntensity: 0.9, roughness: 0.4 }),
    passed: new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x2ecc71, emissiveIntensity: 0.35, roughness: 0.4 }),
  };
  function buildRings(ringDefs) {
    ringGroup.clear();
    const meshes = [];
    const prev = new THREE.Vector3(0, 0, 0);
    ringDefs.forEach((def, i) => {
      const mesh = new THREE.Mesh(ringGeo, ringMats.upcoming);
      mesh.position.set(def.x, def.y, def.z);
      const from = i === 0 ? new THREE.Vector3(-650, 300, -100) : new THREE.Vector3(ringDefs[i - 1].x, ringDefs[i - 1].y, ringDefs[i - 1].z);
      mesh.lookAt(from);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeNumberTexture(String(i + 1), '#ffffff'), transparent: true, depthWrite: false }));
      label.scale.set(11, 11, 1);
      label.position.y = -19;
      mesh.add(label);
      ringGroup.add(mesh);
      meshes.push(mesh);
    });
    return meshes;
  }

  function update(dt, time) {
    for (const c of clouds) {
      c.position.x += c.userData.drift * dt;
      if (c.position.x > 1400) c.position.x = -1400;
    }
    // Gentle pulse on the next ring so the target reads at a glance.
    const t = 1.6 + Math.sin(time * 3.2) * 0.7;
    ringMats.next.emissiveIntensity = t;
  }

  return { heightAt, buildRings, ringMats, update, group };
}
