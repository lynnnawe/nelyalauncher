import { h, popover, closePop, toast, reveal } from './ui.js';
import { icon } from './icons.js';
import { sprite, instIcon } from './sprites.js';
import { setFace } from './skin.js';
import { Globe } from './globe.js';
import { createCat } from './cat.js';
import { instances, accounts } from './data.js';
import { host } from './host.js';
import { state, set, on, accents, ordered, isPinned, togglePin } from './state.js';

const PER_PAGE = 6;
const SLOTS = [
  { side: 'l', row: 0 }, { side: 'r', row: 0 },
  { side: 'l', row: 1 }, { side: 'r', row: 1 },
  { side: 'l', row: 2 }, { side: 'r', row: 2 },
];

export function mountHome(root, app) {
  let page = Math.floor(Math.max(0, ordered(instances).findIndex((i) => i.id === state.selected)) / PER_PAGE);
  let pages = Math.ceil(instances.length / PER_PAGE);
  let geo = null;
  let pills = [];

  const canvas = h('canvas', { class: 'globe' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'wires');
  const pillLayer = h('div', { class: 'pill-layer' });
  const pager = h('div', { class: 'pager' });
  const prev = h('button', { class: 'pager-arrow prev', html: icon('right', 14), 'aria-label': 'previous page' });
  const next = h('button', { class: 'pager-arrow next', html: icon('right', 14), 'aria-label': 'next page' });
  const pagerWrap = h('div', { class: 'pager-wrap' }, prev, pager, next);
  prev.addEventListener('click', () => go(page - 1));
  next.addEventListener('click', () => go(page + 1));

  const emptyHint = h('div', { class: 'home-empty' },
    h('b', { text: 'your instances orbit here' }),
    h('span', { text: 'make one and it shows up around the planet' }),
    h('button', { class: 'btn primary sm', html: icon('plus', 13) + '<span>new instance</span>', onclick: () => app.editInstance(null) }),
  );
  const stage = h('div', { class: 'home-stage' }, svg, h('div', { class: 'globe-wrap' }, canvas), pillLayer, pagerWrap, emptyHint);

  const avatar = h('img', { class: 'avatar', alt: '' });
  const accName = h('b');
  const accType = h('span');
  const accountChip = h('button', { class: 'account-chip rv', onclick: () => accountMenu() }, avatar, h('div', { class: 'acc-text' }, accName, accType), h('span', { class: 'acc-chev', html: icon('chevron', 14) }));

  const input = h('input', { type: 'text', placeholder: 'search instances and mods', spellcheck: 'false' });
  const results = h('div', { class: 'cmd-results' });
  const cmd = h('div', { class: 'cmd rv' }, h('span', { class: 'cmd-ic', html: icon('search', 16) }), input, results);

  const playIcon = h('img', { class: 'play-icon', alt: '' });
  const playName = h('b');
  const playMeta = h('span');
  const playBtn = h('button', { class: 'play-btn', html: icon('play', 15) + '<span>play</span>' });
  const playMore = h('button', { class: 'play-more', html: icon('chevron', 15), 'data-tip': 'launch options' });
  const cat = createCat(state.cat !== false);
  on('cat', (v) => cat.set(v !== false));
  const play = h('div', { class: 'play rv' },
    h('button', { class: 'play-sel', onclick: () => app.go('instances') }, playIcon, h('div', { class: 'play-text' }, playName, playMeta)),
    h('div', { class: 'play-seat', onmouseenter: () => cat.wake() }, h('div', { class: 'play-split' }, playBtn, playMore), cat),
  );

  const bottom = h('div', { class: 'home-bottom' }, accountChip, cmd, play);
  root.append(stage, bottom);

  const globe = new Globe(canvas, { count: state.globeDetail === 'low' ? 2600 : state.globeDetail === 'medium' ? 4200 : 6400 });
  if (state.globeDetail === 'extreme') globe.setExtreme(true);
  globe.accent = accents[state.accent];
  globe.setMarkers(instances.map((i) => ({ id: i.id, lat: i.lat, lon: i.lon })));
  globe.selected = state.selected;

  on('accent', (a) => (globe.accent = accents[a]));

  function current() {
    return instances.find((i) => i.id === state.selected) || ordered(instances)[0];
  }

  function syncPlay() {
    const inst = current();
    play.classList.toggle('none', !inst);
    root.classList.toggle('no-inst', !instances.length);
    if (!inst) {
      playName.textContent = 'no instance';
      playMeta.textContent = 'make one first';
      playIcon.src = instIcon({ icon: 'grass' }, 4);
      playBtn.innerHTML = icon('plus', 15) + '<span>new</span>';
      return;
    }
    playIcon.src = instIcon(inst, 4);
    playName.textContent = inst.name;
    playMeta.textContent = `${inst.version} ${inst.loader}`;
    playBtn.classList.toggle('running', state.running === inst.id);
    playBtn.innerHTML = state.running === inst.id ? icon('stop', 14) + '<span>running</span>' : icon('play', 15) + '<span>play</span>';
  }

  function syncAccount() {
    const acc = accounts.find((a) => a.id === state.account) || accounts[0];
    accountChip.classList.toggle('none', !acc);
    if (!acc) {
      avatar.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#807c94" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="9" r="3.6"/><path d="M5.5 19.5c1.1-3.2 3.6-4.8 6.5-4.8s5.4 1.6 6.5 4.8"/></svg>');
      accName.textContent = 'add account';
      accType.textContent = 'sign in to play';
      return;
    }
    setFace(avatar, acc.skin, 32);
    accName.textContent = acc.name;
    accType.textContent = 'microsoft account';
  }

  function layout() {
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return null;
    const pillW = W < 1100 ? 208 : 236;
    const room = (W - 2 * (pillW + 96)) / 2;
    const R = Math.max(120, Math.min(H * 0.36, room, 270));
    const G = R / 0.44;
    const cx = W / 2, cy = H / 2 - 6;
    const wrap = canvas.parentElement;
    wrap.style.width = G + 'px';
    wrap.style.height = G + 'px';
    wrap.style.left = cx - G / 2 + 'px';
    wrap.style.top = cy - G / 2 + 'px';
    pagerWrap.style.top = cy + R + 26 + 'px';
    emptyHint.style.top = cy + 'px';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    return { W, H, R, cx, cy, pillW };
  }

  function slotPos(slot, g) {
    const rowY = [-0.92, 0, 0.92][slot.row];
    const y = g.cy + rowY * g.R;
    const out = slot.row === 1 ? 118 : 86;
    const x = slot.side === 'l' ? g.cx - g.R - out - g.pillW : g.cx + g.R + out;
    const ang = [-0.72, 0, 0.72][slot.row];
    const rx = g.cx + (slot.side === 'l' ? -1 : 1) * (g.R * Math.cos(ang) + 8);
    const ry = g.cy + g.R * Math.sin(ang);
    return { x, y, rx, ry };
  }

  function wirePath(slot, pos, g) {
    const sx = slot.side === 'l' ? pos.x + g.pillW : pos.x;
    const sy = pos.y;
    const dir = slot.side === 'l' ? 1 : -1;
    const span = Math.abs(pos.rx - sx);
    const k = span * 0.55;
    return `M ${pos.rx} ${pos.ry} C ${pos.rx - dir * k * 0.6} ${pos.ry}, ${sx + dir * k} ${sy}, ${sx} ${sy}`;
  }

  function buildPills(animate = true, direction = 0, instant = false) {
    const g = geo;
    if (!g) return;
    const list = ordered(instances).slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
    const old = pills;
    if (instant) {
      old.forEach((p) => { p.el.remove(); p.wire.remove(); p.glow.remove(); });
      old.length = 0;
    }
    old.forEach((p, i) => {
      p.el.classList.add('leaving');
      p.el.style.setProperty('--d', i * 25 + 'ms');
      p.wire.classList.add('leaving');
      p.glow.classList.add('leaving');
      setTimeout(() => {
        p.el.remove();
        p.wire.remove();
        p.glow.remove();
      }, 420);
    });
    pills = list.map((inst, i) => {
      const slot = SLOTS[i];
      const pos = slotPos(slot, g);
      const el = h('button', { class: `pill side-${slot.side}${isPinned(inst.id) ? ' pinned' : ''}`, data: { id: inst.id } },
        h('span', { class: 'pill-ic' }, h('img', { src: instIcon(inst, 4), alt: '' })),
        isPinned(inst.id) ? h('span', { class: 'pill-pin', html: icon('tack', 10) }) : null,
        h('span', { class: 'pill-text' },
          h('b', { text: '~/' + inst.name }),
          h('small', { text: `${inst.version} ${inst.loader}${inst.mods ? ', ' + inst.mods + ' mods' : ''}, ${inst.last}` }),
        ),
      );
      el.style.width = g.pillW + 'px';
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';
      const once = state.wires === 'once';
      const lineAt = (animate ? 260 : 0) + i * (once ? 150 : 110) + (direction ? 180 : 0);
      el.style.setProperty('--d', (animate ? lineAt + (once ? 1050 : 620) : i * 40) + 'ms');
      el.style.setProperty('--from', (slot.side === 'l' ? 1 : -1) * 26 + 'px');
      const d = wirePath(slot, pos, g);
      const wire = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      wire.setAttribute('d', d);
      wire.setAttribute('class', 'wire');
      const glow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      glow.setAttribute('d', d);
      glow.setAttribute('class', 'wire-run');
      svg.append(wire, glow);
      const len = wire.getTotalLength();
      wire.style.strokeDasharray = len;
      wire.style.setProperty('--len', len);
      wire.style.setProperty('--i', i);
      wire.style.setProperty('--wd', lineAt + 'ms');
      wire.style.strokeDashoffset = animate ? len : 0;
      wire.style.transitionDelay = lineAt + 'ms';
      glow.style.setProperty('--len', len);
      if (animate && once) wire.classList.add('draw');
      if (animate && !once) {
        glow.style.setProperty('--wd', lineAt + 'ms');
        glow.classList.add('intro');
        setTimeout(() => glow.classList.remove('intro'), lineAt + 1000);
      }
      el.addEventListener('mouseenter', () => hover(inst.id, true));
      el.addEventListener('mouseleave', () => hover(inst.id, false));
      el.addEventListener('click', () => choose(inst.id));
      el.addEventListener('dblclick', () => app.launch(inst));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        choose(inst.id);
        instanceMenu(el, inst);
      });
      pillLayer.appendChild(el);
      return { el, wire, glow, inst, slot };
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        pills.forEach((p) => {
          p.el.classList.add('in');
          p.wire.style.strokeDashoffset = 0;
        });
        mark();
      });
    });
    buildPager();
  }

  function relayout() {
    geo = layout();
    if (!geo) return;
    pills.forEach((p) => {
      const pos = slotPos(p.slot, geo);
      p.el.style.width = geo.pillW + 'px';
      p.el.style.left = pos.x + 'px';
      p.el.style.top = pos.y + 'px';
      const d = wirePath(p.slot, pos, geo);
      p.wire.setAttribute('d', d);
      p.glow.setAttribute('d', d);
      const len = p.wire.getTotalLength();
      p.wire.style.transition = 'none';
      p.wire.style.strokeDasharray = len;
      p.wire.style.setProperty('--len', len);
      p.wire.style.strokeDashoffset = 0;
      p.glow.style.setProperty('--len', len);
    });
  }

  function buildPager() {
    pager.innerHTML = '';
    for (let i = 0; i < pages; i++) {
      const b = h('button', { class: i === page ? 'on' : '', 'aria-label': 'page ' + (i + 1) });
      b.addEventListener('click', () => go(i));
      pager.appendChild(b);
    }
    prev.classList.toggle('off', page <= 0);
    next.classList.toggle('off', page >= pages - 1);
    pagerWrap.classList.toggle('single', pages <= 1);
  }

  function go(i) {
    if (i === page || i < 0 || i >= pages) return;
    const dir = i > page ? 1 : -1;
    page = i;
    globe.vyaw += dir * 2.2;
    buildPills(true, dir);
  }

  function mark() {
    pills.forEach((p) => {
      const on = p.inst.id === state.selected;
      p.el.classList.toggle('sel', on);
      p.wire.classList.toggle('sel', on);
      p.glow.classList.toggle('sel', on);
    });
  }

  let hoverTimer = null;
  function hover(id, entering) {
    clearTimeout(hoverTimer);
    const p = pills.find((k) => k.inst.id === id);
    if (p) {
      p.wire.classList.toggle('hot', entering);
      p.glow.classList.toggle('hot', entering);
    }
    if (entering) {
      globe.hovered = id;
      hoverTimer = setTimeout(() => globe.focus(id), 120);
    } else {
      globe.hovered = null;
      hoverTimer = setTimeout(() => globe.release(), 500);
    }
  }

  function choose(id) {
    if (state.selected !== id) set('selected', id);
    globe.selected = id;
    globe.focus(id);
    setTimeout(() => globe.release(), 1800);
    mark();
    syncPlay();
  }

  function accountMenu() {
    if (!accounts.length) {
      app.addAccount();
      return;
    }
    const list = h('div', { class: 'menu acc-menu' }, h('div', { class: 'menu-label', text: 'accounts' }));
    accounts.forEach((a) => {
      const img = h('img', { alt: '' });
      setFace(img, a.skin, 28);
      const row = h('button', { class: 'acc-pick' + (a.id === state.account ? ' on' : '') },
        img,
        h('span', { class: 'acc-pick-text' }, h('b', { text: a.name }), h('small', { text: 'microsoft' })),
        h('span', { class: 'radio' }),
      );
      row.addEventListener('click', () => {
        closePop();
        if (a.id === state.account) return;
        set('account', a.id);
        toast('switched account', a.name, 'ok');
      });
      list.appendChild(row);
    });
    list.append(h('hr'), h('button', { class: 'menu-item acc-add', onclick: () => { closePop(); app.addAccount(); } }, h('span', { html: icon('userplus', 14) }), h('span', { text: 'add account' })));
    popover(accountChip, list, { width: 250, up: true });
  }

  function instanceMenu(anchor, inst) {
    popover(anchor, app.instanceMenu(inst, { play: true }), { width: 220 });
  }

  playBtn.addEventListener('click', () => {
    const inst = current();
    if (!inst) {
      app.editInstance(null);
      return;
    }
    if (state.running === inst.id) app.showLaunch();
    else app.launch(inst);
  });
  playMore.addEventListener('click', () => {
    const inst = current();
    if (!inst) return;
    const item = (ic, label, sub, fn) => h('button', { class: 'menu-item', onclick: () => { closePop(); fn(); } }, h('span', { html: icon(ic, 14) }), h('span', { text: label }), sub ? h('small', { text: sub }) : null);
    const menu = h('div', { class: 'menu' },
      item('play', 'play', inst.name, () => app.launch(inst)),
      h('hr'),
      item('folder', 'open instance folder', null, () => host.call('open', { id: inst.id }).catch(() => {})),
      item('sliders', 'instance settings', null, () => app.instanceSettings(inst)),
    );
    popover(playMore, menu, { width: 230, align: 'right', up: true });
  });

  let hits = [];
  let cursor = 0;
  function search(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    instances.filter((i) => i.name.includes(q) || i.loader.includes(q) || i.version.includes(q)).slice(0, 4)
      .forEach((i) => out.push({ group: 'instances', label: i.name, sub: `${i.version} ${i.loader}`, img: instIcon(i, 4), run: () => { const at = ordered(instances).indexOf(i); if (at >= 0) { const p = Math.floor(at / PER_PAGE); if (p !== page) go(p); } choose(i.id); } }));
    out.push({ group: 'mods', label: `search modrinth for "${q}"`, sub: 'mods', ic: 'puzzle', run: () => app.go('mods', { query: q }) });
    ['instances', 'mods', 'console', 'skins', 'settings'].filter((p) => p.includes(q))
      .forEach((p) => out.push({ group: 'go to', label: p, sub: 'page', ic: 'right', run: () => app.go(p) }));
    return out;
  }

  function renderResults() {
    results.innerHTML = '';
    if (!hits.length) {
      if (input.value.trim()) results.appendChild(h('div', { class: 'cmd-empty', text: `nothing for "${input.value.trim()}"` }));
      results.classList.toggle('in', !!input.value.trim());
      return;
    }
    let group = '';
    hits.forEach((r, i) => {
      if (r.group !== group) {
        group = r.group;
        results.appendChild(h('div', { class: 'cmd-group', text: group }));
      }
      const row = h('button', { class: 'cmd-row' + (i === cursor ? ' on' : '') },
        r.img ? h('img', { src: r.img, alt: '' }) : h('span', { class: 'cmd-row-ic', html: icon(r.ic, 14) }),
        h('span', { class: 'cmd-row-label', text: r.label }),
        h('span', { class: 'cmd-row-sub', text: r.sub }),
      );
      row.addEventListener('mousemove', () => {
        if (cursor === i) return;
        cursor = i;
        results.querySelectorAll('.cmd-row').forEach((x, j) => x.classList.toggle('on', j === cursor));
      });
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pick(i);
      });
      results.appendChild(row);
    });
    results.classList.add('in');
  }

  function pick(i) {
    const r = hits[i];
    if (!r) return;
    input.value = '';
    hits = [];
    renderResults();
    input.blur();
    r.run();
  }

  input.addEventListener('input', () => {
    hits = search(input.value);
    cursor = 0;
    renderResults();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(hits.length - 1, cursor + 1); renderResults(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(0, cursor - 1); renderResults(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(cursor); }
    else if (e.key === 'Escape') { input.value = ''; hits = []; renderResults(); input.blur(); }
  });
  input.addEventListener('focus', () => cmd.classList.add('focus'));
  input.addEventListener('blur', () => {
    cmd.classList.remove('focus');
    setTimeout(() => results.classList.remove('in'), 120);
  });

  let wheelSum = 0;
  let wheelIdle = null;
  let wheelLocked = false;
  root.addEventListener('wheel', (e) => {
    if (state.wheelPages === false) return;
    if (e.target.closest('.cmd-results, .pop, .modal, .scrim')) return;
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
    const d = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * unit;
    clearTimeout(wheelIdle);
    wheelIdle = setTimeout(() => {
      wheelLocked = false;
      wheelSum = 0;
    }, 220);
    if (wheelLocked) return;
    wheelSum += d;
    if (Math.abs(wheelSum) < 50) return;
    const step = wheelSum > 0 ? 1 : -1;
    wheelSum = 0;
    const target = page + step;
    if (target < 0 || target >= pages) return;
    wheelLocked = true;
    go(target);
  }, { passive: true });

  on('selected', (id) => {
    globe.selected = id;
    const idx = ordered(instances).findIndex((i) => i.id === id);
    const p = Math.floor(idx / PER_PAGE);
    if (p !== page && geo) go(p);
    mark();
    syncPlay();
  });
  on('account', syncAccount);
  const applyWires = () => {
    root.classList.toggle('wires-flow', state.wires === 'flow');
    root.classList.toggle('wires-once', state.wires === 'once');
  };
  applyWires();
  on('wires', applyWires);
  on('pinned', () => {
    if (geo) buildPills(true);
  });
  on('instances', () => {
    pages = Math.ceil(instances.length / PER_PAGE);
    globe.setMarkers(instances.map((i) => ({ id: i.id, lat: i.lat, lon: i.lon })));
    page = Math.floor(Math.max(0, ordered(instances).findIndex((i) => i.id === state.selected)) / PER_PAGE);
    if (geo) buildPills(false);
    syncPlay();
  });
  on('running', syncPlay);
  on('running', (v) => { if (v) cat.wake(); });

  new ResizeObserver(() => {
    const had = !!geo;
    geo = layout();
    if (!geo) return;
    if (!had && root.classList.contains('active')) buildPills(true);
    else relayout();
  }).observe(stage);

  syncPlay();
  syncAccount();

  return {
    enter() {
      globe.visible = true;
      globe.start();
      geo = layout();
      if (geo) buildPills(true, 0, true);
      reveal(root, '.rv', 70, 260);
    },
    leave() {
      globe.visible = false;
      setTimeout(() => { if (!root.classList.contains('active')) globe.stop(); }, 400);
    },
    page(step) {
      go(page + step);
    },
    focusSearch() {
      input.focus();
      input.select();
    },
    setDetail(level) {
      globe.setExtreme(level === 'extreme');
      if (level !== 'extreme') globe.build(level === 'low' ? 2600 : level === 'medium' ? 4200 : 6400);
    },
    get globe() { return globe; },
  };
}
