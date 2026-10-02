const MOON = [
  '       .:::o:o#:.',
  ' .  .:oo.. :o.',
  '  :oo:.oo.o:',
  ' .#o:.    :.',
  ' #:::.:..:',
  'o#::. . o.',
  'o#.o:   :o',
  'o###o   o#',
  ':#oo::  .oo.',
  ' o#o:o..   :o:.',
  '  o#ooo::.:::#::         .:.',
  '  .:o#oo::.: ..:oo::.o:#o.',
  '     :o#####:#::o:.::o:',
  '        .::oo####::.',
  '                    .',
];

const LEVEL = { '.': 1, ':': 2, 'o': 3, '#': 4 };
const BY_LEVEL = [' ', '.', ':', 'o', '#'];

export class AsciiMoon {
  constructor(el, { speed = 1 } = {}) {
    this.el = el;
    this.speed = speed;
    this.width = Math.max(...MOON.map((l) => l.length));
    this.grid = MOON.map((l) => l.padEnd(this.width, ' ').split(''));
    this.cells = [];
    this.grid.forEach((row, y) => row.forEach((ch, x) => { if (ch !== ' ') this.cells.push({ x, y }); }));
    this.flicker = new Map();
    this.t = 0;
    this.running = false;
    this.last = 0;
    this.acc = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt * this.speed;
      this.acc += dt;
      if (this.acc >= 1 / 20) {
        this.acc = 0;
        this.render();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  render() {
    if (this.running && Math.random() < 0.55) {
      const c = this.cells[Math.floor(Math.random() * this.cells.length)];
      this.flicker.set(c.y * this.width + c.x, this.t + 0.25 + Math.random() * 0.5);
    }
    const band = ((this.t * 0.22) % 1.6) - 0.3;
    let out = '';
    for (let y = 0; y < this.grid.length; y++) {
      for (let x = 0; x < this.width; x++) {
        const ch = this.grid[y][x];
        if (ch === ' ') { out += ' '; continue; }
        let lv = LEVEL[ch] || 1;
        const pos = (x / this.width) * 0.65 + (y / this.grid.length) * 0.35;
        if (Math.abs(pos - band) < 0.04 && lv < 4) lv += 1;
        const key = y * this.width + x;
        const until = this.flicker.get(key);
        if (until !== undefined) {
          if (until < this.t) this.flicker.delete(key);
          else lv = Math.max(1, lv - 1);
        }
        out += BY_LEVEL[lv];
      }
      out += '\n';
    }
    this.el.textContent = out;
  }
}
