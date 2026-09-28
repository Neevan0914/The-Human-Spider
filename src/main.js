import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Colliders } from './colliders.js';
import { createMaterials, setNight } from './materials.js';
import { Environment, TIMES } from './environment.js';
import { buildCity, locate } from './city.js';
import { Hero } from './hero.js';
import { WebLine } from './web.js';
import { Player } from './player.js';
import { ThirdPersonCamera } from './camera.js';
import { Input } from './input.js';
import { Audio } from './audio.js';

const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;
let quality = isTouch ? 'low' : 'high';

// ---------------------------------------------------------------- renderer
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 1.5 : 1));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.25, 6000);
camera.position.set(200, 320, -100);

// ------------------------------------------------------------ post effects
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.2, 0.55, 0.9);
composer.addPass(bloom);
const speedPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, speed: { value: 0 }, vignette: { value: 0.55 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float speed; uniform float vignette; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      float r = length(c);
      float amt = speed * 0.012 * smoothstep(0.12, 0.7, r);
      vec3 col = vec3(texture2D(tDiffuse, vUv - c * amt).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + c * amt).b);
      if (speed > 0.02) {
        vec3 acc = col;
        for (int i = 1; i < 6; i++) acc += texture2D(tDiffuse, vUv - c * amt * float(i) * 1.6).rgb;
        col = mix(col, acc / 6.0, smoothstep(0.18, 0.7, r) * min(speed, 1.0));
      }
      float v = smoothstep(0.9, 0.3, r * (1.0 + speed * 0.3));
      col *= mix(1.0, v, vignette);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(speedPass);
composer.addPass(new OutputPass());

// ------------------------------------------------------------------- state
const col = new Colliders(40);
const env = new Environment(renderer, scene, quality);
const input = new Input(canvas);
const audio = new Audio();
let M, city, hero, web, player, cam;
let timeIndex = 0;
let mode = 'loading';
let showHelp = false;
let t = 0;
const clock = new THREE.Clock();

const frame = () => new Promise(r => requestAnimationFrame(() => r()));
const setProgress = f => { $('bar').style.width = `${Math.round(f * 100)}%`; };

// time-of-day picker
TIMES.forEach((T, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.id = `tod-${i}`;
  b.textContent = T.name;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', i === timeIndex ? 'true' : 'false');
  b.addEventListener('click', () => setTime(i));
  $('times').appendChild(b);
});

function setTime(i) {
  timeIndex = i;
  env.apply(i);
  const T = TIMES[i];
  if (M) setNight(M, T.night);
  if (city) city.setNight(T.night);
  bloom.strength = quality === 'high' ? T.bloom : 0;
  $('tod').textContent = T.name;
  document.querySelectorAll('#times button').forEach((b, k) => b.setAttribute('aria-checked', k === i ? 'true' : 'false'));
}

async function boot() {
  await frame();
  setProgress(0.05);
  M = createMaterials();
  setProgress(0.25);
  await frame();
  city = buildCity(scene, M, col, f => setProgress(0.25 + f * 0.65));
  await frame();
  hero = new Hero();
  scene.add(hero.root);
  web = new WebLine(scene);
  player = new Player(col, hero, web, audio);
  cam = new ThirdPersonCamera(camera, col);
  setTime(timeIndex);
  resetPlayer();
  setProgress(1);
  // Compile shaders up front to avoid hitches on the first swing.
  renderer.compile(scene, camera);
  const go = $('go');
  go.disabled = false;
  go.textContent = 'Start swinging';
  mode = 'menu';
  go.addEventListener('click', start);
  window.__game = { player, cam, city, col, scene, renderer, setTime, input };
}

function resetPlayer() {
  // Face east along the north deck, toward Midtown East and the Chrysler.
  const face = new THREE.Vector3(1, 0, -0.25).normalize();
  player.spawn(city.spawn, face);
  cam.setYaw(face.x, face.z);
  cam.pitch = 0.05;
  cam.target.copy(player.p);
}

function start() {
  audio.start();
  $('start').hidden = true;
  $('hud').hidden = false;
  if (isTouch) $('touch').hidden = false;
  mode = 'play';
  resetPlayer();
  input.requestLock();
  canvas.focus();
}

// ------------------------------------------------------------ pause menu
const isPaused = () => !$('pause').hidden;

function pause() {
  if (mode !== 'play' || isPaused()) return;
  $('pause').hidden = false;
  $('touch').hidden = true;
  audio.wind(0, 300);
  $('resume').focus();
}

function resume() {
  $('pause').hidden = true;
  if (isTouch) $('touch').hidden = false;
  else input.requestLock();
  audio.start();
  clock.getDelta();
}

function toMainMenu() {
  mode = 'menu';
  $('pause').hidden = true;
  $('hud').hidden = true;
  $('touch').hidden = true;
  $('help').hidden = true;
  showHelp = false;
  $('start').hidden = false;
  if (document.pointerLockElement) document.exitPointerLock();
  web.release();
  resetPlayer();
  audio.wind(0, 300);
  $('go').focus();
}

document.addEventListener('pointerlockchange', () => {
  if (mode !== 'play' || isTouch) return;
  if (!document.pointerLockElement) pause();
});
$('resume').addEventListener('click', resume);
$('menu').addEventListener('click', toMainMenu);
$('pauseBtn').addEventListener('click', pause);
canvas.addEventListener('click', () => { if (mode === 'play' && !isTouch && !isPaused() && !document.pointerLockElement) input.requestLock(); });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth / 2, innerHeight / 2);
});

function setQuality(q) {
  quality = q;
  renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 1.5 : 1));
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
  env.light.castShadow = q === 'high';
  bloom.strength = q === 'high' ? TIMES[timeIndex].bloom : 0;
}
if (quality === 'low') setQuality('low');

// --------------------------------------------------------------------- HUD
const hud = {
  spd: $('spd'), alt: $('alt'), state: $('state'), sign: $('signText'), lm: $('landmark'),
  anchor: $('anchor'), cross: $('cross'), noweb: $('noweb'), help: $('help'),
};
const STATE_LABEL = { ground: 'On foot', air: 'Airborne', swing: 'Swinging', zip: 'Web-zip', wall: 'Wall crawl' };
let signT = 0, lmName = '', lmT = 0;
const _v = new THREE.Vector3();

function updateHUD(dt) {
  const sp = player.speed;
  hud.spd.textContent = Math.round(sp * 3.6);
  hud.alt.textContent = Math.max(0, Math.round(player.p.y - 0.97));
  hud.state.textContent = player.diving ? 'Diving' : STATE_LABEL[player.state] || '';
  signT -= dt;
  if (signT <= 0) { signT = 0.25; hud.sign.textContent = locate(player.p.x, player.p.z); }

  // anchor preview reticle
  const pv = player.preview;
  if (pv && player.state !== 'swing') {
    _v.copy(pv.point).project(camera);
    if (_v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1) {
      hud.anchor.style.left = `${(_v.x * 0.5 + 0.5) * innerWidth}px`;
      hud.anchor.style.top = `${(-_v.y * 0.5 + 0.5) * innerHeight}px`;
      hud.anchor.classList.add('show');
    } else hud.anchor.classList.remove('show');
  } else hud.anchor.classList.remove('show');
  hud.cross.classList.toggle('zip', !!player.zipPreview);
  hud.noweb.classList.toggle('show', player.noAnchor > 0);

  // landmark banner
  let near = null;
  for (const L of city.landmarks) {
    const d = Math.hypot(player.p.x - L.center.x, player.p.z - L.center.z);
    if (d < 75) near = L;
  }
  if (near && near.name !== lmName) {
    lmName = near.name;
    lmT = 3.5;
    const facts = {
      'Empire State Building': '350 Fifth Avenue · 102 floors · 1931',
      'Chrysler Building': '405 Lexington Avenue · 77 floors · 1930',
      'Flatiron Building': '175 Fifth Avenue · 22 floors · 1902',
      'Madison Square Park': 'Fifth Avenue at 23rd Street',
    };
    hud.lm.innerHTML = `${near.name}<small>${facts[near.name] || ''}</small>`;
    hud.lm.classList.add('show');
  }
  if (!near && lmName) lmName = '';
  if (lmT > 0) { lmT -= dt; if (lmT <= 0) hud.lm.classList.remove('show'); }
}

// -------------------------------------------------------------------- loop
let speedFx = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  t += dt;
  if (mode === 'loading') { composer.render(); return; }

  if (mode === 'play') {
    if (input.tapped('KeyT')) setTime((timeIndex + 1) % TIMES.length);
    if (input.tapped('KeyR')) resetPlayer();
    if (input.tapped('KeyH')) { showHelp = !showHelp; hud.help.hidden = !showHelp; }
    if (input.tapped('KeyM')) audio.setMuted(!audio.muted);
    if (input.tapped('KeyG')) setQuality(quality === 'high' ? 'low' : 'high');
    if (input.tapped('KeyP')) {
      if (isPaused()) resume();
      else if (document.pointerLockElement) document.exitPointerLock(); // triggers pause()
      else pause();
    }
    if (!isPaused()) {
      player.update(dt, input, cam);
      cam.update(dt, player, input.look);
      audio.wind(player.speed, player.p.y);
      updateHUD(dt);
    }
    speedFx += (Math.max(0, (player.speed - 22) / 45) - speedFx) * (1 - Math.exp(-dt * 4));
  } else {
    // Menu: slow orbit around the Empire State's mast.
    const a = t * 0.045 + 2.2;
    const c = city.esb.center;
    camera.position.set(c.x + Math.cos(a) * 190, 300 + Math.sin(t * 0.1) * 12, c.z + Math.sin(a) * 190);
    camera.lookAt(c.x - Math.cos(a) * 60, 250, c.z - Math.sin(a) * 60);
    hero.root.visible = false;
    player.animate(dt);
    speedFx = 0;
  }
  hero.root.visible = mode === 'play';
  speedPass.uniforms.speed.value = Math.min(1.2, speedFx);

  city.update(dt, t);
  env.update(mode === 'play' ? player.p : camera.position, camera, t);
  composer.render();
  input.endFrame();
}

boot().catch(err => {
  console.error(err);
  $('go').textContent = 'Could not start: ' + err.message;
});
loop();
