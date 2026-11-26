// The aircraft: a cream-and-red bush plane built from primitives — a
// fuselage, wings, tail, a spinning prop, gear that comes up and down, and
// nav lights. One shared material set, no per-frame allocations.
import * as THREE from 'three';

const CREAM = 0xf3ead8;
const RED = 0xc23b2e;
const DARK = 0x2b2f36;
const GLASS = 0x1d2b33;

export function buildAircraft() {
  const group = new THREE.Group();
  group.name = 'aircraft';
  const cream = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.55, metalness: 0.15, flatShading: true });
  const red = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.55, metalness: 0.15, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.7, metalness: 0.3, flatShading: true });
  const glass = new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.15, metalness: 0.6, flatShading: true });

  // Fuselage: nose cone + main body + tail cone, all along -Z (nose at -Z).
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.8, 10), red);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.4;
  group.add(nose);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.62, 5.6, 10), cream);
  body.rotation.x = Math.PI / 2;
  body.position.z = 0.2;
  group.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.6, 10), cream);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 4.2;
  group.add(tail);

  // Canopy.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(1, 0.75, 1.7);
  canopy.position.set(0, 0.55, -0.9);
  group.add(canopy);

  // Main wing (low wing) with red tips.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.22, 2.1), cream);
  wing.position.set(0, -0.15, -0.4);
  group.add(wing);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.24, 2.1), red);
    tip.position.set(s * 5.1, -0.15, -0.4);
    group.add(tip);
  }
  // Horizontal stabiliser + vertical fin.
  const stab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.2), cream);
  stab.position.set(0, 0.25, 4.9);
  group.add(stab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 1.6), red);
  fin.position.set(0, 0.95, 4.9);
  group.add(fin);

  // Propeller: spinner + translucent disc, spins with throttle.
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 8), dark);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -4.5;
  group.add(spinner);
  const prop = new THREE.Group();
  prop.position.z = -4.35;
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.4 });
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.4, 0.1), bladeMat);
    blade.rotation.z = a;
    prop.add(blade);
  }
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.75, 24),
    new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  prop.add(disc);
  group.add(prop);

  // Landing gear: two mains + nose wheel, hidden when retracted.
  const gear = new THREE.Group();
  const strutMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.7 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  for (const s of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 6), strutMat);
    strut.position.set(s * 1.1, -0.9, -0.6);
    gear.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(s * 1.1, -1.5, -0.6);
    gear.add(wheel);
  }
  const noseStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6), strutMat);
  noseStrut.position.set(0, -0.85, -2.9);
  gear.add(noseStrut);
  const noseWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10), wheelMat);
  noseWheel.rotation.z = Math.PI / 2;
  noseWheel.position.set(0, -1.35, -2.9);
  gear.add(noseWheel);
  group.add(gear);

  // Nav lights: red left, green right, white tail.
  const lightGeo = new THREE.SphereGeometry(0.14, 6, 6);
  const leftNav = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  leftNav.position.set(-5.6, -0.15, -0.4);
  group.add(leftNav);
  const rightNav = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x20ff40 }));
  rightNav.position.set(5.6, -0.15, -0.4);
  group.add(rightNav);
  const tailNav = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  tailNav.position.set(0, 0.3, 5.55);
  group.add(tailNav);

  // Soft blob shadow that follows the terrain below the aircraft.
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.name = 'blob-shadow';

  // Pose the group from flight state. Forward is -Z of the group; heading 0
  // points +Z in world, pitch positive climbs, bank positive rolls right.
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  function pose(state, heightAt) {
    group.position.set(state.x, state.y, state.z);
    euler.set(state.pitch, state.heading + Math.PI, -state.bank);
    group.rotation.copy(euler);
    prop.rotation.z += 0.35 + state.throttle * 1.9;
    gear.visible = state.gearDown;
    const ground = heightAt(state.x, state.z);
    blob.position.set(state.x, ground + 0.35, state.z);
    const h = Math.max(0, state.y - ground);
    blob.material.opacity = h < 120 ? 0.18 * (1 - h / 140) : 0;
    const s = 1 + h * 0.008;
    blob.scale.set(s, s, 1);
  }

  return { group, blob, pose, prop };
}
