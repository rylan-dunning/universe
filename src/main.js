import * as THREE from 'three';
import { Controls } from './controls.js';
import { Ship, SHIP_OPTIONS } from './ship.js';
import { Hud } from './hud.js';
import { ScaleManager } from './scaleManager.js';
import { Labels } from './labels.js';
import { formatDistanceKm, formatLength, formatSpeed, formatSpeedTerrestrial,
         shipKineticEnergyJ, formatEnergyJ, energyMetaphor, FACTS,
         SEARCH_INDEX } from './data.js';
import { Net } from './net.js';

// ---- Renderer ----
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  logarithmicDepthBuffer: true, // critical for huge scale ranges
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

// Camera with extreme far plane (logarithmic depth makes this safe).
const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  1e-6,
  1e30
);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---- Game objects ----
const controls = new Controls();
const ship = new Ship();
const hud = new Hud();
const scales = new ScaleManager();
const labels = new Labels(document.getElementById('labels-root'), onBodyClick);

// ---- Info card (basic facts about a body the player visited) ----
const card = {
  el:    document.getElementById('card'),
  name:  document.getElementById('card-name'),
  type:  document.getElementById('card-type'),
  facts: document.getElementById('card-facts'),
  open: false,
};
document.getElementById('card-close').addEventListener('click', closeCard);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === ' ') closeCard();
});

function onBodyClick(body) {
  // Lock onto the body: warp into a viewing standoff and start tracking it
  // every frame so we follow its orbit and stay facing the same side.
  const dir = scales.warpTo(body, ship);
  // Zero throttle so we don't fly away when the card closes (W is "sticky").
  controls.throttle = 0;

  // Follow state: keep regenerating shipWorldPos = bodyPos + dir * standoff
  // while the card is open. dir is in scene/world units (constant unit vector).
  follow.body = body;
  follow.dir.copy(dir || new THREE.Vector3(0.4, 0.3, 0.866).normalize());
  follow.standoff = scales.shipWorldPos.distanceTo(body.mesh.position);
  follow.active = true;

  // Reset drag-camera offset so the view starts looking straight at the body.
  dragYaw = 0;
  dragPitch = 0;

  // Snap the smoothed camera state INSTANTLY so we don't visibly orbit the
  // ship while slerping into the new orientation.
  _camQuat.copy(ship.quat);
  _camInit = true;
  _back.set(0, 0, 1).applyQuaternion(_camQuat);
  _up.set(0, 1, 0).applyQuaternion(_camQuat);
  const shipUnits = ship.visualUnits;
  const camDist = Math.max(shipUnits * 5, 1e-30) * _camZoom;
  _desired.copy(_back).multiplyScalar(camDist).addScaledVector(_up, camDist * 0.35);
  _camPos.copy(_desired);

  openCard(body);
}

function openCard(body) {
  const data = FACTS[body.name];
  card.name.textContent = body.name;
  card.type.textContent = data ? data.type : 'Celestial Object';
  card.facts.innerHTML = '';
  const items = data ? data.facts : ['No additional facts available yet.'];
  for (const f of items) {
    const li = document.createElement('li');
    li.textContent = f;
    card.facts.appendChild(li);
  }
  card.el.classList.remove('hidden');
  card.open = true;
}

function closeCard() {
  if (!card.open) return;
  card.el.classList.add('hidden');
  card.open = false;
  follow.active = false;
  // Reset throttle again when resuming so we don't shoot off into space.
  controls.throttle = 0;
  ship.resetMotion();
}

// ---- Camera state (declared early to avoid TDZ) ----
const _camPos  = new THREE.Vector3();
const _camQuat = new THREE.Quaternion();
let   _camInit = false;
const _back    = new THREE.Vector3();
const _up      = new THREE.Vector3();
const _desired = new THREE.Vector3();
let   _camZoom = 1;        // multiplier on camera distance (used by transitions)

// ---- Drag-to-orbit camera offset (mouse drag on the canvas) ----
// User can click-and-drag empty space to rotate the camera around the ship.
// Decays back to 0 when the user stops interacting and is moving normally,
// but is held when locked-onto a body (so they can inspect from any angle).
let dragYaw   = 0;        // radians, around world-up
let dragPitch = 0;        // radians, around camera-right
let dragging  = false;
let dragLastX = 0, dragLastY = 0;

// User-controlled zoom (scroll wheel). 1 = default chase distance.
let userZoom = 1;

// ---- Orbit-lock follow target ----
const follow = {
  active: false,
  body: null,
  dir: new THREE.Vector3(),  // unit vector from body toward ship (constant)
  standoff: 0,               // distance from body
};

// ---- Tier transition state ----
// Transitions go: pull camera waaay out from current tier (1.0s), swap tier,
// snap camera in close to new ship (instant), then ease camera back to normal
// (1.0s). Input is locked while transitioning.
const transition = {
  active: false,
  phase: 'idle',     // 'out' | 'swap' | 'in'
  t: 0,
  duration: 1.0,
  targetIndex: -1,
  fadeEl: document.getElementById('fade'),
  // Optional: name of a body in the destination tier to lock onto after the
  // transition finishes (used by the search box for cross-scale jumps).
  warpTarget: null,
};

// Start in solar system.
scales.switchTo(0, ship);
attachShipToActive();

function attachShipToActive() {
  const tier = scales.active;
  if (ship.group.parent) ship.group.parent.remove(ship.group);
  tier.scene.add(ship.group);
  ship.setVisualSize(scales.shipDisplayUnits(ship));
  labels.setBodies(tier.nearestBodies || []);
  // Reset smoothed camera state on tier change.
  _camPos.set(0, 0, 0);
  _camQuat.identity();
  _camInit = false;
}

// ---- Click to focus / hide help (but don't close the card on a drag) ----
let _downX = 0, _downY = 0, _downT = 0;
canvas.addEventListener('mousedown', (e) => {
  _downX = e.clientX; _downY = e.clientY; _downT = performance.now();
  dragging = true;
  dragLastX = e.clientX;
  dragLastY = e.clientY;
});
canvas.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragLastX;
  const dy = e.clientY - dragLastY;
  dragLastX = e.clientX;
  dragLastY = e.clientY;
  // Convert pixels to radians (~360° across the screen).
  const k = (Math.PI * 2) / Math.max(window.innerWidth, window.innerHeight);
  dragYaw   -= dx * k;
  dragPitch -= dy * k;
  // Clamp pitch so the camera doesn't flip over.
  const lim = Math.PI * 0.49;
  if (dragPitch >  lim) dragPitch =  lim;
  if (dragPitch < -lim) dragPitch = -lim;
});
window.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  dragging = false;
  const dx = e.clientX - _downX;
  const dy = e.clientY - _downY;
  const moved = (dx * dx + dy * dy) > 16; // > 4 px = drag, not click
  // A genuine click on empty space hides help and closes the card.
  if (!moved) {
    hud.hideHelp();
    closeCard();
    canvas.focus();
  }
});

// ---- Scroll wheel: zoom in / out ----
// In free flight, scales the camera chase distance.
// While locked onto a body, scales the standoff so you can fly closer / farther.
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = Math.exp(e.deltaY * 0.0015);   // smooth multiplicative zoom
  if (follow.active) {
    follow.standoff = Math.max(
      (follow.body.radius || 1) * 1.5,
      follow.standoff * factor
    );
  } else {
    userZoom = Math.min(50, Math.max(0.05, userZoom * factor));
  }
}, { passive: false });

// ---- Main loop ----
let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;

  const input = controls.sample(dt);

  // Followers don't drive their ship — host pushes our pose every tick.
  // Suppress steering / throttle / scale-change input for them.
  if (net.followingHost) {
    input.throttle = 0;
    input.yaw = 0; input.pitch = 0; input.roll = 0;
    input.scaleRequest = null;
    input.shipScaleDelta = 0;
    input.fullStop = false;
  }

  // Tier switching — start a smooth transition instead of an instant swap.
  if (input.scaleRequest !== null && input.scaleRequest !== scales.activeIndex && !transition.active) {
    transition.active = true;
    transition.phase = 'out';
    transition.t = 0;
    transition.targetIndex = input.scaleRequest;
  }
  updateTransition(dt);

  // While transitioning OR viewing a body card, ignore most input.
  const locked = transition.active || card.open;

  // Ship size adjustment (multiplicative): changes real meters AND visual size.
  if (!locked && input.shipScaleDelta) {
    ship.lengthMeters *= input.shipScaleDelta > 0 ? 2 : 0.5;
    ship.lengthMeters = Math.min(1e22, Math.max(1e-3, ship.lengthMeters));
    ship.setVisualSize(scales.shipDisplayUnits(ship));
  }

  if (input.resetOrient) ship.resetOrientation();
  if (input.toggleHelp) hud.toggleHelp();

  // Update ship physics (paused during transition so the ship sits still while
  // the camera zooms — gives a clean "step back to see the bigger picture" feel).
  if (!locked) {
    ship.update(dt, input, scales.currentMaxSpeed);
  } else {
    // Decay any leftover motion so we don't fling on resume.
    ship.velocity.multiplyScalar(Math.exp(-dt * 4));
    ship.angVel.multiplyScalar(Math.exp(-dt * 4));
  }

  // Update world (floating origin)
  scales.update(dt, ship);

  // Orbit-lock follow: re-snap ship to a fixed offset from the body each
  // frame, so the body stays centered even as it orbits its parent. We always
  // present the same side of the body (dir is constant in world coords).
  if (follow.active && follow.body) {
    const bp = follow.body.mesh.position;
    scales.shipWorldPos.set(
      bp.x + follow.dir.x * follow.standoff,
      bp.y + follow.dir.y * follow.standoff,
      bp.z + follow.dir.z * follow.standoff
    );
    // Re-apply the floating-origin offset for the new ship position so the
    // body sits exactly at its expected screen-space location.
    scales.active.scene.position.copy(scales.shipWorldPos).multiplyScalar(-1);
    // Face the body: ship local -Z points toward body.
    const lookDir = new THREE.Vector3().subVectors(bp, scales.shipWorldPos).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), lookDir);
    ship.quat.copy(q);
  } else if (!locked) {
    // Decay drag offset back to centered when free-flying so the camera
    // returns to the standard chase view if the user lets go of the mouse.
    const decay = Math.exp(-dt * 1.5);
    dragYaw   *= decay;
    dragPitch *= decay;
  }

  // Counter the scene's floating-origin shift on the ship so it stays at world origin
  // visually. (Scene was translated by -shipWorldPos; ship is added to scene so it
  // would also be translated. Re-add the offset on the ship's matrix to cancel it.)
  ship.group.position.copy(scales.shipWorldPos);

  // Camera follows ship from behind, oriented like the ship.
  updateCamera();

  // ---- HUD ----
  const tier = scales.active;
  hud.set('scale', tier.units.name);
  hud.set('ship', formatLength(ship.lengthMeters));
  const speedMps = ship.velocity.length() * tier.units.metersPerUnit;
  hud.set('speed', formatSpeed(speedMps));
  hud.set('throttle', `${Math.round(input.throttle * 100)}%${input.boost ? ' ×10' : ''}`);
  const near = scales.nearest();
  if (near) {
    hud.set('near', near.name);
    hud.set('dist', formatDistanceKm(near.distanceMeters / 1000));
  }

  // Context info: how big is the ship vs this scale, terrestrial speed,
  // kinetic energy, and a relatable metaphor.
  hud.set('context', shipContextLine(ship, tier));
  hud.set('infoSpeed', formatSpeedTerrestrial(speedMps));
  const ke = shipKineticEnergyJ(ship.lengthMeters, speedMps);
  hud.set('energy', formatEnergyJ(ke));
  hud.set('metaphor', energyMetaphor(ke));

  renderer.render(tier.scene, camera);
  labels.update(camera, window.innerWidth, window.innerHeight);
  updatePeerGhosts();
  requestAnimationFrame(frame);
}

// Human description of the ship's size relative to the active scale.
function shipContextLine(ship, tier) {
  const m = ship.lengthMeters;
  const mpu = tier.units.metersPerUnit;
  const ratio = m / mpu; // ship length in tier units
  if (mpu < 1e6) {
    // Solar: just say meters/km
    return formatLength(m);
  }
  if (mpu < 1e16) {
    // Galactic: say "X of a light-year"
    return `${ratio.toExponential(2)} ly  (${formatLength(m)})`;
  }
  // Universe: "X of a million-ly"
  return `${ratio.toExponential(2)} Mly  (${formatLength(m)})`;
}

function updateCamera() {
  // Smooth orientation: lerp camera quaternion toward ship quaternion.
  // When following / dragging, snap so the user-controlled rotation has
  // priority and we never visibly slerp the chase frame.
  if (!_camInit || follow.active) {
    _camQuat.copy(ship.quat);
    _camInit = true;
  } else {
    _camQuat.slerp(ship.quat, 0.12);
  }

  _back.set(0, 0, 1).applyQuaternion(_camQuat);   // behind ship (smoothed)
  _up.set(0, 1, 0).applyQuaternion(_camQuat);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(_camQuat);

  // Apply user click-and-drag rotation as orbit around * userZoom the ship/target.
  // Pitch around camera-right, yaw around camera-up.
  if (dragYaw !== 0 || dragPitch !== 0) {
    const qy = new THREE.Quaternion().setFromAxisAngle(_up,    dragYaw);
    const qp = new THREE.Quaternion().setFromAxisAngle(right,  dragPitch);
    _back.applyQuaternion(qy).applyQuaternion(qp);
  }

  // Camera distance follows the ship's *visual* size (not real lengthMeters)
  // so the framing is sensible at every tier. When locked onto a body, frame
  // the body instead so it fills a comfortable amount of screen.
  let camDist;
  if (follow.active && follow.body) {
    camDist = follow.standoff * 0.95;
  } else {
    const shipUnits = ship.visualUnits;
    camDist = Math.max(shipUnits * 5, 1e-30) * _camZoom;
  }

  _desired.copy(_back).multiplyScalar(camDist).addScaledVector(_up, camDist * 0.35);

  // Smooth position toward desired offset (ship is at world origin).
  // Use a much stiffer follow during transitions and snap when locked.
  const k = follow.active ? 1 : (transition.active ? 0.5 : 0.18);
  _camPos.lerp(_desired, k);
  camera.position.copy(_camPos);

  // When locked, look at the body (which sits at -shipWorldPos+bodyPos).
  // Otherwise look slightly ahead of the ship.
  let lookAt;
  if (follow.active && follow.body) {
    lookAt = new THREE.Vector3().subVectors(follow.body.mesh.position, scales.shipWorldPos);
  } else {
    lookAt = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat).multiplyScalar(ship.visualUnits * 0.5);
  }
  camera.up.copy(_up);
  camera.lookAt(lookAt);

  camera.near = Math.max(ship.visualUnits * 0.05, 1e-6);
  const farByTier = [1e12, 5e6, 5e6]; // km, ly, Mly
  camera.far = farByTier[scales.activeIndex];
  camera.updateProjectionMatrix();
}

// ---- Cinematic tier transition ----
// Phase 'out': camera zooms back to a huge multiple of normal distance and the
// black overlay fades in. At peak we swap tier and snap camera state.
// Phase 'in':  camera zooms back to normal and the overlay fades out.
function updateTransition(dt) {
  if (!transition.active) {
    _camZoom += (1 - _camZoom) * Math.min(1, dt * 4);
    if (transition.fadeEl) transition.fadeEl.style.opacity = '0';
    return;
  }
  transition.t += dt;
  const T = transition.duration;
  const ease = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

  if (transition.phase === 'out') {
    const u = Math.min(1, transition.t / T);
    // Zoom out: 1 → ~600× over the phase
    _camZoom = 1 + ease(u) * 600;
    if (transition.fadeEl) transition.fadeEl.style.opacity = String(ease(u));
    if (u >= 1) {
      // Swap to target tier and reset state.
      scales.switchTo(transition.targetIndex, ship);
      attachShipToActive();
      _camZoom = 600; // start the new scene zoomed way out
      transition.phase = 'in';
      transition.t = 0;
    }
  } else if (transition.phase === 'in') {
    const u = Math.min(1, transition.t / T);
    _camZoom = 600 * (1 - ease(u)) + 1 * ease(u);
    if (transition.fadeEl) transition.fadeEl.style.opacity = String(1 - ease(u));
    if (u >= 1) {
      _camZoom = 1;
      transition.active = false;
      transition.phase = 'idle';
      // Cross-scale search: lock onto the requested body now that the new
      // tier is settled and we're ready to accept input again.
      if (transition.warpTarget) {
        const name = transition.warpTarget;
        transition.warpTarget = null;
        const body = scales.active.nearestBodies.find(b => b.name === name);
        if (body) onBodyClick(body);
      }
    }
  }
}

// (Frame loop is started from the lobby once the user picks Solo / Host / Join.)

// ---------------------------------------------------------------------------
// Search box: prefix-filter every named body across all scales. Clicking a
// result locks onto it; if it's in another tier, plays the cinematic
// transition first and then locks on.
// ---------------------------------------------------------------------------
const searchBox = document.getElementById('search');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const TIER_NAMES = ['Solar', 'Galactic', 'Universe'];

let searchActiveIdx = -1;
let searchMatches = [];

function renderSearchResults() {
  searchResults.innerHTML = '';
  if (searchMatches.length === 0) {
    searchResults.classList.add('hidden');
    return;
  }
  searchResults.classList.remove('hidden');
  searchMatches.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'search-item' + (i === searchActiveIdx ? ' active' : '');
    row.innerHTML = `<span class="name"></span><span class="tier"></span>`;
    row.querySelector('.name').textContent = m.name;
    row.querySelector('.tier').textContent = TIER_NAMES[m.tier];
    row.addEventListener('mousedown', (e) => {
      e.preventDefault();    // don't blur the input or trigger canvas drag
      e.stopPropagation();
      pickSearchResult(m);
    });
    searchResults.appendChild(row);
  });
}

function updateSearchMatches() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    searchMatches = [];
    searchActiveIdx = -1;
    renderSearchResults();
    return;
  }
  // Prefix match (per the user's spec): ignore stuff that just contains the
  // letters somewhere — only items that begin with the typed text.
  searchMatches = SEARCH_INDEX
    .filter(b => b.name.toLowerCase().startsWith(q))
    .slice(0, 12);
  // Stable order: solar before galactic before universe, then alphabetical.
  searchMatches.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  searchActiveIdx = searchMatches.length ? 0 : -1;
  renderSearchResults();
}

function pickSearchResult(m) {
  searchInput.blur();
  searchInput.value = '';
  searchMatches = [];
  searchActiveIdx = -1;
  renderSearchResults();
  warpToNamed(m);
}

// Lock onto the named body. If it's in another tier, play the cinematic
// transition first and then lock on once the new scene is ready.
function warpToNamed(entry) {
  if (transition.active) return;
  if (entry.tier === scales.activeIndex) {
    const body = scales.active.nearestBodies.find(b => b.name === entry.name);
    if (body) onBodyClick(body);
    return;
  }
  // Cross-scale: kick off the same transition the 1/2/3 keys use.
  transition.active = true;
  transition.phase = 'out';
  transition.t = 0;
  transition.targetIndex = entry.tier;
  transition.warpTarget = entry.name;
}

searchInput.addEventListener('input', updateSearchMatches);
searchInput.addEventListener('focus', updateSearchMatches);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    if (searchMatches.length) {
      searchActiveIdx = (searchActiveIdx + 1) % searchMatches.length;
      renderSearchResults();
    }
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    if (searchMatches.length) {
      searchActiveIdx = (searchActiveIdx - 1 + searchMatches.length) % searchMatches.length;
      renderSearchResults();
    }
    e.preventDefault();
  } else if (e.key === 'Enter') {
    if (searchActiveIdx >= 0 && searchMatches[searchActiveIdx]) {
      pickSearchResult(searchMatches[searchActiveIdx]);
    }
    e.preventDefault();
  } else if (e.key === 'Escape') {
    searchInput.blur();
    searchInput.value = '';
    searchMatches = [];
    renderSearchResults();
  }
  e.stopPropagation();   // don't let game keys (W/S/Space/1/2/3) fire
});
// Don't propagate keyup either, so Controls doesn't see typing.
searchInput.addEventListener('keyup',   (e) => e.stopPropagation());
// Hide dropdown when clicking outside.
document.addEventListener('mousedown', (e) => {
  if (!searchBox.contains(e.target)) {
    searchResults.classList.add('hidden');
  }
});

// ---------------------------------------------------------------------------
// Help panel: collapse / expand button. Stays visible (just the title) when
// collapsed; fully hidden only via 'H' key.
// ---------------------------------------------------------------------------
const helpEl = document.getElementById('help');
const helpToggle = document.getElementById('help-toggle');
helpToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  helpEl.classList.toggle('collapsed');
  helpToggle.textContent = helpEl.classList.contains('collapsed') ? '+' : '−';
});

// ---------------------------------------------------------------------------
// Ship customization panel.
// ---------------------------------------------------------------------------
const settingsBtn = document.getElementById('settings-btn');
const settingsEl = document.getElementById('settings');
const settingsClose = document.getElementById('settings-close');
settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsEl.classList.toggle('hidden');
});
settingsClose.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsEl.classList.add('hidden');
});
// Don't let clicks inside the panel close the card / blur the input.
settingsEl.addEventListener('mousedown', (e) => e.stopPropagation());

function buildShipOptions() {
  const labelMap = {
    body:    { octa: 'Octa', wedge: 'Wedge', capsule: 'Capsule' },
    wings:   { flat: 'Flat', swept: 'Swept', delta: 'Delta', none: 'None' },
    fin:     { single: 'Single', twin: 'Twin', none: 'None' },
    booster: { single: 'Single', twin: 'Twin', quad: 'Quad' },
    flame:   { blue: 'Blue', orange: 'Orange', green: 'Green', purple: 'Purple', white: 'White' },
  };
  for (const cat of ['body', 'wings', 'fin', 'booster', 'flame']) {
    const container = document.getElementById('opt-' + cat);
    container.innerHTML = '';
    for (const id of SHIP_OPTIONS[cat]) {
      const b = document.createElement('button');
      b.className = 'opt' + (ship.config[cat] === id ? ' active' : '');
      b.textContent = labelMap[cat][id] || id;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        ship.setConfig({ [cat]: id });
        // Re-apply visual size after rebuild.
        ship.setVisualSize(scales.shipDisplayUnits(ship));
        for (const sib of container.children) sib.classList.remove('active');
        b.classList.add('active');
      });
      container.appendChild(b);
    }
  }
  for (const cat of ['hullColor', 'accentColor']) {
    const container = document.getElementById('opt-' + cat);
    container.innerHTML = '';
    for (const hex of SHIP_OPTIONS[cat]) {
      const b = document.createElement('button');
      b.className = 'opt swatch' + (ship.config[cat] === hex ? ' active' : '');
      b.style.background = '#' + hex.toString(16).padStart(6, '0');
      b.title = '#' + hex.toString(16).padStart(6, '0');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        ship.setConfig({ [cat]: hex });
        ship.setVisualSize(scales.shipDisplayUnits(ship));
        for (const sib of container.children) sib.classList.remove('active');
        b.classList.add('active');
      });
      container.appendChild(b);
    }
  }
}
buildShipOptions();

// ---------------------------------------------------------------------------
// Multiplayer: lobby gate + peer "ghost" ships rendered in the active tier.
// ---------------------------------------------------------------------------
const net = new Net();
const localName = 'Pilot-' + Math.floor(Math.random() * 9999);

// Map peerId -> { ship, label, currentTier }
const peerGhosts = new Map();
const peersRoot = document.getElementById('labels-root');

function makePeerLabel(name) {
  const el = document.createElement('div');
  el.className = 'peer-label';
  el.textContent = name;
  peersRoot.appendChild(el);
  return el;
}

function ensureGhost(snap) {
  let g = peerGhosts.get(snap.id);
  if (!g) {
    const ghostShip = new Ship();
    ghostShip.setConfig(snap.config || {});
    g = { ship: ghostShip, label: makePeerLabel(snap.name || snap.id), tier: -1, lastSnap: snap };
    peerGhosts.set(snap.id, g);
  }
  // Move ghost to current tier's scene if needed.
  if (g.tier !== scales.activeIndex) {
    if (g.ship.group.parent) g.ship.group.parent.remove(g.ship.group);
    if (snap.tier === scales.activeIndex) {
      scales.active.scene.add(g.ship.group);
      g.tier = scales.activeIndex;
    } else {
      g.tier = -1;  // not in our tier; not rendered
    }
  }
  return g;
}

function removeGhost(id) {
  const g = peerGhosts.get(id);
  if (!g) return;
  if (g.ship.group.parent) g.ship.group.parent.remove(g.ship.group);
  if (g.label && g.label.parentNode) g.label.parentNode.removeChild(g.label);
  peerGhosts.delete(id);
}

// Hook net callbacks.
net.onPeerUpdate = (id, snap) => {
  const g = ensureGhost(snap);
  g.lastSnap = snap;
  // Apply config changes if the peer reskinned.
  if (snap.config && JSON.stringify(snap.config) !== JSON.stringify(g.ship.config)) {
    g.ship.setConfig(snap.config);
  }
};
net.onPeerLeave = (id) => { removeGhost(id); };
net.onTierChange = (tierIdx) => {
  // Follower: move to host's tier (with cinematic transition for nice effect).
  if (tierIdx === scales.activeIndex || transition.active) return;
  transition.active = true;
  transition.phase = 'out';
  transition.t = 0;
  transition.targetIndex = tierIdx;
};
net.onStatus = (m) => { /* could surface in UI */ };

// Per-frame: position / orient each ghost in our tier.
function updatePeerGhosts() {
  const tier = scales.active;
  const sp = scales.shipWorldPos;
  for (const [id, g] of peerGhosts) {
    const s = g.lastSnap;
    if (!s || s.tier !== scales.activeIndex) {
      if (g.ship.group.parent) g.ship.group.parent.remove(g.ship.group);
      g.tier = -1;
      g.label.style.transform = 'translate(-9999px, -9999px)';
      continue;
    }
    if (g.tier !== scales.activeIndex) {
      tier.scene.add(g.ship.group);
      g.tier = scales.activeIndex;
    }
    // World position - floating-origin offset (i.e., draw at peer.pos in scene).
    g.ship.group.position.set(s.pos[0], s.pos[1], s.pos[2]);
    g.ship.group.quaternion.set(s.quat[0], s.quat[1], s.quat[2], s.quat[3]);
    // Match local visual sizing so peers don't appear tiny / huge across scales.
    const visual = Math.max(s.vis || 0, scales.minShipDisplayUnits[scales.activeIndex]);
    g.ship.group.scale.setScalar(visual / 2.0);

    // Project to screen for label.
    const v = g.ship.group.position.clone().project(camera);
    if (v.z >= 1 || v.z <= -1) {
      g.label.style.transform = 'translate(-9999px, -9999px)';
    } else {
      const x = (v.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-v.y * 0.5 + 0.5) * window.innerHeight + 14;
      g.label.style.transform = `translate(${x}px, ${y}px)`;
    }
  }
}

// Hook net into our local ship for the broadcast tick.
net.attach({
  ship,
  getShipWorldPos: () => scales.shipWorldPos,
  getTier: () => scales.activeIndex,
  getConfig: () => ship.config,
  getName: () => localName,
  // Followers receive a target pose from the host every tick. We drive the
  // local ship into that pose so the player sits in the line behind the host.
  applyFollowPose: (pose) => {
    if (pose.tier !== scales.activeIndex) return;
    scales.shipWorldPos.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    ship.quat.set(pose.quat[0], pose.quat[1], pose.quat[2], pose.quat[3]);
    ship.group.quaternion.copy(ship.quat);
    ship.resetMotion();
  },
});

// ---- Lobby buttons ----
const lobbyEl = document.getElementById('lobby');
const mpStatus = document.getElementById('mp-status');
const lobbyStatus = document.getElementById('lobby-status');

function showMpStatus(role, code) {
  mpStatus.classList.remove('hidden');
  document.getElementById('mp-code').textContent = code;
  document.getElementById('mp-role').textContent = role;
}
function refreshPeerCount() {
  document.getElementById('mp-peers').textContent = `${peerGhosts.size + 1} connected`;
}
setInterval(refreshPeerCount, 500);

function leaveLobby() {
  lobbyEl.classList.add('hidden');
  // Start the frame loop now that the player has chosen a mode.
  if (!started) {
    started = true;
    requestAnimationFrame((t) => { prev = t; frame(t); });
  }
}
function lobbyError(msg) {
  lobbyStatus.classList.add('error');
  lobbyStatus.textContent = msg;
}
function lobbyInfo(html) {
  lobbyStatus.classList.remove('error');
  lobbyStatus.innerHTML = html;
}

let started = false;

document.getElementById('btn-solo').addEventListener('click', async () => {
  await net.startSolo();
  leaveLobby();
});

document.getElementById('btn-host').addEventListener('click', async () => {
  lobbyInfo('Starting room…');
  try {
    const code = await net.host();
    lobbyInfo(`Share this code: <span class="code">${code}</span><br/>Click anywhere to begin.`);
    showMpStatus('Host', code);
    setTimeout(leaveLobby, 1800);
  } catch (e) {
    lobbyError('Could not start room: ' + (e?.message || e));
  }
});

document.getElementById('btn-join').addEventListener('click', async () => {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (code.length !== 4) { lobbyError('Code must be 4 characters'); return; }
  const follow = document.getElementById('join-follow').checked;
  lobbyInfo(`Connecting to ${code}…`);
  try {
    await net.join(code, follow);
    lobbyInfo(follow ? 'Connected — auto-following host.' : 'Connected.');
    showMpStatus(follow ? 'Follower' : 'Joined', code);
    setTimeout(leaveLobby, 1000);
  } catch (e) {
    lobbyError('Could not connect: ' + (e?.message || e));
  }
});
// Auto-uppercase the code field as the user types.
document.getElementById('join-code').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

