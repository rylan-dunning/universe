import * as THREE from 'three';
import { UNIVERSE, NAMED_GALAXIES } from '../data.js';

// Cosmic scene. World units = millions of light-years (Mly).
export function buildUniverse() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000002);
  scene.add(new THREE.AmbientLight(0x9fb6cc, 1.6));
  scene.add(new THREE.HemisphereLight(0xaaccee, 0x223355, 0.6));

  const R = UNIVERSE.observableRadius_Mly;

  // ---- Instanced low-poly galaxies, distributed with crude filament bias ----
  const N = UNIVERSE.galaxyCount;
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const inst = new THREE.InstancedMesh(geo, mat, N);
  inst.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  // Per-instance color (Three doesn't auto-give InstancedMesh a color buffer w/ vertexColors,
  // so we use setColorAt instead).
  inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);

  const dummy = new THREE.Object3D();
  const c = new THREE.Color();

  // Filament-ish bias: sample uniform in cube, weight toward "web" using a few sine lattices.
  let placed = 0, attempts = 0;
  while (placed < N && attempts < N * 20) {
    attempts++;
    const x = (Math.random() * 2 - 1) * R;
    const y = (Math.random() * 2 - 1) * R;
    const z = (Math.random() * 2 - 1) * R;
    const r = Math.sqrt(x*x + y*y + z*z);
    if (r > R) continue;

    // Quick-and-dirty cosmic web: prefer points where multiple sines are near 0.
    const k = UNIVERSE.filamentNoiseScale;
    const f1 = Math.abs(Math.sin(x * k) + Math.sin(y * k * 1.3) + Math.sin(z * k * 0.7));
    const f2 = Math.abs(Math.sin((x + y) * k * 0.5) + Math.sin((y - z) * k * 0.6));
    const filament = 1 - Math.min(1, (f1 + f2) * 0.3);
    if (Math.random() > 0.15 + filament * 0.85) continue;

    dummy.position.set(x, y, z);
    // Galaxies modeled at ~0.05 Mly visible size (~50 kly real ≈ correct order of magnitude)
    const s = 0.02 + Math.random() * 0.12;
    dummy.scale.set(s, s * (0.3 + Math.random() * 0.5), s);
    dummy.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    dummy.updateMatrix();
    inst.setMatrixAt(placed, dummy.matrix);

    // Redshift-ish tint with distance
    const t = r / R;
    c.setHSL(0.12 - t * 0.08, 0.4, 0.85 - t * 0.4);
    inst.instanceColor.setXYZ(placed, c.r, c.g, c.b);

    placed++;
  }
  inst.count = placed;
  inst.instanceColor.needsUpdate = true;
  scene.add(inst);

  // Big background fog of distant points to fill any gaps
  const bgN = 4000;
  const bgGeo = new THREE.BufferGeometry();
  const bgPos = new Float32Array(bgN * 3);
  for (let i = 0; i < bgN; i++) {
    const dir = new THREE.Vector3().randomDirection().multiplyScalar(R * 0.95);
    bgPos[i * 3 + 0] = dir.x;
    bgPos[i * 3 + 1] = dir.y;
    bgPos[i * 3 + 2] = dir.z;
  }
  bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPos, 3));
  scene.add(new THREE.Points(bgGeo, new THREE.PointsMaterial({ color: 0xaaccee, size: 14, sizeAttenuation: true, transparent: true, opacity: 1.0 })));

  // ---- Named galaxies (real distances) ----
  const nearestBodies = [];
  for (const g of NAMED_GALAXIES) {
    const dir = g.dist === 0
      ? new THREE.Vector3(0, 0, 0)
      : new THREE.Vector3().randomDirection();
    const p = dir.multiplyScalar(g.dist);
    const radius = 0.08 + Math.log10(1 + g.dist) * 0.05;
    const group = makeGalaxyGroup(g.color, radius);
    group.position.copy(p);
    // Random tilt so galaxies don't all face the same way.
    group.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    scene.add(group);
    nearestBodies.push({ name: g.name, mesh: group, radius, lod: group.userData.lod, lodRange: radius * 80 });
  }

  // Observable-universe boundary wireframe (for sense of scale)
  const boundary = new THREE.Mesh(
    new THREE.IcosahedronGeometry(R, 2),
    new THREE.MeshBasicMaterial({ color: 0x224466, wireframe: true, transparent: true, opacity: 0.18 })
  );
  scene.add(boundary);

  return {
    scene,
    update: () => {},
    spawn: new THREE.Vector3(0, 0.5, 0), // start at the Milky Way
    units: { name: 'Universe (1 unit = 1 Mly)', metersPerUnit: 9.4607304725808e21 },
    nearestBodies,
  };
}

// Galaxy LOD: a small bright icosahedron always visible, plus a hi-detail
// spiral disk + bulge that becomes visible when the player is close.
function makeGalaxyGroup(color, radius) {
  const group = new THREE.Group();

  // Far representation: bright faceted blob
  const far = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, 0),
    new THREE.MeshBasicMaterial({ color })
  );
  group.add(far);
  group.userData.far = far;

  // Hi-detail
  const lod = new THREE.Group();
  lod.visible = false;

  // Bulge
  const bulge = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * 0.7, 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
  );
  lod.add(bulge);

  // Disk: thin disk of points distributed in a few logarithmic spiral arms
  const N = 1500;
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const c = new THREE.Color(color);
  const armCount = 4;
  const armWind = 2.0;
  for (let i = 0; i < N; i++) {
    const arm = i % armCount;
    const t = Math.pow(Math.random(), 0.7);
    const r = t * radius * 4.5;
    const angle = (arm / armCount) * Math.PI * 2 + armWind * Math.log(1 + t * 9)
                  + (Math.random() - 0.5) * 0.4;
    positions[i * 3 + 0] = Math.cos(angle) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * radius * 0.15 * (1 - t * 0.7);
    positions[i * 3 + 2] = Math.sin(angle) * r;
    // Inner = warmer, outer = bluer
    colors[i * 3 + 0] = c.r * (1 - t * 0.3);
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b * (0.7 + t * 0.5);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const disk = new THREE.Points(geo, new THREE.PointsMaterial({
    size: radius * 0.08, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 0.95,
  }));
  lod.add(disk);

  // Halo wireframe
  const halo = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * 5, 1),
    new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.08 })
  );
  lod.add(halo);

  group.add(lod);
  group.userData.lod = lod;
  return group;
}
