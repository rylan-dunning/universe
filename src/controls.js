// Flight-sim two-stick keyboard input. Pure state object; consumed by Ship.
export class Controls {
  constructor(target = window) {
    this.keys = new Set();
    this.throttle = 0;          // 0..1
    this.boost = false;
    this.brake = false;
    this.fullStop = false;
    this.scaleRequest = null;   // 0|1|2 or null
    this.shipScaleDelta = 0;    // -1, 0, +1 per frame
    this.resetOrient = false;
    this.toggleHelp = false;

    target.addEventListener('keydown', (e) => this._down(e));
    target.addEventListener('keyup',   (e) => this._up(e));
    target.addEventListener('blur',    () => this.keys.clear());
  }

  _down(e) {
    const k = e.key;
    this.keys.add(k.length === 1 ? k.toLowerCase() : k);
    if (k === '1') this.scaleRequest = 0;
    else if (k === '2') this.scaleRequest = 1;
    else if (k === '3') this.scaleRequest = 2;
    else if (k === '[') this.shipScaleDelta = -1;
    else if (k === ']') this.shipScaleDelta = +1;
    else if (k.toLowerCase() === 'r') this.resetOrient = true;
    else if (k.toLowerCase() === 'h') this.toggleHelp = true;
    else if (k === ' ') this.fullStop = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(k)) e.preventDefault();
  }

  _up(e) {
    const k = e.key;
    this.keys.delete(k.length === 1 ? k.toLowerCase() : k);
  }

  // Returns axis values in [-1, 1]
  sample(dt) {
    const k = this.keys;

    // Throttle (W/S) — sticky, like a real throttle lever.
    if (k.has('w')) this.throttle = Math.min(1, this.throttle + dt * 0.6);
    if (k.has('s')) this.throttle = Math.max(0, this.throttle - dt * 0.6);

    // A/D yaw (reversed: A turns right, D turns left, per user preference)
    const yaw   = (k.has('a') ? 1 : 0) - (k.has('d') ? 1 : 0);
    const pitch = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp')   ? 1 : 0);
    const roll  = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);

    this.boost = k.has('Shift');
    this.brake = k.has('Control');

    const out = {
      throttle: this.throttle,
      yaw, pitch, roll,
      boost: this.boost,
      brake: this.brake,
      fullStop: this.fullStop,
      scaleRequest: this.scaleRequest,
      shipScaleDelta: this.shipScaleDelta,
      resetOrient: this.resetOrient,
      toggleHelp: this.toggleHelp,
      fire: k.has('f'),
    };
    // Clear one-shot flags
    this.fullStop = false;
    this.scaleRequest = null;
    this.shipScaleDelta = 0;
    this.resetOrient = false;
    this.toggleHelp = false;
    return out;
  }
}
