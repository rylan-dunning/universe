import * as THREE from 'three';
import { buildSolarSystem } from './scenes/solarSystem.js';
import { buildGalaxy } from './scenes/galaxy.js';
import { buildUniverse } from './scenes/universe.js';

// Owns all three scale tiers and switches between them. Each tier has its own
// scene, world-unit definition, spawn point, and "nearest bodies" list.
export class ScaleManager {
  constructor() {
    // Lazy-build to keep startup snappy.
    this._builders = [buildSolarSystem, buildGalaxy, buildUniverse];
    this._tiers = [null, null, null];
    this.activeIndex = -1;

    // Floating-origin offset: world position of the ship in the active tier's units.
    // The scene is rendered with this offset subtracted, so the ship is at (0,0,0).
    this.shipWorldPos = new THREE.Vector3();

    // Per-tier "max throttle speed" in world units / sec. Tuned so a full traversal
    // of the relevant scale at boost is on the order of a minute.
    this.maxSpeed = [
      6_000_000,        // Solar: 6 Mkm/s = 20c (we're educational, not relativistic)
      2_000,            // Galaxy: 2,000 ly/s ≈ traverse Milky Way in ~25s at boost
      400,              // Universe: 400 Mly/s ≈ traverse observable in ~2 min at boost
    ];

    // Minimum visual size of the ship in each tier's world units. At galaxy and
    // universe scales the *real* ship is microscopic, so we render an oversized
    // icon so the player can still see it. The HUD always reports the real size.
    this.minShipDisplayUnits = [
      0,        // Solar: render to true scale (km/m)
      0.6,      // Galaxy: ship icon ≈ 0.6 ly across
      0.05,     // Universe: ship icon ≈ 0.05 Mly across
    ];
  }

  ensureTier(i) {
    if (!this._tiers[i]) this._tiers[i] = this._builders[i]();
    return this._tiers[i];
  }

  switchTo(i, ship) {
    if (i === this.activeIndex) return this.active;
    const tier = this.ensureTier(i);
    this.activeIndex = i;
    this.shipWorldPos.copy(tier.spawn);
    ship.resetMotion();
    ship.setVisualSize(this.shipDisplayUnits(ship));
    return tier;
  }

  // The visual length of the ship in *current tier units*: the larger of its
  // real size (lengthMeters → units) and the tier's minimum display size.
  shipDisplayUnits(ship) {
    const realUnits = ship.lengthMeters / this.active.units.metersPerUnit;
    return Math.max(realUnits, this.minShipDisplayUnits[this.activeIndex]);
  }

  get active() {
    return this.activeIndex >= 0 ? this._tiers[this.activeIndex] : null;
  }

  get currentMaxSpeed() {
    return this.maxSpeed[this.activeIndex];
  }

  // Apply ship velocity to world position; then update each scene object's
  // *render* position by subtracting the ship's world position.
  // Implemented by adjusting the scene root's position once per frame.
  update(dt, ship) {
    const tier = this.active;
    if (!tier) return;

    // Integrate world position
    this.shipWorldPos.x += ship.velocity.x * dt;
    this.shipWorldPos.y += ship.velocity.y * dt;
    this.shipWorldPos.z += ship.velocity.z * dt;

    // Move scene as a whole so the ship appears at origin (floating origin).
    tier.scene.position.copy(this.shipWorldPos).multiplyScalar(-1);

    // Tier-specific updates (orbits, etc.)
    tier.update(performance.now() * 0.001);

    // LOD: show the hi-detail mesh of any named body the ship is close to.
    if (tier.nearestBodies) {
      const sp = this.shipWorldPos;
      for (const b of tier.nearestBodies) {
        if (!b.lod) continue;
        const dx = b.mesh.position.x - sp.x;
        const dy = b.mesh.position.y - sp.y;
        const dz = b.mesh.position.z - sp.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const range = b.lodRange || (b.radius * 80);
        b.lod.visible = d2 < range * range;
      }
    }
  }

  // Find nearest named body and its distance in *meters*.
  nearest() {
    const tier = this.active;
    if (!tier || !tier.nearestBodies) return null;
    let best = null;
    let bestD2 = Infinity;
    const sp = this.shipWorldPos;
    for (const b of tier.nearestBodies) {
      const dx = b.mesh.position.x - sp.x;
      const dy = b.mesh.position.y - sp.y;
      const dz = b.mesh.position.z - sp.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = b; }
    }
    if (!best) return null;
    const distUnits = Math.sqrt(bestD2);
    return {
      name: best.name,
      distanceMeters: distUnits * tier.units.metersPerUnit,
    };
  }

  // Warp the ship to a viewing position in front of `body`, fully stopped and
  // oriented to look at it. Returns the chosen approach direction (unit vector
  // from body toward ship) so the camera can snap to the right place.
  warpTo(body, ship) {
    if (!body || !body.mesh) return null;
    const tier = this.active;
    const target = body.mesh.position; // scene-units (== world units)
    const radius = body.radius || 1;

    // Distance from body: ~6× its radius, with a sensible floor in tier units.
    const minStandoff = tier.units.metersPerUnit < 1e6
      ? 50_000     // solar (km): 50,000 km min
      : tier.units.metersPerUnit < 1e16
        ? 5        // galaxy (ly): 5 ly min
        : 0.3;     // universe (Mly): 0.3 Mly min
    const standoff = Math.max(radius * 6, minStandoff);

    // Direction from body toward current ship pos (so we appear on the side
    // we came from). For very-close or zero distances, fall back to a direction
    // angled above the body's plane so the view is dramatic and stable.
    const dir = new THREE.Vector3().subVectors(this.shipWorldPos, target);
    if (dir.lengthSq() < 1e-6) dir.set(0.4, 0.3, 0.866);
    dir.normalize();

    const newPos = new THREE.Vector3()
      .copy(target)
      .addScaledVector(dir, standoff);
    this.shipWorldPos.copy(newPos);

    // Orient ship: local -Z (forward) → toward body.
    const lookDir = new THREE.Vector3().subVectors(target, newPos).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, -1),
      lookDir
    );
    ship.quat.copy(q);
    ship.group.quaternion.copy(q);
    ship.resetMotion();
    return dir;
  }
}
