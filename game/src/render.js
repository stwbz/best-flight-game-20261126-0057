// Rendering: one WebGLRenderer, one scene, one chase camera. Golden-hour
// lighting (low amber sun + warm fog + a gradient sky dome), ACES tone
// mapping, DPR clamped. The camera never fights the pilot: it trails the
// aircraft with exponential smoothing and a speed-based look-ahead.
import * as THREE from 'three';
import { CONFIG } from './config.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf2a06e, 500, 2600);

  // Gradient sky dome: ember horizon rising to a violet dusk.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x5a4a86) },
      mid: { value: new THREE.Color(0xe8734a) },
      low: { value: new THREE.Color(0xffb36b) },
    },
    vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vPos;
      uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      void main() {
        float h = normalize(vPos).y;
        vec3 c = h > 0.18 ? mix(mid, top, smoothstep(0.18, 0.75, h))
                          : mix(low, mid, smoothstep(-0.08, 0.18, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3200, 24, 16), skyMat);
  sky.name = 'sky';
  scene.add(sky);

  // Low amber sun in the west + warm hemisphere fill.
  const sun = new THREE.DirectionalLight(0xffb36b, 2.6);
  sun.position.set(-900, 260, -500);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xff9e7d, 0x2e4a3a, 0.85);
  scene.add(hemi);

  // Sun disc low on the horizon.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(90, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe6a8, fog: false }),
  );
  sunDisc.position.set(-2600, 320, -1400);
  sunDisc.lookAt(0, 100, 0);
  scene.add(sunDisc);

  const camera = new THREE.PerspectiveCamera(CONFIG.fovBase, window.innerWidth / window.innerHeight, 0.5, 7000);
  camera.position.set(0, 320, -700);

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // --- chase camera ---
  const camPos = new THREE.Vector3(0, 320, -700);
  const camTarget = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const look = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  function updateChaseCamera(state, dt, instant, lift = 0) {
    fwd.set(Math.sin(state.heading), 0, Math.cos(state.heading));
    // Camera sits behind and above the aircraft, drifting with speed.
    const dist = CONFIG.chaseDistance + state.speed * 0.03;
    desired.set(state.x - fwd.x * dist, state.y + CONFIG.chaseHeight, state.z - fwd.z * dist);
    const k = instant ? 1 : 1 - Math.exp(-CONFIG.chaseSmooth * dt);
    camPos.lerp(desired, k);
    // Never let the camera sink into the terrain.
    camera.position.copy(camPos);
    // lift raises the look-at point, dropping the aircraft lower in the frame
    // (title screen: clears the START button).
    look.set(state.x + fwd.x * 26, state.y + Math.sin(state.pitch) * 12 + lift, state.z + fwd.z * 26);
    camTarget.lerp(look, instant ? 1 : 1 - Math.exp(-6 * dt));
    camera.lookAt(camTarget);
    const targetFov = CONFIG.fovBase + (state.speed / CONFIG.maxSpeed) * (CONFIG.fovSpeed - CONFIG.fovBase);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }
  }

  function setDusk(on) {
    // Sortie 3 flies at dusk: deepen the sky and the fog.
    scene.fog.color.setHex(on ? 0xb06a8a : 0xf2a06e);
    skyMat.uniforms.top.value.setHex(on ? 0x2e2a55 : 0x5a4a86);
    skyMat.uniforms.mid.value.setHex(on ? 0x9a4a5a : 0xe8734a);
    skyMat.uniforms.low.value.setHex(on ? 0xd97a5a : 0xffb36b);
    sun.intensity = on ? 1.7 : 2.6;
    hemi.intensity = on ? 0.6 : 0.85;
  }

  return { renderer, scene, camera, sun, updateChaseCamera, setDusk, onResize };
}
