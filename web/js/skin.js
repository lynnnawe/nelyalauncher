import { seeded } from './sprites.js';

const LOOKS = {
  alex: { skin: '#e9c4a8', hair: '#2b2233', hood: '#4b4566', hoodHi: '#6c6590', pants: '#25232e', shoes: '#e7e3ee', eye: '#3a2d5c', long: true, cord: '#d9d2ff' },
  wanderer: { skin: '#c99a76', hair: '#5a3b24', hood: '#3d5240', hoodHi: '#56705a', pants: '#3a3128', shoes: '#2a2119', eye: '#2c4a32', long: false, cord: '#a8b98a' },
  classic: { skin: '#c6916c', hair: '#3b2616', hood: '#2f8f8f', hoodHi: '#3aa8a8', pants: '#3a3a8a', shoes: '#4a4a4a', eye: '#4b3aa8', long: false, cord: null },
  frost: { skin: '#f1d6c6', hair: '#d9dde8', hood: '#8796b8', hoodHi: '#a9b6d4', pants: '#3b4258', shoes: '#1d2130', eye: '#5d7ab8', long: true, cord: '#eef2ff' },
  ember: { skin: '#b07a5a', hair: '#1a1414', hood: '#7a2f2f', hoodHi: '#9c4040', pants: '#1e1a1a', shoes: '#cfc6c0', eye: '#7a2f2f', long: false, cord: '#e0b090' },
  moss: { skin: '#dcb08c', hair: '#8a5a2b', hood: '#5f6b3a', hoodHi: '#7c8a4c', pants: '#4a3a2a', shoes: '#2d241c', eye: '#3d6a2a', long: true, cord: null },
};

export const skinNames = Object.keys(LOOKS);

const BOXES = {
  head: { u: 0, v: 0, w: 8, h: 8, d: 8 },
  body: { u: 16, v: 16, w: 8, h: 12, d: 4 },
  rarm: { u: 40, v: 16, w: 4, h: 12, d: 4 },
  larm: { u: 32, v: 48, w: 4, h: 12, d: 4 },
  rleg: { u: 0, v: 16, w: 4, h: 12, d: 4 },
  lleg: { u: 16, v: 48, w: 4, h: 12, d: 4 },
};

function faces(b) {
  const { u, v, w, h, d } = b;
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + d + w + d, v + d, w, h],
  };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

const textures = new Map();
const custom = new Map();

export function isCustom(name) {
  return custom.has(name);
}

export function customInfo(name) {
  return custom.get(name);
}

export function registerSkin(name, url, { slim = false, cape = null } = {}) {
  custom.set(name, { url, slim, cape });
  textures.set(name, url);
  [...textures.keys()].filter((k) => k.startsWith('face:' + name + '@')).forEach((k) => textures.delete(k));
}

export function normalizeSkin(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      if (img.height === 32) {
        g.drawImage(img, 0, 0, 64, 32, 0, 0, 64, 32);
        g.drawImage(img, 0, 16, 16, 16, 16, 48, 16, 16);
        g.drawImage(img, 40, 16, 16, 16, 32, 48, 16, 16);
      } else {
        g.drawImage(img, 0, 0, 64, 64);
      }
      resolve(c.toDataURL());
    };
    img.onerror = () => reject(new Error('bad skin image'));
    img.src = src;
  });
}

export function skinTexture(name) {
  if (textures.has(name)) return textures.get(name);
  const L = LOOKS[name] || LOOKS.alex;
  const rnd = seeded(name);
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const px = (x, y, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  };
  const fill = (rect, color, jitter = 10) => {
    const [x0, y0, w, h] = rect;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(x0 + x, y0 + y, shade(color, Math.round((rnd() - 0.5) * jitter)));
  };
  const all = (box, color, jitter) => Object.values(faces(box)).forEach((r) => fill(r, color, jitter));

  const head = faces(BOXES.head);
  all(BOXES.head, L.skin, 8);
  fill(head.top, L.hair, 14);
  fill(head.back, L.hair, 14);
  const hairRows = L.long ? 7 : 3;
  [[head.right, false], [head.left, true]].forEach(([[x, y, w], side]) => {
    for (let r = 0; r < hairRows; r++) for (let i = 0; i < w; i++) {
      const back = side ? i >= 4 : i < 4;
      if (r >= 3 && !back) continue;
      px(x + i, y + r, shade(L.hair, Math.round((rnd() - 0.5) * 14)));
    }
  });
  const [fx, fy] = head.front;
  for (let i = 0; i < 8; i++) {
    px(fx + i, fy, shade(L.hair, -6));
    px(fx + i, fy + 1, shade(L.hair, Math.round((rnd() - 0.5) * 12)));
  }
  [0, 1, 6, 7].forEach((i) => px(fx + i, fy + 2, shade(L.hair, 4)));
  if (L.long) [0, 7].forEach((i) => { px(fx + i, fy + 3, L.hair); px(fx + i, fy + 4, L.hair); px(fx + i, fy + 5, shade(L.hair, 8)); });
  px(fx + 1, fy + 4, '#f4f2f8');
  px(fx + 2, fy + 4, L.eye);
  px(fx + 5, fy + 4, L.eye);
  px(fx + 6, fy + 4, '#f4f2f8');
  px(fx + 3, fy + 5, shade(L.skin, -18));
  px(fx + 4, fy + 5, shade(L.skin, -18));
  px(fx + 3, fy + 6, shade(L.skin, -40));
  px(fx + 4, fy + 6, shade(L.skin, -40));
  px(fx + 1, fy + 5, shade(L.skin, 10));
  px(fx + 6, fy + 5, shade(L.skin, 10));

  const body = faces(BOXES.body);
  all(BOXES.body, L.hood, 10);
  const [bx, by] = body.front;
  for (let i = 0; i < 8; i++) px(bx + i, by + 11, shade(L.hood, -22));
  for (let i = 2; i < 6; i++) px(bx + i, by, shade(L.skin, -10));
  px(bx + 3, by + 1, shade(L.skin, -16));
  px(bx + 4, by + 1, shade(L.skin, -16));
  if (L.cord) {
    px(bx + 2, by + 1, L.cord); px(bx + 2, by + 2, L.cord); px(bx + 2, by + 3, L.cord);
    px(bx + 5, by + 1, L.cord); px(bx + 5, by + 2, L.cord);
  }
  for (let i = 1; i < 7; i++) { px(bx + i, by + 7, shade(L.hoodHi, -6)); px(bx + i, by + 8, shade(L.hoodHi, -10)); }
  px(bx, by + 7, shade(L.hood, -14)); px(bx + 7, by + 7, shade(L.hood, -14));
  const [kx, ky] = body.back;
  for (let i = 1; i < 7; i++) { px(kx + i, ky, shade(L.hoodHi, 6)); px(kx + i, ky + 1, shade(L.hoodHi, 0)); }
  for (let i = 2; i < 6; i++) px(kx + i, ky + 2, shade(L.hoodHi, -8));

  [BOXES.rarm, BOXES.larm].forEach((box) => {
    const f = faces(box);
    all(box, L.hood, 10);
    ['right', 'front', 'left', 'back'].forEach((k) => {
      const [x, y, w] = f[k];
      for (let i = 0; i < w; i++) {
        px(x + i, y + 9, shade(L.hood, -20));
        px(x + i, y + 10, shade(L.skin, Math.round((rnd() - 0.5) * 8)));
        px(x + i, y + 11, shade(L.skin, -6));
      }
    });
    fill(f.bottom, L.skin, 8);
  });

  [BOXES.rleg, BOXES.lleg].forEach((box) => {
    const f = faces(box);
    all(box, L.pants, 8);
    ['right', 'front', 'left', 'back'].forEach((k) => {
      const [x, y, w] = f[k];
      for (let i = 0; i < w; i++) {
        px(x + i, y, shade(L.pants, -10));
        px(x + i, y + 10, L.shoes);
        px(x + i, y + 11, shade(L.shoes, -40));
      }
    });
    fill(f.bottom, '#1b1a20', 6);
  });

  const url = c.toDataURL();
  textures.set(name, url);
  return url;
}

export function faceURL(name, size = 32) {
  const key = 'face:' + name + '@' + size;
  if (textures.has(key)) return textures.get(key);
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size);
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size);
      resolve(c.toDataURL());
    };
    img.onerror = () => resolve('');
    img.src = skinTexture(name);
  });
  textures.set(key, promise);
  return promise;
}

export async function setFace(imgEl, name, size = 32) {
  imgEl.src = await faceURL(name, size);
}

const OVERLAY = {
  head: { u: 32, v: 0, inf: 0.5 },
  body: { u: 16, v: 32, inf: 0.25 },
  rarm: { u: 40, v: 32, inf: 0.25 },
  larm: { u: 48, v: 48, inf: 0.25 },
  rleg: { u: 0, v: 32, inf: 0.25 },
  lleg: { u: 0, v: 48, inf: 0.25 },
};

export class SkinViewer {
  constructor(host, { scale = 13 } = {}) {
    this.host = host;
    this.S = scale;
    this.yaw = -28;
    this.pitch = -8;
    this.vyaw = 0;
    this.pose = 'idle';
    this.t = 0;
    this.running = false;
    this.slim = false;
    this.texture = null;
    this.build();
    this.bind();
  }

  build() {
    const S = this.S;
    this.host.innerHTML = '';
    this.stage = document.createElement('div');
    this.stage.className = 'skin-stage';
    this.rig = document.createElement('div');
    this.rig.className = 'skin-rig';
    const floor = document.createElement('div');
    floor.className = 'skin-floor';
    floor.style.top = `calc(50% + ${18 * S - 40}px)`;
    floor.innerHTML = '<i></i><i></i><i></i>';
    this.stage.appendChild(floor);
    this.stage.appendChild(this.rig);
    this.tag = document.createElement('div');
    this.tag.className = 'nametag';
    this.tag.style.top = `calc(50% - ${14 * S + 40 + 38}px)`;
    this.stage.appendChild(this.tag);
    this.host.appendChild(this.stage);

    const cape = document.createElement('div');
    cape.className = 'skin-cape';
    cape.style.width = 10 * S + 'px';
    cape.style.height = 16 * S + 'px';
    this.rig.appendChild(cape);
    this.capeEl = cape;
    this.buildParts();
  }

  buildParts() {
    const S = this.S;
    if (this.parts) Object.values(this.parts).forEach((p) => p.el.remove());
    this.parts = {};
    const arm = this.slim ? 3 : 4;
    const boxes = {
      ...BOXES,
      rarm: { ...BOXES.rarm, w: arm },
      larm: { ...BOXES.larm, w: arm },
    };
    const ax = this.slim ? 5.5 : 6;
    const layout = {
      head: { x: 0, y: -10, origin: '50% 100%' },
      body: { x: 0, y: 0, origin: '50% 50%' },
      rarm: { x: -ax, y: 0, origin: '50% 0' },
      larm: { x: ax, y: 0, origin: '50% 0' },
      rleg: { x: -2, y: 12, origin: '50% 0' },
      lleg: { x: 2, y: 12, origin: '50% 0' },
    };
    Object.entries(boxes).forEach(([key, b]) => {
      const part = document.createElement('div');
      part.className = 'skin-part';
      part.style.width = b.w * S + 'px';
      part.style.height = b.h * S + 'px';
      part.style.transformOrigin = layout[key].origin;
      this.addBox(part, b, 0, '');
      this.addBox(part, { ...b, u: OVERLAY[key].u, v: OVERLAY[key].v }, OVERLAY[key].inf, ' over');
      this.rig.appendChild(part);
      this.parts[key] = { el: part, b, ...layout[key] };
    });
    if (this.texture) this.paint();
    if (this.running) this.apply();
  }

  addBox(part, b, inf, cls) {
    const S = this.S;
    const f = faces(b);
    const rot = {
      front: `translateZ(${(b.d / 2 + inf) * S}px)`,
      back: `rotateY(180deg) translateZ(${(b.d / 2 + inf) * S}px)`,
      right: `rotateY(-90deg) translateZ(${(b.w / 2 + inf) * S}px)`,
      left: `rotateY(90deg) translateZ(${(b.w / 2 + inf) * S}px)`,
      top: `rotateX(90deg) translateZ(${(b.h / 2 + inf) * S}px)`,
      bottom: `rotateX(-90deg) translateZ(${(b.h / 2 + inf) * S}px)`,
    };
    Object.entries(f).forEach(([name, [u, v, w, h]]) => {
      const sx = (w + 2 * inf) / w, sy = (h + 2 * inf) / h;
      const ew = w * S * sx, eh = h * S * sy;
      const face = document.createElement('i');
      face.className = 'skin-face f-' + name + cls;
      face.style.width = ew + 'px';
      face.style.height = eh + 'px';
      face.style.left = (b.w * S - ew) / 2 + 'px';
      face.style.top = (b.h * S - eh) / 2 + 'px';
      face.style.backgroundSize = 64 * S * sx + 'px ' + 64 * S * sy + 'px';
      face.style.backgroundPosition = -u * S * sx + 'px ' + -v * S * sy + 'px';
      face.style.transform = rot[name];
      part.appendChild(face);
    });
  }

  paint() {
    this.rig.querySelectorAll('.skin-face').forEach((f) => (f.style.backgroundImage = `url(${this.texture})`));
  }

  setSkin(name) {
    const info = custom.get(name);
    this.texture = skinTexture(name);
    const slim = info ? info.slim : false;
    if (slim !== this.slim) {
      this.slim = slim;
      this.buildParts();
    } else this.paint();
    this.stage.classList.remove('swap');
    void this.stage.offsetWidth;
    this.stage.classList.add('swap');
  }

  setModel(slim) {
    if (slim === this.slim) return;
    this.slim = slim;
    this.buildParts();
  }

  setName(name) {
    this.tag.textContent = name;
  }

  setCape(cape) {
    this.capeEl.style.display = cape ? 'block' : 'none';
    this.capeEl.classList.toggle('textured', !!(cape && cape.startsWith('data:')));
    if (!cape) return;
    if (cape.startsWith('data:')) {
      const S = this.S;
      this.capeEl.style.background = `url(${cape}) no-repeat`;
      this.capeEl.style.backgroundSize = 64 * S + 'px ' + 32 * S + 'px';
      this.capeEl.style.backgroundPosition = -1 * S + 'px ' + -1 * S + 'px';
    } else {
      this.capeEl.style.background = '';
      this.capeEl.style.setProperty('--cape', cape);
    }
  }

  bind() {
    let drag = null;
    this.stage.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.stage.setPointerCapture(e.pointerId);
      this.stage.classList.add('grabbing');
    });
    this.stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      const now = performance.now();
      this.yaw += dx * 0.6;
      this.pitch = Math.max(-35, Math.min(25, this.pitch - dy * 0.3));
      this.vyaw = (dx * 0.6) / (Math.max(1, now - drag.t) / 1000);
      drag = { x: e.clientX, y: e.clientY, t: now };
    });
    const end = () => {
      drag = null;
      this.stage.classList.remove('grabbing');
    };
    this.stage.addEventListener('pointerup', end);
    this.stage.addEventListener('pointercancel', end);
    this.isDragging = () => !!drag;
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.t += dt;
      if (!this.isDragging()) {
        this.yaw += this.vyaw * dt;
        this.vyaw *= Math.pow(0.04, dt);
      }
      this.apply();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  apply() {
    const S = this.S, t = this.t;
    let rarm = 0, larm = 0, rleg = 0, lleg = 0, head = 0, headY = 0, rarmZ = 0, larmZ = 0, bob = 0, capeX = 8;
    if (this.pose === 'idle') {
      rarm = Math.sin(t * 1.4) * 3;
      larm = -Math.sin(t * 1.4) * 3;
      rarmZ = 3 + Math.sin(t * 1.1) * 1.5;
      larmZ = -3 - Math.sin(t * 1.1) * 1.5;
      head = Math.sin(t * 0.8) * 4;
      headY = Math.sin(t * 0.5) * 10;
      bob = Math.sin(t * 2.2) * 0.12;
      capeX = 6 + Math.sin(t * 1.4) * 2;
    } else if (this.pose === 'walk') {
      const s = Math.sin(t * 6);
      rarm = s * 38;
      larm = -s * 38;
      rleg = -s * 34;
      lleg = s * 34;
      head = Math.sin(t * 12) * 2;
      bob = Math.abs(Math.cos(t * 6)) * -0.6;
      capeX = 16 + Math.abs(s) * 14;
    } else if (this.pose === 'wave') {
      rarmZ = 150 + Math.sin(t * 8) * 22;
      larm = Math.sin(t * 1.4) * 3;
      larmZ = -3;
      head = -4;
      headY = 12;
    }
    this.rig.style.transform = `rotateX(${this.pitch}deg) rotateY(${this.yaw}deg) translateY(${bob * S}px)`;
    const set = (key, rx, rz = 0, ry = 0) => {
      const p = this.parts[key];
      p.el.style.transform = `translate3d(${p.x * S - (p.b.w * S) / 2}px, ${p.y * S - (p.b.h * S) / 2}px, 0) rotateX(${rx}deg) rotateZ(${rz}deg) rotateY(${ry}deg)`;
    };
    set('head', head, 0, headY);
    set('body', 0);
    set('rarm', rarm, rarmZ);
    set('larm', larm, larmZ);
    set('rleg', rleg);
    set('lleg', lleg);
    this.capeEl.style.transform = `translate3d(${-5 * S}px, ${-6 * S}px, ${-2.3 * S}px) rotateX(${-capeX}deg) rotateY(180deg)`;
  }
}
