import { icon } from './icons.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.entries(v).forEach(([sk, sv]) => (sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv)));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'data' && typeof v === 'object') Object.entries(v).forEach(([dk, dv]) => (el.dataset[dk] = dv));
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
  }
  return el;
}

export function reveal(root, selector = '.rv', step = 40, base = 0) {
  const items = root.querySelectorAll(selector);
  items.forEach((el, i) => {
    el.classList.remove('in');
    el.style.setProperty('--d', base + i * step + 'ms');
  });
  void root.offsetWidth;
  items.forEach((el) => el.classList.add('in'));
}

export function toast(title, body = '', kind = 'info', ms = 3600) {
  const wrap = document.getElementById('toasts');
  const t = h('div', { class: 'toast ' + kind },
    h('span', { class: 'toast-ic', html: icon(kind === 'ok' ? 'check' : kind === 'warn' ? 'info' : kind === 'dl' ? 'download' : 'sparkle', 14) }),
    h('div', { class: 'toast-body' }, h('b', { text: title }), body ? h('span', { text: body }) : null),
    h('i', { class: 'toast-life', style: { animationDuration: ms + 'ms' } }),
  );
  wrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  const kill = () => {
    t.classList.remove('in');
    t.classList.add('out');
    setTimeout(() => t.remove(), 320);
  };
  t.addEventListener('click', kill);
  setTimeout(kill, ms);
}

let openPop = null;

export function closePop() {
  if (!openPop) return;
  const p = openPop;
  openPop = null;
  p.el.classList.remove('in');
  p.anchor && p.anchor.classList.remove('open');
  setTimeout(() => p.el.remove(), 180);
}

export function popover(anchor, content, { align = 'left', width, offset = 6, up = false, cls = '' } = {}) {
  if (openPop && openPop.anchor === anchor) {
    closePop();
    return null;
  }
  closePop();
  const layer = document.getElementById('layer');
  const el = h('div', { class: 'pop ' + cls }, content);
  layer.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = width || Math.max(r.width, 180);
  el.style.width = w + 'px';
  const ph = el.offsetHeight;
  let left = align === 'right' ? r.right - w : r.left;
  left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
  let top = up || r.bottom + offset + ph > window.innerHeight - 8 ? r.top - offset - ph : r.bottom + offset;
  el.style.left = left + 'px';
  el.style.top = Math.max(8, top) + 'px';
  el.style.transformOrigin = (top < r.top ? 'bottom ' : 'top ') + (align === 'right' ? 'right' : 'left');
  anchor.classList.add('open');
  requestAnimationFrame(() => el.classList.add('in'));
  openPop = { el, anchor };
  return el;
}

document.addEventListener('mousedown', (e) => {
  if (!openPop) return;
  if (openPop.el.contains(e.target) || openPop.anchor.contains(e.target)) return;
  closePop();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePop();
});
window.addEventListener('resize', closePop);

export function select(options, value, onChange, { cls = '', label } = {}) {
  let current = value;
  const text = h('span', { class: 'sel-text' });
  const btn = h('button', { class: 'sel ' + cls, type: 'button' }, label ? h('span', { class: 'sel-label', text: label }) : null, text, h('span', { class: 'sel-chev', html: icon('chevron', 14) }));
  const norm = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const sync = () => {
    const o = norm.find((k) => k.value === current) || norm[0];
    text.textContent = o ? o.label : '';
  };
  sync();
  btn.addEventListener('click', () => {
    const list = h('div', { class: 'sel-list' });
    norm.forEach((o) => {
      const item = h('button', { class: 'sel-item' + (o.value === current ? ' on' : ''), type: 'button' },
        h('span', { text: o.label }),
        o.hint ? h('span', { class: 'sel-hint', text: o.hint }) : null,
        h('span', { class: 'sel-check', html: icon('check', 13) }),
      );
      item.addEventListener('click', () => {
        current = o.value;
        sync();
        closePop();
        onChange && onChange(current);
      });
      list.appendChild(item);
    });
    popover(btn, list, { width: Math.max(btn.offsetWidth, 170) });
  });
  btn.getValue = () => current;
  btn.setValue = (v) => { current = v; sync(); };
  return btn;
}

export function segmented(options, value, onChange, { cls = '' } = {}) {
  const wrap = h('div', { class: 'seg ' + cls });
  const ink = h('span', { class: 'seg-ink' });
  wrap.appendChild(ink);
  const norm = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const btns = norm.map((o) => {
    const b = h('button', { type: 'button', class: o.value === value ? 'on' : '', html: (o.icon ? icon(o.icon, 14) : '') + `<span>${o.label}</span>` });
    b.addEventListener('click', () => {
      btns.forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      move();
      onChange && onChange(o.value);
    });
    wrap.appendChild(b);
    return b;
  });
  const move = () => {
    const on = btns.find((b) => b.classList.contains('on'));
    if (!on || !on.offsetWidth) return;
    ink.style.width = on.offsetWidth + 'px';
    ink.style.transform = `translateX(${on.offsetLeft}px)`;
  };
  new ResizeObserver(move).observe(wrap);
  requestAnimationFrame(move);
  wrap.refresh = move;
  return wrap;
}

export function toggle(on, onChange) {
  const input = h('input', { type: 'checkbox' });
  input.checked = !!on;
  input.addEventListener('change', () => onChange && onChange(input.checked));
  return h('label', { class: 'switch' }, input, h('span'));
}

export function slider({ min, max, step = 1, value, format = (v) => v, onInput }) {
  const out = h('span', { class: 'range-val' });
  const input = h('input', { type: 'range', min, max, step, value });
  const paint = () => {
    const p = ((input.value - min) / (max - min)) * 100;
    input.style.setProperty('--p', p + '%');
    out.textContent = format(+input.value);
  };
  input.addEventListener('input', () => {
    paint();
    onInput && onInput(+input.value);
  });
  paint();
  return h('div', { class: 'range' }, input, out);
}

export function bindTips(root = document) {
  const tip = document.getElementById('tip');
  let timer = null;
  root.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      tip.textContent = t.dataset.tip;
      const r = t.getBoundingClientRect();
      tip.style.left = '0px';
      tip.classList.add('in');
      const w = tip.offsetWidth;
      let left = r.left + r.width / 2 - w / 2;
      left = Math.max(6, Math.min(window.innerWidth - w - 6, left));
      const below = r.bottom + 8 + tip.offsetHeight < window.innerHeight;
      tip.style.left = left + 'px';
      tip.style.top = (below ? r.bottom + 8 : r.top - tip.offsetHeight - 8) + 'px';
    }, 380);
  });
  root.addEventListener('mouseout', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) return;
    clearTimeout(timer);
    tip.classList.remove('in');
  });
  root.addEventListener('mousedown', () => {
    clearTimeout(timer);
    tip.classList.remove('in');
  });
}

export function modal(content, { cls = '', onClose } = {}) {
  const layer = document.getElementById('layer');
  const scrim = h('div', { class: 'scrim' });
  const box = h('div', { class: 'modal ' + cls }, content);
  scrim.appendChild(box);
  layer.appendChild(scrim);
  requestAnimationFrame(() => scrim.classList.add('in'));
  const close = () => {
    scrim.classList.remove('in');
    scrim.classList.add('out');
    document.removeEventListener('keydown', esc);
    setTimeout(() => scrim.remove(), 260);
    onClose && onClose();
  };
  const esc = (e) => {
    if (e.key === 'Escape' && !document.querySelector('.pop.in')) close();
  };
  document.addEventListener('keydown', esc);
  scrim.addEventListener('mousedown', (e) => {
    if (e.target === scrim) close();
  });
  return { el: box, close };
}

export function countUp(el, to, { ms = 900, fmt = (v) => Math.round(v) } = {}) {
  const start = performance.now();
  const from = 0;
  const tick = (now) => {
    const k = Math.min(1, (now - start) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function fmtHours(h) {
  if (h < 1) return Math.round(h * 60) + 'm';
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}

export function fmtDownloads(m) {
  return m >= 100 ? Math.round(m) + 'm' : m.toFixed(1) + 'm';
}
