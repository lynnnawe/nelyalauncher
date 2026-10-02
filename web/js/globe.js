function hash3(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 1440662683 + seed * 2654435761) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function noise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

function fbm(x, y, z, seed) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < 5; i++) {
    v += a * noise3(x * f, y * f, z * f, seed + i * 17);
    f *= 2.03;
    a *= 0.5;
  }
  return v;
}

export class Globe {
  constructor(canvas, { seed = 8127, count = 4200 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.seed = seed;
    this.yaw = 0.6;
    this.pitch = 0.32;
    this.vyaw = 0;
    this.spin = 0.07;
    this.target = null;
    this.markers = [];
    this.selected = null;
    this.hovered = null;
    this.running = false;
    this.visible = true;
    this.intro = 0;
    this.build(count);
    this.bind();
    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(canvas);
    this.resize();
  }

  build(count) {
    const pts = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const n = fbm(x * 1.45 + 10, y * 1.45 + 10, z * 1.45 + 10, this.seed);
      const polar = Math.abs(y) > 0.9 ? 0.06 : 0;
      const v = n + polar;
      const land = v > 0.49;
      const coast = Math.abs(v - 0.49) < 0.016;
      pts.push({ x, y, z, land, coast, h: v });
    }
    this.points = pts;

    const nodes = pts.filter((p) => p.land && Math.random() < 0.16);
    const edges = [];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const near = [];
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const b = nodes[j];
        const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
        if (d < 0.03) near.push([d, b]);
      }
      near.sort((p, q) => p[0] - q[0]);
      near.slice(0, 3).forEach(([, b]) => edges.push([a, b]));
    }
    this.edges = edges;

    const grat = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const line = [];
      for (let lon = 0; lon <= 360; lon += 6) line.push(this.ll(lat, lon));
      grat.push(line);
    }
    for (let lon = 0; lon < 180; lon += 30) {
      const line = [];
      for (let lat = 0; lat <= 360; lat += 6) {
        const a = (lat * Math.PI) / 180, o = (lon * Math.PI) / 180;
        line.push({ x: Math.cos(a) * Math.sin(o), y: Math.sin(a), z: Math.cos(a) * Math.cos(o) });
      }
      grat.push(line);
    }
    this.graticule = grat;
  }

  async setExtreme(on) {
    this.mode = on ? 'extreme' : 'normal';
    if (!on || this.land) return;
    try {
      const r = await fetch('geo/land.json');
      const rings = await r.json();
      this.buildLand(rings);
    } catch {
      this.mode = 'normal';
    }
  }

  buildLand(rings) {
    const toV = (lon, lat) => this.ll(lat, lon);
    const polys = rings.map((flat) => {
      const pts = [];
      let minX = 999, maxX = -999, minY = 999, maxY = -999;
      for (let i = 0; i < flat.length; i += 2) {
        const lon = flat[i] / 10, lat = flat[i + 1] / 10;
        pts.push([lon, lat]);
        if (lon < minX) minX = lon;
        if (lon > maxX) maxX = lon;
        if (lat < minY) minY = lat;
        if (lat > maxY) maxY = lat;
      }
      return { pts, minX, maxX, minY, maxY };
    });
    const inside = (lon, lat) => {
      for (const poly of polys) {
        if (lon < poly.minX || lon > poly.maxX || lat < poly.minY || lat > poly.maxY) continue;
        let c = false;
        const pts = poly.pts;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
        }
        if (c) return true;
      }
      return false;
    };
    this.coast = polys.map((poly) => {
      const out = [];
      for (let i = 0; i < poly.pts.length; i++) {
        const a = poly.pts[i], b = poly.pts[(i + 1) % poly.pts.length];
        out.push(toV(a[0], a[1]));
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d > 3 && d < 60) {
          const n = Math.ceil(d / 3);
          for (let k = 1; k < n; k++) out.push(toV(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n));
        }
      }
      return out;
    });
    let seed = 1337;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const landPts = [];
    const ocean = [];
    for (let i = 0; i < 7000; i++) {
      const y = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      const p = { x: Math.cos(th) * r, y, z: Math.sin(th) * r };
      const lat = (Math.asin(p.y) * 180) / Math.PI;
      const lon = (Math.atan2(p.x, p.z) * 180) / Math.PI;
      if (inside(lon, lat)) landPts.push(p);
      else if (i % 6 === 0) ocean.push(p);
    }
    const edges = [];
    for (let i = 0; i < landPts.length; i++) {
      const a = landPts[i];
      const near = [];
      for (let j = 0; j < landPts.length; j++) {
        if (i === j) continue;
        const b = landPts[j];
        const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
        if (d < 0.009) near.push([d, j]);
      }
      near.sort((m, n) => m[0] - n[0]);
      near.slice(0, 3 + (i % 2)).forEach(([, j]) => { if (j > i || near.length < 3) edges.push([a, landPts[j]]); });
    }
    this.land = { points: landPts, edges, ocean };
  }

  drawLand(ctx, cx, cy, R, t) {
    const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.05, cx, cy, R);
    body.addColorStop(0, '#191919');
    body.addColorStop(0.55, '#090909');
    body.addColorStop(1, '#020202');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    const lx = -0.55, ly = 0.62, lz = 0.56;
    const P = this.coast.map((ring) => ring.map((p) => this.project(p)));

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    for (const ring of P) {
      let pen = false;
      for (const [x, y, z] of ring) {
        if (z > 0.02) { pen = false; continue; }
        const sx = cx + x * R, sy = cy - y * R;
        if (!pen) { ctx.moveTo(sx, sy); pen = true; } else ctx.lineTo(sx, sy);
      }
    }
    ctx.stroke();

    for (const p of this.land.ocean) {
      const [x, y, z] = this.project(p);
      if (z < 0) continue;
      const light = Math.max(0, x * lx + y * ly + z * lz);
      ctx.fillStyle = `rgba(255,255,255,${(0.04 + light * 0.08).toFixed(3)})`;
      ctx.fillRect(cx + x * R, cy - y * R, 1, 1);
    }

    ctx.lineWidth = 0.7;
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      for (const [a, b] of this.land.edges) {
        const pa = this.project(a), pb = this.project(b);
        const zz = Math.min(pa[2], pb[2]);
        if (zz < 0) continue;
        const lit = Math.max(0, pa[0] * lx + pa[1] * ly + pa[2] * lz);
        if ((lit > 0.35) !== !!pass) continue;
        ctx.moveTo(cx + pa[0] * R, cy - pa[1] * R);
        ctx.lineTo(cx + pb[0] * R, cy - pb[1] * R);
      }
      ctx.stroke();
    }
    for (const p of this.land.points) {
      const [x, y, z] = this.project(p);
      if (z < 0) continue;
      const light = Math.max(0, x * lx + y * ly + z * lz);
      ctx.fillStyle = `rgba(255,255,255,${(0.35 + light * 0.6).toFixed(3)})`;
      ctx.fillRect(cx + x * R - 1, cy - y * R - 1, 2, 2);
    }

    const stroke = (width, alpha) => {
      ctx.lineWidth = width;
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      for (const ring of P) {
        let pen = false;
        for (const [x, y, z] of ring) {
          if (z < -0.01) { pen = false; continue; }
          const sx = cx + x * R, sy = cy - y * R;
          if (!pen) { ctx.moveTo(sx, sy); pen = true; } else ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();
    };
    stroke(7, 0.04);
    stroke(3.4, 0.12);
    stroke(1.6, 0.95);

    const glare = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.62, 0, cx - R * 0.38, cy - R * 0.62, R * 0.55);
    glare.addColorStop(0, 'rgba(255,255,255,0.8)');
    glare.addColorStop(0.18, 'rgba(255,255,255,0.35)');
    glare.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    glare.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glare;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    const shade = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.55, cx, cy, R * 1.02);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = shade;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
  }

  ll(lat, lon) {
    const a = (lat * Math.PI) / 180, o = (lon * Math.PI) / 180;
    return { x: Math.cos(a) * Math.sin(o), y: Math.sin(a), z: Math.cos(a) * Math.cos(o) };
  }

  setMarkers(list) {
    this.markers = list.map((m) => ({ ...m, p: this.ll(m.lat, m.lon) }));
  }

  focus(id) {
    const m = this.markers.find((k) => k.id === id);
    if (!m) return;
    let ty = -(m.lon * Math.PI) / 180;
    const two = Math.PI * 2;
    while (ty - this.yaw > Math.PI) ty -= two;
    while (ty - this.yaw < -Math.PI) ty += two;
    this.target = { yaw: ty };
  }

  release() {
    this.target = null;
  }

  bind() {
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.canvas.setPointerCapture(e.pointerId);
      this.target = null;
      this.canvas.classList.add('grabbing');
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const now = performance.now();
      const dt = Math.max(1, now - drag.t) / 1000;
      const k = 1 / (this.r || 200);
      this.yaw += dx * k;
      this.vyaw = (dx * k) / dt;
      drag = { x: e.clientX, y: e.clientY, t: now };
    });
    const end = () => {
      drag = null;
      this.canvas.classList.remove('grabbing');
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.dragging = () => !!drag;
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
    this.r = Math.min(w, h) * 0.44;
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.step(dt);
      if (this.visible) this.draw(now / 1000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  step(dt) {
    this.intro = Math.min(1, this.intro + dt * 0.7);
    if (this.dragging && this.dragging()) return;
    if (this.target) {
      this.yaw += (this.target.yaw - this.yaw) * Math.min(1, dt * 4);
      this.vyaw = 0;
      return;
    }
    this.yaw += (this.spin + this.vyaw) * dt;
    this.vyaw *= Math.pow(0.08, dt);
  }

  project(p) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const x1 = p.x * cy + p.z * sy;
    const z1 = -p.x * sy + p.z * cy;
    const y2 = p.y * cp - z1 * sp;
    const z2 = p.y * sp + z1 * cp;
    return [x1, y2, z2];
  }

  draw(t) {
    const { ctx, w, h, dpr } = this;
    if (!w) return;
    const ease = 1 - Math.pow(1 - this.intro, 3);
    const R = this.r * (0.86 + 0.14 * ease);
    const cx = w / 2, cy = h / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = ease;

    const edge = Math.min(w, h) / 2;
    const halo = ctx.createRadialGradient(cx, cy, R * 0.98, cx, cy, edge);
    halo.addColorStop(0, 'rgba(200,195,235,0.12)');
    halo.addColorStop(0.35, 'rgba(200,195,235,0.04)');
    halo.addColorStop(1, 'rgba(200,195,235,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, edge, 0, Math.PI * 2);
    ctx.fill();

    if (this.mode === 'extreme' && this.land) {
      this.drawLand(ctx, cx, cy, R, t);
      this.drawMarkers(ctx, cx, cy, R, t);
      ctx.globalAlpha = 1;
      return;
    }

    const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    body.addColorStop(0, '#1a1922');
    body.addColorStop(0.6, '#0b0b10');
    body.addColorStop(1, '#050507');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    const lx = -0.55, ly = 0.6, lz = 0.58;

    ctx.lineWidth = 0.6;
    ctx.strokeStyle = 'rgba(220,218,235,0.06)';
    for (const line of this.graticule) {
      ctx.beginPath();
      let pen = false;
      for (const p of line) {
        const [x, y, z] = this.project(p);
        if (z < 0) { pen = false; continue; }
        const sx = cx + x * R, sy = cy - y * R;
        if (!pen) { ctx.moveTo(sx, sy); pen = true; } else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }

    ctx.lineWidth = 0.7;
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? 'rgba(235,232,250,0.34)' : 'rgba(235,232,250,0.12)';
      ctx.beginPath();
      for (const [a, b] of this.edges) {
        const pa = this.project(a), pb = this.project(b);
        const zz = Math.min(pa[2], pb[2]);
        if (zz < 0) continue;
        if ((zz > 0.45) !== !!pass) continue;
        ctx.moveTo(cx + pa[0] * R, cy - pa[1] * R);
        ctx.lineTo(cx + pb[0] * R, cy - pb[1] * R);
      }
      ctx.stroke();
    }

    for (const p of this.points) {
      const [x, y, z] = this.project(p);
      const sx = cx + x * R, sy = cy - y * R;
      if (z < 0) {
        if (!p.land) continue;
        ctx.fillStyle = 'rgba(200,196,230,0.05)';
        ctx.fillRect(sx, sy, 1, 1);
        continue;
      }
      const light = Math.max(0, x * lx + y * ly + z * lz);
      const rim = Math.pow(1 - z, 3);
      if (p.land) {
        const a = (p.coast ? 1 : 0.5 + (p.h - 0.49) * 2.4) * (0.4 + 0.75 * light) + rim * 0.3;
        const s = p.coast ? 1.9 : 1.4 + z * 0.5;
        ctx.fillStyle = `rgba(240,238,252,${Math.min(1, a).toFixed(3)})`;
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
      } else if ((p.x * 997 + p.y * 131) % 1 > 0.55) {
        ctx.fillStyle = `rgba(200,196,230,${(0.05 + light * 0.08).toFixed(3)})`;
        ctx.fillRect(sx, sy, 1, 1);
      }
    }

    const spot = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.5, 0, cx - R * 0.42, cy - R * 0.5, R * 0.75);
    spot.addColorStop(0, 'rgba(255,255,255,0.22)');
    spot.addColorStop(0.35, 'rgba(255,255,255,0.06)');
    spot.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = spot;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();

    ctx.globalAlpha = ease;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(225,222,240,0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    this.drawMarkers(ctx, cx, cy, R, t);
    ctx.globalAlpha = 1;
  }

  drawMarkers(ctx, cx, cy, R, t) {
    const accent = this.accent || '157,140,240';
    for (const m of this.markers) {
      const [x, y, z] = this.project(m.p);
      if (z < -0.05) continue;
      const sx = cx + x * R, sy = cy - y * R;
      const active = m.id === this.selected || m.id === this.hovered;
      const fade = Math.min(1, (z + 0.05) * 4);
      if (active) {
        const ph = (t * 0.9) % 1;
        ctx.strokeStyle = `rgba(${accent},${((1 - ph) * 0.8 * fade).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(sx, sy, 4 + ph * 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(${accent},${fade})`;
        ctx.fillRect(sx - 3, sy - 3, 6, 6);
        ctx.strokeStyle = `rgba(${accent},${(0.5 * fade).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(sx - 10, sy); ctx.lineTo(sx - 5, sy);
        ctx.moveTo(sx + 5, sy); ctx.lineTo(sx + 10, sy);
        ctx.moveTo(sx, sy - 10); ctx.lineTo(sx, sy - 5);
        ctx.moveTo(sx, sy + 5); ctx.lineTo(sx, sy + 10);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(245,243,255,${(0.75 * fade).toFixed(3)})`;
        ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
        ctx.strokeStyle = `rgba(245,243,255,${(0.25 * fade).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 4.5, sy - 4.5, 9, 9);
      }
    }
  }
}
