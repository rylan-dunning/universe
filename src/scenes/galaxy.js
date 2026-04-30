import * as THREE from 'three';
import { GALAXY, NEARBY_STARS } from '../data.js';

// Galactic scene. World units = light-years.
export function buildGalaxy() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000003);
  scene.add(new THREE.AmbientLight(0x9fb6cc, 1.8));
  scene.add(new THREE.HemisphereLight(0xaaccee, 0x223355, 0.7));

  // Distant background sky-sphere of points (so empty regions still feel starry).
  scene.add(buildBackgroundStars(8_000_000, 3000));

  const radius = GALAXY.diameter_ly / 2;

  // -------- Spiral star field (instanced points for sheer count) --------
  const N = GALAXY.starCount;
  const positions = new Float32Array(N * 3);
  const colors    = new Float32Array(N * 3);
  const tmpColor  = new THREE.Color();

  for (let i = 0; i < N; i++) {
    // Mix: 30% bulge, 70% disk along spiral arms
    let x, y, z;
    if (Math.random() < 0.3) {
      // Bulge: gaussian-ish ball
      const r = Math.pow(Math.random(), 1.7) * GALAXY.bulgeRadius_ly;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      x = r * Math.sin(ph) * Math.cos(th);
      y = r * Math.cos(ph) * 0.6;
      z = r * Math.sin(ph) * Math.sin(th);
      tmpColor.setHSL(0.10, 0.6, 0.7);
    } else {
      // Disk + arms (logarithmic spiral)
      const arm = Math.floor(Math.random() * GALAXY.armCount);
      const armOffset = (arm / GALAXY.armCount) * Math.PI * 2;
      const t = Math.pow(Math.random(), 0.6); // bias outward
      const r = t * radius;
      const angle = armOffset + GALAXY.armWindings * Math.log(1 + t * 9);
      const jitterR = (Math.random() - 0.5) * radius * 0.06;
      const jitterA = (Math.random() - 0.5) * 0.35;
      const a = angle + jitterA;
      x = Math.cos(a) * (r + jitterR);
      z = Math.sin(a) * (r + jitterR);
      y = (Math.random() - 0.5) * GALAXY.thickness_ly * (1 - t * 0.7);
      const hue = 0.55 + Math.random() * 0.12; // blue-white in arms
      tmpColor.setHSL(hue, 0.5, 0.65 + Math.random() * 0.2);
    }

    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    colors[i * 3 + 0] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  const starsGeo = new THREE.BufferGeometry();
  starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starsGeo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
  const starsMat = new THREE.PointsMaterial({
    size: 35,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
  });
  scene.add(new THREE.Points(starsGeo, starsMat));

  // -------- Faceted "hero" stars near the player (low-poly look up close) --------
  // Use InstancedMesh so we can scatter many cheaply.
  const heroCount = GALAXY.brightStarCount;
  const heroGeo = new THREE.IcosahedronGeometry(1, 0);
  const heroMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: false });
  const hero = new THREE.InstancedMesh(heroGeo, heroMat, heroCount);
  hero.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const dummy = new THREE.Object3D();

  // Scatter near sun position (we put player at sun offset)
  const sunPos = new THREE.Vector3(GALAXY.sunOffset_ly, 0, 0);
  for (let i = 0; i < heroCount; i++) {
    const dist = 1 + Math.pow(Math.random(), 2) * 80; // ly from sun
    const dir = new THREE.Vector3().randomDirection();
    const p = sunPos.clone().add(dir.multiplyScalar(dist));
    dummy.position.copy(p);
    const r = 0.4 + Math.random() * 1.2; // visual size in ly (huge by reality but visible)
    dummy.scale.setScalar(r * 0.05);
    dummy.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    dummy.updateMatrix();
    hero.setMatrixAt(i, dummy.matrix);
  }
  scene.add(hero);

  // -------- Named real stars (with "named" markers in HUD) --------
  const namedBodies = [];
  for (const s of NEARBY_STARS) {
    const dir = new THREE.Vector3().randomDirection();
    const p = sunPos.clone().add(dir.multiplyScalar(s.dist));
    const radius = Math.max(0.4, 0.15 * Math.cbrt(s.r));
    const group = makeStarGroup(s.color, radius);
    group.position.copy(p);
    scene.add(group);
    namedBodies.push({ name: s.name, mesh: group, radius, lod: group.userData.lod, lodRange: radius * 80 });
  }

  // Sun marker (where the player spawns)
  const sunRadius = 0.5;
  const sunGroup = makeStarGroup(0xffd27a, sunRadius);
  sunGroup.position.copy(sunPos);
  scene.add(sunGroup);
  namedBodies.unshift({ name: 'Sun', mesh: sunGroup, radius: sunRadius, lod: sunGroup.userData.lod, lodRange: sunRadius * 80 });

  // Galactic center marker
  const gc = new THREE.Group();
  const gcCore = new THREE.Mesh(
    new THREE.IcosahedronGeometry(80, 1),
    new THREE.MeshBasicMaterial({ color: 0xffe6a8, wireframe: true })
  );
  gc.add(gcCore);
  // Hi-LOD: bright core + accretion glow ring
  const gcDetail = new THREE.Group();
  gcDetail.visible = false;
  const gcCore2 = new THREE.Mesh(
    new THREE.IcosahedronGeometry(60, 2),
    new THREE.MeshBasicMaterial({ color: 0xffd980 })
  );
  const gcRing = new THREE.Mesh(
    new THREE.RingGeometry(110, 200, 48, 1),
    new THREE.MeshBasicMaterial({ color: 0xff9933, side: THREE.DoubleSide, transparent: true, opacity: 0.4 })
  );
  gcRing.rotation.x = Math.PI / 2;
  gcDetail.add(gcCore2);
  gcDetail.add(gcRing);
  gc.add(gcDetail);
  gc.userData.lod = gcDetail;
  scene.add(gc);
  namedBodies.push({ name: 'Galactic Center (Sgr A*)', mesh: gc, radius: 80, lod: gcDetail, lodRange: 8000 });

  return {
    scene,
    update: () => {},
    spawn: sunPos.clone().add(new THREE.Vector3(0, 5, 0)),
    units: { name: 'Galactic (1 unit = 1 ly)', metersPerUnit: 9.4607304725808e15 },
    nearestBodies: namedBodies,
  };
}

function buildBackgroundStars(radius, count) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random(), v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    pos[i * 3 + 0] = radius * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = radius * Math.cos(phi);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffffff, size: radius * 0.0014, sizeAttenuation: true, transparent: true, opacity: 1.0,
  }));
}

// Build a star "model": a tiny faceted point sphere (always visible) plus a
// hi-detail group (corona + halo wireframe) hidden until the camera comes
// close. Returned group has `userData.lod` pointing to the hi-detail child.
function makeStarGroup(color, radius) {
  const group = new THREE.Group();

  // Always-visible far representation: small bright icosahedron.
  const far = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, 0),
    new THREE.MeshBasicMaterial({ color })
  );
  group.add(far);
  group.userData.far = far;

  // Hi-detail: bigger faceted sphere, soft corona shell, wireframe halo.
  const lod = new THREE.Group();
  lod.visible = false;
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * 1.0, 2),
    new THREE.MeshBasicMaterial({ color })
  );
  const corona = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * 1.4, 1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, wireframe: true })
  );
  const glow = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * 2.2, 1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06 })
  );
  lod.add(core);
  lod.add(corona);
  lod.add(glow);
  group.add(lod);
  group.userData.lod = lod;
  return group;
}
