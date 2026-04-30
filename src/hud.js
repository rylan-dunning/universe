export class Hud {
  constructor() {
    this.scale    = document.getElementById('hud-scale');
    this.ship     = document.getElementById('hud-ship');
    this.speed    = document.getElementById('hud-speed');
    this.throttle = document.getElementById('hud-throttle');
    this.near     = document.getElementById('hud-near');
    this.dist     = document.getElementById('hud-dist');
    this.context  = document.getElementById('info-context');
    this.infoSpeed   = document.getElementById('info-speed');
    this.energy   = document.getElementById('info-energy');
    this.metaphor = document.getElementById('info-metaphor');
    this.help     = document.getElementById('help');
    this._last = {};
  }

  set(field, value) {
    if (this._last[field] === value) return;
    this._last[field] = value;
    const el = this[field];
    if (el) el.textContent = value;
  }

  toggleHelp() { this.help.classList.toggle('hidden'); }
  hideHelp()   { this.help.classList.add('hidden'); }
}
