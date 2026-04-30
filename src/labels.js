import * as THREE from 'three';

// Lightweight DOM label overlay. Projects world positions through the camera
// each frame and positions absolutely-placed divs. Pools DOM nodes; never
// creates/destroys per frame.
export class Labels {
  constructor(container, onClick) {
    this.root = document.createElement('div');
    this.root.id = 'labels';
    container.appendChild(this.root);
    this.pool = [];      // div pool
    this.entries = [];   // active label data { body, el }
    this._v = new THREE.Vector3();
    this.onClick = onClick || (() => {});

  }

  setBodies(bodies) {
    // Reset pool usage.
    for (const e of this.entries) e.el.style.display = 'none';
    this.entries.length = 0;
    for (let i = 0; i < bodies.length; i++) {
      let el = this.pool[i];
      if (!el) {
        el = document.createElement('div');
        el.className = 'label';
        const dot = document.createElement('span');
        dot.className = 'dot';
        const txt = document.createElement('span');
        txt.className = 'txt';
        el.appendChild(dot);
        el.appendChild(txt);
        // Click handler — index closure via dataset because the bound body
        // changes each setBodies() call.
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const idx = parseInt(el.dataset.idx, 10);
          const entry = this.entries[idx];
          if (entry) this.onClick(entry.body);
        });
        this.root.appendChild(el);
        this.pool.push(el);
      }
      el.querySelector('.txt').textContent = bodies[i].name;
      el.style.display = '';
      el.dataset.idx = String(i);
      this.entries.push({ body: bodies[i], el });
    }
  }

  update(camera, w, h) {
    const cx = w * 0.5, cy = h * 0.5;
    const margin = 28; // px from screen edge for clamped labels
    for (let i = 0; i < this.entries.length; i++) {
      const { body, el } = this.entries[i];
      body.mesh.getWorldPosition(this._v);
      const dist = this._v.distanceTo(camera.position);
      // Project to NDC. After project(), if the point is behind the camera in
      // view space, the result's signs flip — so we test that explicitly.
      const worldX = this._v.x, worldY = this._v.y, worldZ = this._v.z;
      // View-space position to know "behind camera" reliably.
      const vx = worldX - camera.position.x;
      const vy = worldY - camera.position.y;
      const vz = worldZ - camera.position.z;
      // camera forward in world: -Z of camera matrix
      const fwdX = -camera.matrixWorld.elements[8];
      const fwdY = -camera.matrixWorld.elements[9];
      const fwdZ = -camera.matrixWorld.elements[10];
      const inFront = (vx * fwdX + vy * fwdY + vz * fwdZ) > 0;

      this._v.set(worldX, worldY, worldZ).project(camera);
      let nx = this._v.x, ny = this._v.y;
      const onScreen = inFront && nx > -1 && nx < 1 && ny > -1 && ny < 1;

      let sx, sy, clamped = false;
      if (onScreen) {
        sx = ( nx * cx) + cx;
        sy = (-ny * cy) + cy;
      } else {
        // Compute a screen-space direction from center toward the body.
        // For points behind the camera, the projected NDC is mirrored — flip it
        // so the indicator points to the *real* direction of the body.
        if (!inFront) { nx = -nx; ny = -ny; }
        // If the projected vector is degenerate (very close to center), use a
        // fallback derived from the camera-relative direction projected onto
        // the camera's right/up axes.
        if (Math.abs(nx) < 1e-6 && Math.abs(ny) < 1e-6) {
          const rx = camera.matrixWorld.elements[0];
          const ry = camera.matrixWorld.elements[1];
          const rz = camera.matrixWorld.elements[2];
          const ux = camera.matrixWorld.elements[4];
          const uy = camera.matrixWorld.elements[5];
          const uz = camera.matrixWorld.elements[6];
          nx = vx * rx + vy * ry + vz * rz;
          ny = vx * ux + vy * uy + vz * uz;
        }
        // Clamp the (nx, ny) ray to the screen rectangle inset by `margin`.
        const maxX = (w - 2 * margin) * 0.5;
        const maxY = (h - 2 * margin) * 0.5;
        const ax = Math.abs(nx), ay = Math.abs(ny);
        // Determine scale s such that (s*nx, s*ny) hits the rectangle border.
        const sxScale = ax > 1e-9 ? maxX / ax : Infinity;
        const syScale = ay > 1e-9 ? maxY / ay : Infinity;
        const sScale = Math.min(sxScale, syScale);
        const px = nx * sScale;
        const py = ny * sScale;
        sx = cx + px;
        sy = cy - py;
        clamped = true;
      }
      el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
      el.classList.toggle('clamped', clamped);
      const alpha = clamped ? 0.55 : Math.max(0.25, Math.min(1, 1 - Math.log10(1 + dist) * 0.04));
      el.style.opacity = String(alpha);
    }
  }
}
