import * as THREE from 'three';

// Low-poly faceted ship. Always sits at the scene origin (floating origin pattern):
// objects in the world translate around it, so float32 precision stays high.
//
// Orientation is tracked as a quaternion. Linear velocity is in *world units of
// the active scene per second*. The ScaleManager translates the camera-relative
// "world offset" each frame.

// Available customization options. Each key is a category; each value lists
// the available variants by id. Keep these in sync with the builders below.
export const SHIP_OPTIONS = {
  body:    ['octa', 'wedge', 'capsule'],
  wings:   ['flat', 'swept', 'delta', 'none'],
  fin:     ['single', 'twin', 'none'],
  booster: ['single', 'twin', 'quad'],
  flame:   ['blue', 'orange', 'green', 'purple', 'white'],
  hullColor:   [0xc8d6e5, 0xff7a7a, 0x7aff9f, 0xffd87a, 0xb18aff, 0x222b3a],
  accentColor: [0x7ad7ff, 0xff8a4c, 0xff5c8a, 0xfff05c, 0x7affc8, 0xffffff],
};

const DEFAULT_CONFIG = {
  body: 'octa',
  wings: 'flat',
  fin: 'single',
  booster: 'single',
  flame: 'blue',
  hullColor: 0xc8d6e5,
  accentColor: 0x7ad7ff,
};

const FLAME_COLORS = {
  blue:   0x7ad7ff,
  orange: 0xffae3a,
  green:  0x7affc8,
  purple: 0xc880ff,
  white:  0xffffff,
};

export class Ship {
  constructor() {
    this.group = new THREE.Group();
    this.config = { ...DEFAULT_CONFIG };
    this._buildMesh();

    this.quat = new THREE.Quaternion();
    this.angVel = new THREE.Vector3();   // body-space rad/s
    this.velocity = new THREE.Vector3(); // world units / sec (in active scene)
    this.lengthMeters = 5;               // real ship length in meters (HUD truth)
    this.visualUnits = 1;                // current rendered length in world units
  }

  setConfig(partial) {
    Object.assign(this.config, partial);
    // Rebuild mesh; keep current scale.
    const s = this.group.scale.x;
    this._rebuild();
    this.group.scale.setScalar(s);
  }

  _rebuild() {
    // Dispose old children and re-add the configured ones.
    while (this.group.children.length) {
      const c = this.group.children.pop();
      c.geometry?.dispose?.();
      c.material?.dispose?.();
    }
    this._buildMesh();
    this.group.quaternion.copy(this.quat);
  }

  _buildMesh() {
    const cfg = this.config;
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.hullColor,
      flatShading: true,
      metalness: 0.3,
      roughness: 0.55,
      emissive: 0x223344,
      emissiveIntensity: 0.6,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: cfg.accentColor,
      flatShading: true,
      emissive: new THREE.Color(cfg.accentColor).multiplyScalar(0.15).getHex(),
      emissiveIntensity: 0.6,
    });

    // ---- Body ----
    if (cfg.body === 'octa') {
      const hull = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mat);
      hull.scale.set(0.6, 0.4, 1.6);
      this.group.add(hull);
    } else if (cfg.body === 'wedge') {
      // Triangular wedge body, nose at -Z. ConeGeometry's tip is at +Y, so
      // rotate -90° around X so the tip points along -Z. Center on origin.
      const hull = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.0, 4), mat);
      hull.rotation.x = -Math.PI / 2;     // tip → -Z
      hull.rotation.z = Math.PI / 4;      // diamond cross-section
      hull.scale.set(1, 0.5, 1);          // flatten vertically into a wedge
      hull.position.set(0, 0, 0);         // center along Z
      this.group.add(hull);
    } else if (cfg.body === 'capsule') {
      // Rocket: cylindrical fuselage with a pointed nose cone at -Z and a
      // flat tail end at +Z (where the booster nozzle attaches).
      const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.4, 10), mat);
      fuselage.rotation.x = Math.PI / 2;
      fuselage.position.set(0, 0, 0.1);     // shifted slightly back to leave room for nose
      this.group.add(fuselage);
      const noseCone = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 10), mat);
      noseCone.rotation.x = -Math.PI / 2;   // tip → -Z
      noseCone.position.set(0, 0, -0.8);    // pointing forward, attached to fuselage
      this.group.add(noseCone);
      // Decorative dark band where the cone meets the body.
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.06, 10),
        new THREE.MeshStandardMaterial({ color: 0x222b3a, flatShading: true, roughness: 0.6 })
      );
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 0, -0.4);
      this.group.add(band);
    }

    // ---- Wings ----
    if (cfg.wings === 'flat') {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.6), mat);
      wing.position.set(0, 0, -0.1);
      this.group.add(wing);
    } else if (cfg.wings === 'swept') {
      const wingGeo = new THREE.ConeGeometry(0.8, 1.2, 3);
      const left = new THREE.Mesh(wingGeo, mat);
      left.rotation.z = Math.PI / 2;
      left.scale.set(0.3, 1, 0.8);
      left.position.set(-0.9, 0, 0.2);
      this.group.add(left);
      const right = new THREE.Mesh(wingGeo, mat);
      right.rotation.z = -Math.PI / 2;
      right.scale.set(0.3, 1, 0.8);
      right.position.set(0.9, 0, 0.2);
      this.group.add(right);
    } else if (cfg.wings === 'delta') {
      const tri = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.4, 3), mat);
      tri.rotation.x = Math.PI / 2;
      tri.scale.set(1.4, 0.06, 1);
      tri.position.set(0, 0, 0.2);
      this.group.add(tri);
    }
    // 'none' adds no wings.

    // ---- Fin ----
    if (cfg.fin === 'single') {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.5), mat);
      fin.position.set(0, 0.3, 0.6);
      this.group.add(fin);
    } else if (cfg.fin === 'twin') {
      const fGeo = new THREE.BoxGeometry(0.08, 0.45, 0.45);
      const f1 = new THREE.Mesh(fGeo, mat);
      f1.position.set(-0.5, 0.2, 0.6);
      f1.rotation.z = -0.3;
      this.group.add(f1);
      const f2 = new THREE.Mesh(fGeo, mat);
      f2.position.set(0.5, 0.2, 0.6);
      f2.rotation.z = 0.3;
      this.group.add(f2);
    }

    // Cockpit (always present, accent color)
    const cockpit = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), accent);
    cockpit.position.set(0, 0.18, -0.3);
    this.group.add(cockpit);

    // Nose tip (always present, accent color)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 4), accent);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0, -1.0);
    this.group.add(nose);

    // ---- Booster nozzles + flame ----
    const flameColor = FLAME_COLORS[cfg.flame] || FLAME_COLORS.blue;
    const flameMat = new THREE.MeshBasicMaterial({ color: flameColor });
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0x444444, flatShading: true, metalness: 0.6, roughness: 0.5,
    });

    let nozzles = [[0, 0, 1.0]];
    if (cfg.booster === 'twin') {
      nozzles = [[-0.35, 0, 1.0], [0.35, 0, 1.0]];
    } else if (cfg.booster === 'quad') {
      nozzles = [[-0.4, 0.2, 1.0], [0.4, 0.2, 1.0], [-0.4, -0.2, 1.0], [0.4, -0.2, 1.0]];
    }

    this._flames = [];
    for (const [x, y, z] of nozzles) {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.13, 0.18, 6), nozzleMat);
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(x, y, z);
      this.group.add(nozzle);

      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), flameMat);
      flame.rotation.x = Math.PI / 2;     // point flame backwards (+Z)
      flame.position.set(x, y, z + 0.35);
      this.group.add(flame);
      this._flames.push(flame);
    }

    // Ship is always at origin and faces -Z (Three.js camera convention).
    this.group.position.set(0, 0, 0);
  }

  // Set the rendered length of the ship in current-tier world units.
  // (Decoupled from real lengthMeters so the ship stays visible at galaxy/universe scales.)
  setVisualSize(worldUnits) {
    this.visualUnits = Math.max(worldUnits, 1e-30);
    // Ship mesh is ~2 units long along Z, so scale = visualUnits / 2.
    this.group.scale.setScalar(this.visualUnits / 2.0);
  }

  resetMotion() {
    this.velocity.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
  }

  resetOrientation() {
    this.quat.identity();
    this.group.quaternion.copy(this.quat);
    this.angVel.set(0, 0, 0);
  }

  // input: { throttle, yaw, pitch, roll, boost, brake, fullStop } from Controls.sample()
  // maxSpeed: world units / sec at full throttle (no boost)
  update(dt, input, maxSpeed) {
    if (input.fullStop) this.resetMotion();

    // Angular: target rates in body space (rad/s).
    const turnRate = 1.4; // rad/s at full deflection
    const tx = input.pitch * turnRate;
    const ty = input.yaw   * turnRate;
    const tz = -input.roll * turnRate;

    // Smooth toward target
    const k = 1 - Math.exp(-dt * 6);
    this.angVel.x += (tx - this.angVel.x) * k;
    this.angVel.y += (ty - this.angVel.y) * k;
    this.angVel.z += (tz - this.angVel.z) * k;

    // Apply rotation: dq = q * (0, omega/2) * dt -> use small-angle quaternion
    const halfDt = dt * 0.5;
    const dq = new THREE.Quaternion(
      this.angVel.x * halfDt,
      this.angVel.y * halfDt,
      this.angVel.z * halfDt,
      1
    ).normalize();
    this.quat.multiply(dq).normalize();
    this.group.quaternion.copy(this.quat);

    // Linear: forward = local -Z transformed by quat
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat);
    let speed = input.throttle * maxSpeed;
    if (input.boost) speed *= 10;
    if (input.brake) speed *= 0.05;

    // Smoothly approach desired velocity along forward (gives "inertia" feel without drift).
    const desired = forward.multiplyScalar(speed);
    const ka = 1 - Math.exp(-dt * 2.5);
    this.velocity.lerp(desired, ka);

    // Engine flame pulse based on throttle (scales every flame nozzle).
    const t = (input.throttle * (input.boost ? 1.6 : 1)) * (1 + 0.15 * Math.sin(performance.now() * 0.02));
    const s = 0.4 + t * 1.6;
    if (this._flames) {
      for (const f of this._flames) f.scale.set(1, 1, s);
    }
  }
}
