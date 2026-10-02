export class Starfield {
  constructor(canvas, { density = 0.00012, drift = 4, tint = [190, 182, 230], clusters = true } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.density = density;
    this.drift = drift;
    this.tint = tint;
    this.clusters = clusters;
    this.stars = [];
    this.running = false;
    this.visible = true;
    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(canvas);
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    const count = Math.round(w * h * this.density);
    this.stars = [];
    for (let i = 0; i < count; i++) this.stars.push(this.make(Math.random() * w, Math.random() * h));
    if (this.clusters) {
      const groups = Math.round(count / 18);
      for (let g = 0; g < groups; g++) {
        const gx = Math.random() * w, gy = Math.random() * h;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.stars.push(this.make(gx + i * (7 + Math.random() * 10), gy + (Math.random() - 0.5) * 4));
      }
    }
  }

  make(x, y) {
    return {
      x, y,
      z: 0.3 + Math.random() * 0.7,
      s: Math.random() < 0.08 ? 2 : 1,
      a: 0.15 + Math.random() * 0.55,
      p: Math.random() * Math.PI * 2,
      f: 0.4 + Math.random() * 1.6,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (this.visible) this.draw(now / 1000, dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  draw(t, dt) {
    const { ctx, w, h, dpr } = this;
    if (!w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const [r, g, b] = this.tint;
    for (const s of this.stars) {
      s.x -= this.drift * s.z * dt;
      if (s.x < -4) { s.x = w + 4; s.y = Math.random() * h; }
      const tw = 0.55 + 0.45 * Math.sin(t * s.f + s.p);
      ctx.fillStyle = `rgba(${r},${g},${b},${(s.a * tw).toFixed(3)})`;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s);
    }
  }
}
