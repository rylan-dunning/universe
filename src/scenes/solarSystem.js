import * as THREE from 'three';
import { SUN, PLANETS, KM_PER_AU } from '../data.js';

const SOLAR_BODY_VISUAL_SCALE = 14;

// Solar system scene. World units = kilometers.
// At 1 unit = 1 km, Sun radius = 696,340; Neptune orbit ~ 4.5e9. Float32 holds
// this comfortably with a logarithmic depth buffer.
export function buildSolarSystem() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000005);

  // Lighting: point light at sun + brighter ambient so the ship and night-side
  // surfaces are always visible.
  const sunLight = new THREE.PointLight(0xffe9c0, 4.0, 0, 0);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x607890, 1.6));
  // Soft fill from "above" so the ship reads against dark space.
  const fill = new THREE.HemisphereLight(0x99bbff, 0x223355, 0.6);
  scene.add(fill);

  // Sun
  const sunRadius = SUN.radius * SOLAR_BODY_VISUAL_SCALE;
  const sunGeo = new THREE.IcosahedronGeometry(sunRadius, 2);
  const sunMat = new THREE.MeshBasicMaterial({ color: SUN.color });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  scene.add(sun);

  // Sun corona (faceted halo)
  const corona = new THREE.Mesh(
    new THREE.IcosahedronGeometry(sunRadius * 1.15, 1),
    new THREE.MeshBasicMaterial({ color: 0xffae3a, transparent: true, opacity: 0.18, wireframe: true })
  );
  scene.add(corona);

  // Background star field — distant, scale-locked, drawn first.
  scene.add(buildStarfield(60_000_000_000, 6000));

  // Planets
  const bodies = [{ name: SUN.name, mesh: sun, radius: sunRadius, orbit: 0, angle: 0, year: 1 }];
  const planetMats = new Map();

  for (const p of PLANETS) {
    const mat = new THREE.MeshStandardMaterial({ color: p.color, flatShading: true, roughness: 0.85 });
    planetMats.set(p.name, mat);
    const visualRadius = p.radius * SOLAR_BODY_VISUAL_SCALE;
    const geo = new THREE.IcosahedronGeometry(visualRadius, p.radius > 30000 ? 2 : 1);
    const mesh = new THREE.Mesh(geo, mat);
    const angle = Math.random() * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * p.orbit, 0, Math.sin(angle) * p.orbit);
    scene.add(mesh);

    // Orbit ring (thin faceted line loop)
    scene.add(orbitLine(p.orbit, 0x223344));

    // Saturn rings
    if (p.ring) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(p.ring[0] * SOLAR_BODY_VISUAL_SCALE, p.ring[1] * SOLAR_BODY_VISUAL_SCALE, 64, 1),
        new THREE.MeshBasicMaterial({ color: 0xddc28a, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
      );
      ring.rotation.x = Math.PI / 2 + 0.3;
      mesh.add(ring);
    }

    bodies.push({ name: p.name, mesh, radius: visualRadius, orbit: p.orbit, angle, year: p.year });

    // Moons: orbit their parent planet. Not searchable / not labeled — purely
    // visual flavor.
    if (p.moons) {
      mesh.userData.moons = [];
      for (const m of p.moons) {
        const moonRadius = m.radius * SOLAR_BODY_VISUAL_SCALE;
        const mGeo = new THREE.IcosahedronGeometry(moonRadius, m.radius > 1000 ? 1 : 0);
        const mMat = new THREE.MeshStandardMaterial({ color: m.color, flatShading: true, roughness: 1 });
        const mMesh = new THREE.Mesh(mGeo, mMat);
        scene.add(mMesh);
        mesh.userData.moons.push({
          mesh: mMesh,
          radius: moonRadius,
          orbit: m.orbit,
          period: m.period,             // days; negative = retrograde
          angle: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  // Earth's Moon is now built via the PLANETS data above; no special-case here.

  function update(t) {
    // Animate orbits (sped up for visibility: 1 second of real time = 1 day).
    for (const b of bodies) {
      if (!b.year) continue;
      b.angle += (Math.PI * 2) / (b.year * 60); // very slow but visible at long sit
      b.mesh.position.set(Math.cos(b.angle) * b.orbit, 0, Math.sin(b.angle) * b.orbit);

      // Update any moons of this planet.
      const moons = b.mesh.userData.moons;
      if (moons) {
        for (const m of moons) {
          // Period is in days; "1 day per real second" so divide by period * 60
          // for ~1 orbit per period seconds. Negative period = retrograde.
          m.angle += (Math.PI * 2) / (m.period * 60);
          m.mesh.position.set(
            b.mesh.position.x + Math.cos(m.angle) * m.orbit,
            0,
            b.mesh.position.z + Math.sin(m.angle) * m.orbit
          );
        }
      }
    }
    corona.rotation.y += 0.001;
  }

  // Build a flat list of all moons (not "named/clickable", just for the
  // initial spawn-near-Earth helper below).
  const earthBody = bodies.find(b => b.name === 'Earth');
  const moonObjs = [];
  for (const b of bodies) {
    if (b.mesh.userData.moons) for (const m of b.mesh.userData.moons) moonObjs.push({ name: '_moon', mesh: m.mesh, radius: m.radius || 100 });
  }

  return {
    scene,
    update,
    bodies,            // for nearest-body HUD
    spawn: new THREE.Vector3(KM_PER_AU * 1.0, KM_PER_AU * 0.05, KM_PER_AU * 0.1), // near Earth
    units: { name: 'Solar (1 unit = 1 km)', metersPerUnit: 1000 },
    // Only the Sun, planets, and Earth's Moon are clickable / labeled.
    nearestBodies: bodies.concat(
      earthBody && earthBody.mesh.userData.moons
        ? [{ name: 'Moon', mesh: earthBody.mesh.userData.moons[0].mesh, radius: earthBody.mesh.userData.moons[0].radius || 1737 }]
        : []
    ),
  };
}

function orbitLine(radius, color) {
  const segs = 128;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }));
}

// Cheap big sky-sphere of points for the "fixed" celestial sphere.
function buildStarfield(radius, count) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Uniform on sphere
    const u = Math.random(), v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius;
    pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: radius * 0.0016, sizeAttenuation: true, transparent: true, opacity: 1.0 });
  return new THREE.Points(geo, mat);
}
