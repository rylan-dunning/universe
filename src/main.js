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
const speedPopoverEl = document.getElementById('speed-popover');
const speedPopoverCurrentEl = document.getElementById('speed-popover-current');
const speedVsCarEl = document.getElementById('speed-vs-car');
const speedVsJetEl = document.getElementById('speed-vs-jet');
const speedVsObjectEl = document.getElementById('speed-vs-object');
const minimapEl = document.getElementById('minimap');
const minimapCanvas = document.getElementById('minimap-canvas');
const minimapStatusEl = document.getElementById('minimap-status');
const minimapCtx = minimapCanvas.getContext('2d');

const SPEED_REFERENCES = {
  car: { label: 'ThrustSSC', mps: 341.1 },
  jet: { label: 'X-15', mps: 2020 },
  object: { label: 'Parker Solar Probe', mps: 192000 },
};

const MINIMAP_PADDING = 18;
const MINIMAP_MAX_ORBIT = 4_500_000_000;

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

hud.speed.addEventListener('mousedown', (e) => e.stopPropagation());
hud.speed.addEventListener('click', (e) => {
  e.stopPropagation();
  speedPopoverEl.classList.toggle('hidden');
});
document.addEventListener('mousedown', (e) => {
  if (speedPopoverEl.classList.contains('hidden')) return;
  if (e.target === hud.speed || hud.speed.contains(e.target) || speedPopoverEl.contains(e.target)) return;
  speedPopoverEl.classList.add('hidden');
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

const _pointedPos = new THREE.Vector3();
const _pointedDir = new THREE.Vector3();
const _shipForward = new THREE.Vector3();
let _pointedBody = null;
let _pointedHold = 0;
const POINTED_ACQUIRE_DOT = 0.2;
const POINTED_KEEP_DOT = -0.05;
const POINTED_HOLD_SEC = 0.6;

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

  if (follow.active && follow.body) {
    const orbitUp = new THREE.Vector3(0, 1, 0);
    const orbitRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    follow.dir.applyAxisAngle(orbitUp, -dx * k);
    follow.dir.applyAxisAngle(orbitRight, -dy * k).normalize();
    return;
  }

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
  // A genuine click on empty space closes the card, but does NOT hide help/instructions.
  if (!moved) {
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

  // --- Headed-to HUD logic ---
  // Bodies are evaluated in ship-relative scene coordinates, so target
  // selection remains stable with the floating-origin scene shift.
  const bodies = tier.nearestBodies || [];
  _shipForward.set(0, 0, -1).applyQuaternion(ship.quat).normalize();

  let bestBody = null;
  let bestDot = -Infinity;
  for (const body of bodies) {
    body.mesh.getWorldPosition(_pointedPos);
    const centerDist = _pointedPos.length();
    if (centerDist < 1e-9) continue;
    _pointedDir.copy(_pointedPos).multiplyScalar(1 / centerDist);
    const dot = _shipForward.dot(_pointedDir);
    if (dot > bestDot) {
      bestDot = dot;
      bestBody = body;
    }
  }

  let currentDot = -Infinity;
  if (_pointedBody) {
    _pointedBody.mesh.getWorldPosition(_pointedPos);
    const currentDist = _pointedPos.length();
    if (currentDist > 1e-9) {
      _pointedDir.copy(_pointedPos).multiplyScalar(1 / currentDist);
      currentDot = _shipForward.dot(_pointedDir);
    }
  }

  if (_pointedBody && currentDot >= POINTED_KEEP_DOT) {
    _pointedHold = POINTED_HOLD_SEC;
  } else if (bestBody && bestDot >= POINTED_ACQUIRE_DOT) {
    _pointedBody = bestBody;
    _pointedHold = POINTED_HOLD_SEC;
  } else if (_pointedHold > 0 && _pointedBody) {
    _pointedHold = Math.max(0, _pointedHold - dt);
  } else {
    _pointedBody = null;
  }

  if (_pointedBody) {
    _pointedBody.mesh.getWorldPosition(_pointedPos);
    const centerDist = _pointedPos.length();
    const surfaceDist = Math.max(0, centerDist - (_pointedBody.radius || 0));
    const etaStr = formatEtaSeconds(surfaceDist, ship.velocity, _pointedPos);
    hud.set('pointed', `${_pointedBody.name} (${etaStr})`);
  } else {
    hud.set('pointed', '—');
  }

  updateSpeedPopover(speedMps);
  drawMiniMap();
  updatePeerGhosts();
  watchTierForInvasion();
  updateInvasion(dt, input);
  requestAnimationFrame(frame);
}

function updateSpeedPopover(speedMps) {
  speedPopoverCurrentEl.textContent = `${formatSpeed(speedMps)}  |  ${formatSpeedTerrestrial(speedMps)}`;
  speedVsCarEl.textContent = formatReferenceRatio(speedMps, SPEED_REFERENCES.car);
  speedVsJetEl.textContent = formatReferenceRatio(speedMps, SPEED_REFERENCES.jet);
  speedVsObjectEl.textContent = formatReferenceRatio(speedMps, SPEED_REFERENCES.object);
}

function formatReferenceRatio(speedMps, reference) {
  if (!Number.isFinite(speedMps) || speedMps <= 0) return `0.00x ${reference.label}`;
  const ratio = speedMps / reference.mps;
  const digits = ratio >= 100 ? 0 : ratio >= 10 ? 1 : 2;
  return `${ratio.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}x ${reference.label}`;
}

function drawMiniMap() {
  const ctx = minimapCtx;
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w * 0.5;
  const cy = h * 0.5;
  const mapRadius = Math.min(w, h) * 0.5 - MINIMAP_PADDING;

  ctx.fillStyle = 'rgba(2, 6, 14, 0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, mapRadius + 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(122, 215, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, mapRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(122, 215, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(cx - mapRadius, cy);
  ctx.lineTo(cx + mapRadius, cy);
  ctx.moveTo(cx, cy - mapRadius);
  ctx.lineTo(cx, cy + mapRadius);
  ctx.stroke();

  ctx.fillStyle = '#ffcf73';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(122, 215, 255, 0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, mapRadius * 0.33, 0, Math.PI * 2);
  ctx.arc(cx, cy, mapRadius * 0.66, 0, Math.PI * 2);
  ctx.stroke();

  if (scales.activeIndex !== 0) {
    minimapStatusEl.textContent = 'Top-down ecliptic view available in Solar scale';
    return;
  }

  const solarTier = scales.ensureTier(0);
  const bodies = solarTier.nearestBodies || [];
  for (const body of bodies) {
    if (!body.orbit) continue;
    const ringRadius = solarMapRadius(body.orbit, mapRadius);
    ctx.strokeStyle = 'rgba(122, 215, 255, 0.07)';
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    const point = solarMapPoint(body.mesh.position.x, body.mesh.position.z, mapRadius);
    ctx.fillStyle = body.name === 'Earth' ? '#8fd4ff' : 'rgba(210, 232, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(point.x, point.y, body.name === 'Earth' ? 2.4 : 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  const shipPoint = solarMapPoint(scales.shipWorldPos.x, scales.shipWorldPos.z, mapRadius);
  const shipForward = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat);
  const heading2D = new THREE.Vector2(shipForward.x, shipForward.z);
  const headingAngle = heading2D.lengthSq() > 1e-8 ? Math.atan2(heading2D.y, heading2D.x) : 0;
  drawMiniMapShipArrow(ctx, shipPoint.x, shipPoint.y, headingAngle);

  const shipSunDist = Math.hypot(scales.shipWorldPos.x, scales.shipWorldPos.z) / 149_597_870.7;
  minimapStatusEl.textContent = `${shipSunDist.toFixed(2)} AU from Sun · top-down ecliptic`;
}

function solarMapRadius(distanceKm, mapRadius) {
  return (Math.log10(1 + distanceKm) / Math.log10(1 + MINIMAP_MAX_ORBIT)) * mapRadius;
}

function solarMapPoint(x, z, mapRadius) {
  const radius = solarMapRadius(Math.hypot(x, z), mapRadius);
  const angle = Math.atan2(z, x);
  return {
    x: minimapCanvas.width * 0.5 + Math.cos(angle) * radius,
    y: minimapCanvas.height * 0.5 - Math.sin(angle) * radius,
  };
}

function drawMiniMapShipArrow(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-angle);

  ctx.strokeStyle = 'rgba(255, 120, 120, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ff5a5a';
  ctx.strokeStyle = '#fff2f2';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function formatEtaSeconds(distanceUnits, velocity, toBody) {
  const speed = velocity.length();
  if (distanceUnits <= 0) return '0s';
  if (speed <= 1e-3) return '—';

  const closingSpeed = velocity.dot(_pointedDir.copy(toBody).normalize());
  if (closingSpeed <= 1e-3) return '—';

  const etaSec = distanceUnits / closingSpeed;
  if (!Number.isFinite(etaSec) || etaSec >= 1e8) return '—';

  const hours = Math.floor(etaSec / 3600);
  const min = Math.floor((etaSec % 3600) / 60);
  const sec = Math.ceil(etaSec % 60);
  if (hours > 0) return `${hours}h ${min}m`;
  if (min > 0) return `${min}m ${sec}s`;
  return `${sec}s`;
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

function syncOverlayLayout() {
  minimapEl.classList.toggle('raised', !settingsEl.classList.contains('hidden'));
}

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsEl.classList.toggle('hidden');
  syncOverlayLayout();
});
settingsClose.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsEl.classList.add('hidden');
  syncOverlayLayout();
});
// Don't let clicks inside the panel close the card / blur the input.
settingsEl.addEventListener('mousedown', (e) => e.stopPropagation());
syncOverlayLayout();

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

function makePeerLabel(name, peerId) {
  const el = document.createElement('div');
  el.className = 'peer-label';
  const dot = document.createElement('span');
  dot.className = 'pdot';
  const txt = document.createElement('span');
  txt.className = 'ptxt';
  txt.textContent = name;
  el.appendChild(dot);
  el.appendChild(txt);
  // Click handler: clicking the host's tag (when we're a joiner) toggles follow
  // mode. Clicking ANY other peer's tag warps you to them so it's actually
  // possible to find each other in a 4.5e9-km solar system.
  el.addEventListener('mousedown', (ev) => ev.stopPropagation());
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (net.mode === 'join' && peerId === net.hostId) {
      setFollowingHost(!net.followingHost);
    } else {
      warpToPeer(peerId);
    }
  });
  peersRoot.appendChild(el);
  return el;
}

function ensureGhost(snap) {
  let g = peerGhosts.get(snap.id);
  if (!g) {
    const ghostShip = new Ship();
    ghostShip.setConfig(snap.config || {});
    g = {
      ship: ghostShip,
      label: makePeerLabel(snap.name || snap.id, snap.id),
      tier: -1,
      lastSnap: snap,
      prevAlive: snap.alive !== false,
    };
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
  // Detect alive transitions for explosion VFX.
  const wasAlive = g.prevAlive !== false;
  const isAlive = snap.alive !== false;
  if (wasAlive && !isAlive) {
    // Peer just died — spawn an explosion at their last known position.
    if (snap.tier === scales.activeIndex) {
      spawnExplosion(snap.pos[0], snap.pos[1], snap.pos[2]);
    }
  }
  g.prevAlive = isAlive;
  g.lastSnap = snap;
  // Apply config changes if the peer reskinned.
  if (snap.config && JSON.stringify(snap.config) !== JSON.stringify(g.ship.config)) {
    g.ship.setConfig(snap.config);
  }
  // Spawn any bullet events the peer fired this tick.
  // During invasion mode, everyone sees everyone's bullets so coordinated
  // fire on aliens reads correctly.
  if (snap.fires && net.invasion.active && snap.tier === scales.activeIndex && scales.activeIndex === 0) {
    for (const f of snap.fires) {
      spawnBullet(
        snap.id,
        new THREE.Vector3(f.pos[0], f.pos[1], f.pos[2]),
        new THREE.Vector3(f.dir[0], f.dir[1], f.dir[2]),
        f.speed,
      );
    }
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
  const w = window.innerWidth, h = window.innerHeight;
  const cx = w * 0.5, cy = h * 0.5;
  const margin = 28;
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
    // Hide the ship mesh while the peer is "dead" (between hit & respawn).
    g.ship.group.visible = s.alive !== false;
    // World position - floating-origin offset (i.e., draw at peer.pos in scene).
    g.ship.group.position.set(s.pos[0], s.pos[1], s.pos[2]);
    g.ship.group.quaternion.set(s.quat[0], s.quat[1], s.quat[2], s.quat[3]);
    // Match local visual sizing so peers don't appear tiny / huge across scales.
    const visual = Math.max(s.vis || 0, scales.minShipDisplayUnits[scales.activeIndex]);
    g.ship.group.scale.setScalar(visual / 2.0);

    // Tag styling: highlight host. (No more dogfight tinting.)
    g.label.classList.toggle('host', id === net.hostId);

    // Project to screen (with off-screen clamping so peer tags stay visible).
    // The peer ghost is added to scales.active.scene, whose root is translated
    // by -shipWorldPos. The camera, however, lives in world space (the local
    // ship is rendered at the world origin). So to project the ghost we must
    // use its TRUE world position = local position + scene-root offset, i.e.
    // s.pos - shipWorldPos. Using g.ship.group.position directly is wrong
    // because that's scene-local and the further from origin you fly, the
    // more the tag drifts off the actual ghost.
    const sp = scales.shipWorldPos;
    const worldX = s.pos[0] - sp.x;
    const worldY = s.pos[1] - sp.y;
    const worldZ = s.pos[2] - sp.z;
    const vx = worldX - camera.position.x;
    const vy = worldY - camera.position.y;
    const vz = worldZ - camera.position.z;
    const fwdX = -camera.matrixWorld.elements[8];
    const fwdY = -camera.matrixWorld.elements[9];
    const fwdZ = -camera.matrixWorld.elements[10];
    const inFront = (vx * fwdX + vy * fwdY + vz * fwdZ) > 0;

    const v = new THREE.Vector3(worldX, worldY, worldZ).project(camera);
    let nx = v.x, ny = v.y;
    const onScreen = inFront && nx > -1 && nx < 1 && ny > -1 && ny < 1;

    let sx, sy, clamped = false;
    if (onScreen) {
      sx = nx * cx + cx;
      sy = -ny * cy + cy;
    } else {
      if (!inFront) { nx = -nx; ny = -ny; }
      if (Math.abs(nx) < 1e-6 && Math.abs(ny) < 1e-6) { nx = 0; ny = 1; }
      const maxX = (w - 2 * margin) * 0.5;
      const maxY = (h - 2 * margin) * 0.5;
      const sxScale = Math.abs(nx) > 1e-9 ? maxX / Math.abs(nx) : Infinity;
      const syScale = Math.abs(ny) > 1e-9 ? maxY / Math.abs(ny) : Infinity;
      const sScale = Math.min(sxScale, syScale);
      sx = cx + nx * sScale;
      sy = cy - ny * sScale;
      clamped = true;
    }
    g.label.classList.toggle('clamped', clamped);
    g.label.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
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
  // Joiners get the in-game "follow host" toggle.
  const followBtn = document.getElementById('mp-toggle-follow');
  if (net.mode === 'join') followBtn.classList.remove('hidden');
  else followBtn.classList.add('hidden');
  refreshInvasionAvailability();
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
  lobbyInfo(`Connecting to ${code}…`);
  try {
    await net.join(code, false);
    lobbyInfo('Connected.');
    showMpStatus('Joined', code);
    setTimeout(leaveLobby, 1000);
  } catch (e) {
    lobbyError('Could not connect: ' + (e?.message || e));
  }
});
// Auto-uppercase the code field as the user types.
document.getElementById('join-code').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

// ---------------------------------------------------------------------------
// In-game multiplayer toggles + invasion mode (alien combat in Solar system).
//
// Architecture:
//  - Only the HOST runs the alien simulation (movement, shooting, HP).
//  - Each tick the host broadcasts the full invasion state in the roster.
//  - Joiners render aliens / alien-bullets from the host's snapshot.
//  - Joiner-fired bullets that hit an alien locally also send a 'hit' message
//    to the host so it can apply authoritative damage.
//  - Alien bullets damage every player locally (one-hit kill, then respawn).
// ---------------------------------------------------------------------------
const followBtn   = document.getElementById('mp-toggle-follow');
const invasionBtn = document.getElementById('invasion-toggle');
const invasionHud   = document.getElementById('invasion-hud');
const winBanner     = document.getElementById('win-banner');

// Solo and host both run the alien simulation locally; only joiners are
// passive observers. canHostInvasion() centralizes that rule.
function canHostInvasion() {
  return net.mode === 'solo' || net.mode === 'host';
}

function setFollowingHost(on) {
  if (net.mode !== 'join') return;
  net.setFollowingHost(on);
  followBtn.textContent = `Follow Host: ${on ? 'ON' : 'OFF'}`;
  followBtn.classList.toggle('on', on);
  // Turning OFF: leave ship right where the host parked us — clear any
  // residual motion so the player doesn't drift away unexpectedly.
  if (!on) ship.resetMotion();
}
followBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setFollowingHost(!net.followingHost);
});

// ---- Warp to peer (clicking a non-host player tag) ----
function warpToPeer(peerId) {
  const g = peerGhosts.get(peerId);
  if (!g || !g.lastSnap) return;
  if (g.lastSnap.tier !== scales.activeIndex) return;
  // Stop the camera follow / card UI so we actually move.
  follow.active = false;
  controls.throttle = 0;
  // Pick a standoff distance proportional to either ship visual.
  const standoff = Math.max(ship.visualUnits * 12, g.ship.visualUnits * 4, 0.05);
  // Approach from a constant offset (above-and-behind feel).
  const dir = new THREE.Vector3(0.3, 0.25, 0.92).normalize();
  scales.shipWorldPos.set(
    g.lastSnap.pos[0] + dir.x * standoff,
    g.lastSnap.pos[1] + dir.y * standoff,
    g.lastSnap.pos[2] + dir.z * standoff,
  );
  // Look toward the peer.
  const lookDir = new THREE.Vector3(
    g.lastSnap.pos[0] - scales.shipWorldPos.x,
    g.lastSnap.pos[1] - scales.shipWorldPos.y,
    g.lastSnap.pos[2] - scales.shipWorldPos.z,
  ).normalize();
  ship.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), lookDir);
  ship.group.quaternion.copy(ship.quat);
  ship.resetMotion();
  // Re-snap the smoothed camera state so we don't drift visibly into place.
  _camQuat.copy(ship.quat);
  _camInit = false;
}

// ---- Host-only: launch / end invasion ----
function refreshInvasionAvailability() {
  // Solo or host can launch; only allowed in Solar tier.
  const ok = canHostInvasion() && scales.activeIndex === 0;
  invasionBtn.disabled = !ok;
  invasionBtn.classList.toggle('disabled', !ok);
  const hint = document.getElementById('invasion-hint');
  if (net.mode === 'join') {
    invasionBtn.style.display = 'none';
    if (hint) hint.textContent = 'Only the host can start an invasion. Press F to fire when one is active.';
  } else {
    invasionBtn.style.display = '';
    if (hint) hint.innerHTML = ok
      ? 'Spawn alien attackers near your ship. Press <b>F</b> to fire your machine gun.'
      : 'Switch to the <b>Solar</b> system to start an invasion.';
  }
  // Auto-end if the host wandered out of Solar mid-invasion.
  if (canHostInvasion() && net.invasion.active && scales.activeIndex !== 0) {
    endInvasion(false);
  }
}
invasionBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (invasionBtn.disabled) return;
  if (net.invasion.active) {
    endInvasion(false);
  } else {
    const fighters = parseInt(document.getElementById('is-fighters').value, 10);
    const motherships = parseInt(document.getElementById('is-motherships').value, 10);
    startInvasion(fighters, motherships);
  }
});

// ---- Bottom-center scale tier picker ----
const scaleBtns = document.querySelectorAll('#scale-bar .scale-btn');
scaleBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const tier = parseInt(btn.dataset.tier, 10);
    if (tier === scales.activeIndex) return;
    controls.scaleRequest = tier;
  });
});
function refreshScaleBar() {
  scaleBtns.forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.tier, 10) === scales.activeIndex);
  });
}

// ---------------------------------------------------------------------------
// Bullets — used in invasion mode by players (and by aliens via the
// invasion.fires array fed from the host).
//
// Bullet speed is scaled to the player's *visual* size so they're always
// readable on screen. The previous tier-max-speed approach made bullets fly
// 7 million km/sec — invisible after one frame.
// ---------------------------------------------------------------------------
const bullets = [];                  // { ownerId, pos, dir, speed, ttl, mesh }
const explosions = [];               // { mesh, ttl, life, base, posWorld }
let lastFireTime = 0;
const FIRE_COOLDOWN = 0.1;           // seconds between local shots (~10/s)
let deadUntil = 0;                   // performance.now() in ms; we're "dead" until then
const RESPAWN_DELAY_MS = 1500;
const PLAYER_BULLET_DAMAGE = 1;      // damage per bullet vs aliens

function bulletSpeedFor(visualUnits) {
  // ~80 ship-lengths per second. Floor so even tiny ships have visible tracers.
  return Math.max(visualUnits * 80, 1.0);
}
function bulletTTL() { return 1.5; }  // seconds (range = speed * ttl)
function bulletVisualSize(visualUnits) {
  return Math.max(visualUnits * 0.12, 0.05);
}

function spawnBullet(ownerId, posWorld, dir, speed) {
  if (scales.activeIndex !== 0) return;
  const isLocal = ownerId === net.localId;
  const isAlien = ownerId === '__alien';
  const color = isAlien ? 0xff3344 : (isLocal ? 0xfff05c : 0xffae3a);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 6), mat);
  // Alien bullets get a fixed visible size; player bullets scale with ship.
  const size = isAlien ? 120 : bulletVisualSize(ship.visualUnits);
  mesh.scale.setScalar(size);
  scales.active.scene.add(mesh);
  bullets.push({
    ownerId,
    pos: posWorld.clone(),
    dir: dir.clone().normalize(),
    speed,
    ttl: bulletTTL(),
    mesh,
  });
}

function spawnExplosion(wx, wy, wz, baseSize) {
  if (scales.activeIndex !== 0) return;
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffae3a, transparent: true, opacity: 0.9,
  });
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat);
  mesh.position.set(wx, wy, wz);
  scales.active.scene.add(mesh);
  const life = 0.9;
  explosions.push({
    mesh, ttl: life, life,
    base: baseSize || Math.max(ship.visualUnits * 2, 0.5),
    posWorld: new THREE.Vector3(wx, wy, wz),
  });
}

function clearBullets() {
  for (const b of bullets) {
    if (b.mesh.parent) b.mesh.parent.remove(b.mesh);
    b.mesh.geometry.dispose(); b.mesh.material.dispose();
  }
  bullets.length = 0;
}
function clearExplosions() {
  for (const e of explosions) {
    if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
    e.mesh.geometry.dispose(); e.mesh.material.dispose();
  }
  explosions.length = 0;
}

function fireBullet() {
  if (scales.activeIndex !== 0) return;
  if (!net.invasion.active) return;     // gun only works during an invasion
  if (performance.now() < deadUntil) return;
  const now = performance.now() / 1000;
  if (now - lastFireTime < FIRE_COOLDOWN) return;
  lastFireTime = now;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quat);
  // Spawn just ahead of the nose so we don't shoot ourselves.
  const offset = ship.visualUnits * 1.4;
  const pos = scales.shipWorldPos.clone().addScaledVector(forward, offset);
  const speed = bulletSpeedFor(ship.visualUnits);
  spawnBullet(net.localId, pos, forward, speed);
  if (net.mode !== 'solo') net.queueFire(pos, forward, speed);
}

function explodePlayer() {
  if (performance.now() < deadUntil) return;
  spawnExplosion(
    scales.shipWorldPos.x, scales.shipWorldPos.y, scales.shipWorldPos.z,
    Math.max(ship.visualUnits * 4, 1.0),
  );
  deadUntil = performance.now() + RESPAWN_DELAY_MS;
  net.setAlive(false);
  ship.resetMotion();
  ship.group.visible = false;
}
function maybeRespawn() {
  if (deadUntil === 0) return;
  if (performance.now() < deadUntil) return;
  deadUntil = 0;
  scales.shipWorldPos.copy(scales.active.spawn);
  ship.resetMotion();
  ship.resetOrientation();
  ship.group.visible = true;
  net.setAlive(true);
  controls.throttle = 0;
}

// ---------------------------------------------------------------------------
// Aliens (host-side authoritative simulation).
//
// Aliens live in world (km) coordinates and are big enough to be visible at
// solar scale. Each alien is rendered on every client; only the host runs the
// AI / shooting / HP logic.
// ---------------------------------------------------------------------------
const FIGHTER_SIZE_KM    = 800;       // radius-ish; visible from a distance
const MOTHERSHIP_SIZE_KM = 8000;
const FIGHTER_HP    = 4;
const MOTHERSHIP_HP = 30;
const FIGHTER_SPEED    = 200;         // km / sec
const MOTHERSHIP_SPEED = 50;
const FIGHTER_BULLET_SPEED    = 6000; // km / sec (alien bullets)
const MOTHERSHIP_BULLET_SPEED = 4000;
const FIGHTER_FIRE_PERIOD    = 1.4;   // seconds
const MOTHERSHIP_FIRE_PERIOD = 0.8;
const ALIEN_ENGAGE_RANGE_KM  = 600_000;
const JUPITER_ORBIT_KM = 5.203 * 1.495978707e8;

// Host-side mutable simulation. Each entry: { id, kind, pos, vel, quat, hp,
// maxHp, size, fireCd }.
let hostAliens = [];
let hostAlienFires = [];   // events queued for the next snapshot tick
let hostNextAlienId = 1;
let hostInvasionWonAt = 0;

// Client-side: meshes for rendering aliens + healthbar overlays.
// Map alienId -> { mesh, hpEl, fillEl, lastHp, kind, size }
const alienVisuals = new Map();

function makeFighterMesh() {
  // Spiky low-poly fighter: octahedron core + cone "nose" + two side fins.
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x441122, emissive: 0xff4466, emissiveIntensity: 0.35,
    flatShading: true, roughness: 0.6,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0xff7a7a, emissive: 0xff5566, emissiveIntensity: 0.6, flatShading: true,
  });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mat);
  core.scale.set(0.9, 0.5, 1.6);
  g.add(core);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.0, 4), accent);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -1.5);
  g.add(nose);
  const finGeo = new THREE.ConeGeometry(0.55, 1.6, 3);
  const fL = new THREE.Mesh(finGeo, mat);
  fL.rotation.z = Math.PI / 2; fL.scale.set(0.3, 1, 0.6);
  fL.position.set(-1.0, 0, 0.4);
  g.add(fL);
  const fR = fL.clone();
  fR.position.set(1.0, 0, 0.4); fR.scale.set(0.3, 1, 0.6); fR.rotation.z = -Math.PI / 2;
  g.add(fR);
  return g;
}
function makeMothershipMesh() {
  // Big dodecahedron with a glowing equatorial ring.
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x331a3a, emissive: 0x882266, emissiveIntensity: 0.35,
    flatShading: true, roughness: 0.7,
  });
  const hull = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), mat);
  hull.scale.set(1.6, 0.7, 1.6);
  g.add(hull);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.12, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xff4488 })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const halo = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.0, 0),
    new THREE.MeshBasicMaterial({ color: 0xff7799, wireframe: true, transparent: true, opacity: 0.4 })
  );
  g.add(halo);
  return g;
}

function makeAlienHpOverlay(name) {
  const el = document.createElement('div');
  el.className = 'alien-hp';
  const nm = document.createElement('div');
  nm.className = 'ah-name';
  nm.textContent = name;
  const bar = document.createElement('div');
  bar.className = 'ah-bar';
  const fill = document.createElement('div');
  fill.className = 'ah-fill';
  bar.appendChild(fill);
  el.appendChild(nm);
  el.appendChild(bar);
  peersRoot.appendChild(el);
  return { el, fill };
}

function ensureAlienVisual(alien) {
  let v = alienVisuals.get(alien.id);
  if (!v) {
    const mesh = alien.kind === 'fighter' ? makeFighterMesh() : makeMothershipMesh();
    // size is the half-extent in km; mesh is ~2 units across, so scale by size.
    mesh.scale.setScalar(alien.size);
    scales.active.scene.add(mesh);
    const name = alien.kind === 'fighter' ? 'FIGHTER' : 'MOTHERSHIP';
    const { el, fill } = makeAlienHpOverlay(name);
    v = { mesh, hpEl: el, fillEl: fill, lastHp: alien.hp, kind: alien.kind, size: alien.size };
    alienVisuals.set(alien.id, v);
  }
  return v;
}

function destroyAlienVisual(id) {
  const v = alienVisuals.get(id);
  if (!v) return;
  if (v.mesh.parent) v.mesh.parent.remove(v.mesh);
  v.mesh.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  if (v.hpEl && v.hpEl.parentNode) v.hpEl.parentNode.removeChild(v.hpEl);
  alienVisuals.delete(id);
}
function clearAlienVisuals() {
  for (const id of [...alienVisuals.keys()]) destroyAlienVisual(id);
}

// ---------------------------------------------------------------------------
// Host simulation.
// ---------------------------------------------------------------------------
function startInvasion(fighters, motherships) {
  if (!canHostInvasion()) return;
  if (scales.activeIndex !== 0) return;
  hostAliens = [];
  hostAlienFires = [];
  // Spawn near the player so they're immediately visible. Random direction,
  // close range — fighters first, motherships farther so the player isn't
  // inside one on launch.
  const sp = scales.shipWorldPos;
  function randomUnit() {
    const v = new THREE.Vector3(
      Math.random() - 0.5,
      (Math.random() - 0.5) * 0.3,   // mostly in the orbital plane
      Math.random() - 0.5,
    );
    if (v.lengthSq() < 1e-6) v.set(1, 0, 0);
    return v.normalize();
  }
  function spawnAt(distanceKm) {
    return sp.clone().addScaledVector(randomUnit(), distanceKm);
  }
  // Motherships: 40,000-60,000 km away (5-7 mothership-radii away).
  for (let i = 0; i < motherships; i++) {
    hostAliens.push({
      id: hostNextAlienId++, kind: 'mothership',
      pos: spawnAt(40_000 + Math.random() * 20_000), vel: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      hp: MOTHERSHIP_HP, maxHp: MOTHERSHIP_HP,
      size: MOTHERSHIP_SIZE_KM, fireCd: Math.random() * MOTHERSHIP_FIRE_PERIOD,
    });
  }
  // Fighters: 8,000-20,000 km away — close enough to see immediately.
  for (let i = 0; i < fighters; i++) {
    hostAliens.push({
      id: hostNextAlienId++, kind: 'fighter',
      pos: spawnAt(8_000 + Math.random() * 12_000), vel: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      hp: FIGHTER_HP, maxHp: FIGHTER_HP,
      size: FIGHTER_SIZE_KM, fireCd: Math.random() * FIGHTER_FIRE_PERIOD,
    });
  }
  hostInvasionWonAt = 0;
  publishHostInvasion(true, false);
  // Update local UI right away so we don't have to wait for a tick.
  net.onInvasionUpdate(net.invasion);
  invasionBtn.textContent = 'End Invasion';
  invasionBtn.classList.add('on');
}

function endInvasion(won) {
  if (!canHostInvasion()) return;
  hostAliens = [];
  hostAlienFires = [];
  publishHostInvasion(false, !!won);
  net.onInvasionUpdate(net.invasion);
  invasionBtn.textContent = 'Start Invasion';
  invasionBtn.classList.remove('on');
  if (won) showWinBanner();
}

function publishHostInvasion(active, won) {
  // Build the wire snapshot of the alien world. Accumulate alien fires into
  // the broadcast state across frames; net._tick clears them after the actual
  // network broadcast (~12 Hz) so we don't drop most bullets between ticks.
  const aliens = hostAliens.map(a => ({
    id: a.id, kind: a.kind,
    pos: [a.pos.x, a.pos.y, a.pos.z],
    quat: [a.quat.x, a.quat.y, a.quat.z, a.quat.w],
    hp: a.hp, maxHp: a.maxHp, size: a.size,
  }));
  const prevFires = (net.invasion && net.invasion.fires) || [];
  const fires = prevFires.concat(hostAlienFires);
  hostAlienFires = [];
  net.setInvasionState({ active, won, aliens, fires });
}

// All known player positions (for host AI targeting). Includes the host itself.
function allPlayerWorldPositions() {
  const out = [];
  if (scales.activeIndex === 0 && net.alive) {
    out.push({ id: net.localId, pos: scales.shipWorldPos.clone() });
  }
  for (const [id, snap] of net.peers) {
    if (snap.tier !== 0 || snap.alive === false) continue;
    out.push({ id, pos: new THREE.Vector3(snap.pos[0], snap.pos[1], snap.pos[2]) });
  }
  return out;
}

function hostStepAliens(dt) {
  if (!canHostInvasion()) return;
  if (!net.invasion.active) return;
  if (scales.activeIndex !== 0) return;

  const players = allPlayerWorldPositions();
  for (const a of hostAliens) {
    // Pick the nearest player as target.
    let target = null, bestD2 = Infinity;
    for (const p of players) {
      const dx = p.pos.x - a.pos.x, dy = p.pos.y - a.pos.y, dz = p.pos.z - a.pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; target = p; }
    }
    if (target) {
      const speed = a.kind === 'fighter' ? FIGHTER_SPEED : MOTHERSHIP_SPEED;
      const toT = new THREE.Vector3().subVectors(target.pos, a.pos);
      const dist = toT.length();
      if (dist > 1e-3) {
        toT.multiplyScalar(1 / dist);
        // Approach until they're a comfortable engagement distance, then orbit slowly.
        const idealRange = a.size * 6;
        const desire = dist > idealRange ? speed : -speed * 0.2;
        a.vel.copy(toT).multiplyScalar(desire);
        // Face the target (local -Z).
        a.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), toT);
      }
      // Fire if in range.
      a.fireCd -= dt;
      if (a.fireCd <= 0 && dist < ALIEN_ENGAGE_RANGE_KM) {
        a.fireCd = a.kind === 'fighter' ? FIGHTER_FIRE_PERIOD : MOTHERSHIP_FIRE_PERIOD;
        const bSpeed = a.kind === 'fighter' ? FIGHTER_BULLET_SPEED : MOTHERSHIP_BULLET_SPEED;
        // Spawn slightly ahead of the alien, aimed at the target.
        const offset = a.size * 1.2;
        const pos = a.pos.clone().addScaledVector(toT, offset);
        hostAlienFires.push({
          pos: [pos.x, pos.y, pos.z],
          dir: [toT.x, toT.y, toT.z],
          speed: bSpeed,
        });
        // Spawn visually on the host too — joiners spawn their copies via the
        // onInvasionUpdate callback when this fire reaches them.
        spawnBullet('__alien', pos, toT, bSpeed);
      }
    }
    a.pos.addScaledVector(a.vel, dt);
  }
  publishHostInvasion(true, false);

  // Win check: if we ran out of aliens, declare victory and end after a beat.
  if (hostAliens.length === 0 && !hostInvasionWonAt) {
    hostInvasionWonAt = performance.now();
  }
  if (hostInvasionWonAt && performance.now() - hostInvasionWonAt > 250) {
    endInvasion(true);
  }
}

// Host receives a hit report from a joiner.
net.onAlienHit = (alienId, damage) => {
  if (!canHostInvasion()) return;
  const a = hostAliens.find(x => x.id === alienId);
  if (!a) return;
  a.hp -= damage;
  if (a.hp <= 0) {
    spawnExplosion(a.pos.x, a.pos.y, a.pos.z, a.size * 1.8);
    hostAliens = hostAliens.filter(x => x.id !== alienId);
  }
};

// Joiners (and host) react to invasion state changes.
const INVASION_COMBAT_SHIP_M = 1_000_000;   // 1,000 km — readable vs alien sizes
let _preInvasionShipLengthM = null;          // restored when invasion ends
let _wasInvasionActive = false;
net.onInvasionUpdate = (state) => {
  // Show / hide UI.
  invasionHud.classList.toggle('hidden', !state.active);
  document.getElementById('ih-alien-count').textContent = state.aliens.length;

  // Auto-resize the local ship to a sensible combat scale on entry, restore
  // on exit. Player ship is normally 5 m which is invisible next to a 1,600-km
  // alien fighter — and bullet speeds scale off ship size, so the gun would
  // be useless without this rescale.
  if (state.active && !_wasInvasionActive && scales.activeIndex === 0) {
    _preInvasionShipLengthM = ship.lengthMeters;
    ship.lengthMeters = INVASION_COMBAT_SHIP_M;
    ship.setVisualSize(scales.shipDisplayUnits(ship));
  } else if (!state.active && _wasInvasionActive && _preInvasionShipLengthM !== null) {
    ship.lengthMeters = _preInvasionShipLengthM;
    ship.setVisualSize(scales.shipDisplayUnits(ship));
    _preInvasionShipLengthM = null;
  }
  _wasInvasionActive = state.active;

  // Spawn alien bullets from the host's snapshot. Solo + host already spawned
  // them locally in hostStepAliens, so only joiners need to do this.
  if (net.mode === 'join' && state.fires && scales.activeIndex === 0) {
    for (const f of state.fires) {
      spawnBullet('__alien',
        new THREE.Vector3(f.pos[0], f.pos[1], f.pos[2]),
        new THREE.Vector3(f.dir[0], f.dir[1], f.dir[2]),
        f.speed);
    }
  }
  // Sync alien meshes.
  const present = new Set(state.aliens.map(a => a.id));
  for (const id of [...alienVisuals.keys()]) {
    if (!present.has(id)) {
      // Alien just died — spawn an explosion at its last visual position.
      const v = alienVisuals.get(id);
      if (v && v.mesh) {
        spawnExplosion(v.mesh.position.x, v.mesh.position.y, v.mesh.position.z, v.size * 1.8);
      }
      destroyAlienVisual(id);
    }
  }
  for (const a of state.aliens) {
    const v = ensureAlienVisual(a);
    v.mesh.position.set(a.pos[0], a.pos[1], a.pos[2]);
    v.mesh.quaternion.set(a.quat[0], a.quat[1], a.quat[2], a.quat[3]);
    v.fillEl.style.width = `${Math.max(0, (a.hp / a.maxHp) * 100)}%`;
  }
  // Host-side: when invasion ends, also push to local network state so we
  // notice on the next tick.
  if (!state.active) {
    clearBullets();
  }
};

// Host: aliens are spawned via host code which calls this on win.
// Joiners: receive `won: true` in invasion msg via the roster handler.
net.onInvasionWin = () => {
  showWinBanner();
};

let _winTimer = 0;
function showWinBanner() {
  winBanner.classList.remove('hidden');
  clearTimeout(_winTimer);
  _winTimer = setTimeout(() => winBanner.classList.add('hidden'), 3500);
}

// ---------------------------------------------------------------------------
// Per-frame: bullets, alien sim, alien-bullet vs player hit detection,
// player-bullet vs alien hit detection, alien overlay positioning.
// ---------------------------------------------------------------------------
function projectAlienOverlays() {
  const w = window.innerWidth, h = window.innerHeight;
  const cx = w * 0.5, cy = h * 0.5;
  // Aliens are added to the active scene, whose root is translated by
  // -shipWorldPos. The camera lives in world space, so we must project the
  // alien's TRUE world position (mesh local pos + scene root offset). Using
  // mesh.position directly drifts more and more the further from origin you
  // fly — same bug as peer tags.
  const sp = scales.shipWorldPos;
  for (const [id, v] of alienVisuals) {
    const mp = v.mesh.position;
    const worldX = mp.x - sp.x;
    const worldY = mp.y - sp.y;
    const worldZ = mp.z - sp.z;
    const wp = new THREE.Vector3(worldX, worldY, worldZ);
    const vx = wp.x - camera.position.x;
    const vy = wp.y - camera.position.y;
    const vz = wp.z - camera.position.z;
    const fwdX = -camera.matrixWorld.elements[8];
    const fwdY = -camera.matrixWorld.elements[9];
    const fwdZ = -camera.matrixWorld.elements[10];
    const inFront = (vx * fwdX + vy * fwdY + vz * fwdZ) > 0;
    if (!inFront) {
      v.hpEl.style.transform = 'translate(-9999px, -9999px)';
      continue;
    }
    const p = wp.project(camera);
    if (p.x < -1.2 || p.x > 1.2 || p.y < -1.2 || p.y > 1.2) {
      v.hpEl.style.transform = 'translate(-9999px, -9999px)';
      continue;
    }
    const sx = p.x * cx + cx - 40;
    const sy = -p.y * cy + cy - 30;
    v.hpEl.style.transform = `translate(${sx}px, ${sy}px)`;
  }
}

function updateInvasion(dt, input) {
  // Force-stop invasion if we leave Solar.
  if (scales.activeIndex !== 0 && canHostInvasion() && net.invasion.active) {
    endInvasion(false);
  }

  // Local fire (gated to invasion).
  if (input.fire) fireBullet();
  maybeRespawn();

  // Host steps aliens (movement, AI, shooting, win check).
  hostStepAliens(dt);

  // Integrate bullets locally and run collisions.
  const sp = scales.shipWorldPos;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.pos.addScaledVector(b.dir, b.speed * dt);
    b.ttl -= dt;
    b.mesh.position.copy(b.pos);

    // ---- Alien bullets vs the local player (one-hit kill) ----
    if (b.ownerId === '__alien' && net.alive && performance.now() >= deadUntil) {
      const dx = b.pos.x - sp.x, dy = b.pos.y - sp.y, dz = b.pos.z - sp.z;
      const hitR = Math.max(ship.visualUnits * 1.5, 0.1);
      if (dx * dx + dy * dy + dz * dz < hitR * hitR) {
        scales.active.scene.remove(b.mesh);
        b.mesh.geometry.dispose(); b.mesh.material.dispose();
        bullets.splice(i, 1);
        explodePlayer();
        continue;
      }
    }

    // ---- Player bullets (anyone's) vs aliens ----
    // Each client checks its own bullets only — the OWNER reports the hit.
    // This avoids double-damage on the host. Host applies damage directly;
    // joiners send a 'hit' message.
    if (b.ownerId === net.localId) {
      let hitId = -1;
      for (const [id, v] of alienVisuals) {
        const dx = b.pos.x - v.mesh.position.x;
        const dy = b.pos.y - v.mesh.position.y;
        const dz = b.pos.z - v.mesh.position.z;
        const r = v.size * 1.05;
        if (dx * dx + dy * dy + dz * dz < r * r) { hitId = id; break; }
      }
      if (hitId !== -1) {
        if (net.mode === 'host') {
          // Apply damage authoritatively right here.
          net.onAlienHit(hitId, PLAYER_BULLET_DAMAGE);
        } else {
          net.reportHit(hitId, PLAYER_BULLET_DAMAGE);
        }
        scales.active.scene.remove(b.mesh);
        b.mesh.geometry.dispose(); b.mesh.material.dispose();
        bullets.splice(i, 1);
        continue;
      }
    }

    if (b.ttl <= 0) {
      scales.active.scene.remove(b.mesh);
      b.mesh.geometry.dispose(); b.mesh.material.dispose();
      bullets.splice(i, 1);
    }
  }

  // Animate explosions: expand + fade.
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i];
    e.ttl -= dt;
    const u = 1 - Math.max(0, e.ttl) / e.life;
    e.mesh.scale.setScalar(e.base * (0.4 + u * 2.5));
    e.mesh.material.opacity = Math.max(0, 1 - u);
    if (e.ttl <= 0) {
      scales.active.scene.remove(e.mesh);
      e.mesh.geometry.dispose(); e.mesh.material.dispose();
      explosions.splice(i, 1);
    }
  }

  // Reposition alien healthbar overlays.
  projectAlienOverlays();
}

// On tier change: invasion is solar-only. Tear down everything if we leave.
let _lastTier = -1;
function watchTierForInvasion() {
  if (scales.activeIndex !== _lastTier) {
    _lastTier = scales.activeIndex;
    refreshInvasionAvailability();
    refreshScaleBar();
    clearBullets();
    clearExplosions();
    clearAlienVisuals();
    if (canHostInvasion() && net.invasion.active && scales.activeIndex !== 0) {
      endInvasion(false);
    }
  }
}
