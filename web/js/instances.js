import { h, reveal, toast, segmented, select, toggle, slider, modal, popover, closePop, countUp, fmtHours } from './ui.js';
import { icon } from './icons.js';
import { sprite, instIcon, spriteNames, landscape, UNKNOWN } from './sprites.js';
import { instances, loaders, javas, normalize, fmtBytes, relTime } from './data.js';
import { state, set, on, emit, ordered, isPinned, togglePin, isRunning } from './state.js';
import { syncTargets } from './sync.js';
import { host } from './host.js';

let savedIconList = [];
if (host.native) host.call('store.get', { key: 'icons' }).then((v) => { if (Array.isArray(v)) savedIconList = v; }).catch(() => {});
else {
  try {
    savedIconList = JSON.parse(localStorage.getItem('nelya-icons') || '[]');
  } catch {}
}

function rememberIcon(url) {
  savedIconList = [url, ...savedIconList.filter((u) => u !== url)].slice(0, 12);
  if (host.native) host.call('store.set', { key: 'icons', value: savedIconList }).catch(() => {});
  else {
    try { localStorage.setItem('nelya-icons', JSON.stringify(savedIconList)); } catch {}
  }
}

function importImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 96;
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const g = c.getContext('2d');
        const pixel = img.width <= 32 && img.height <= 32;
        g.imageSmoothingEnabled = !pixel;
        g.imageSmoothingQuality = 'high';
        const k = Math.max(size / img.width, size / img.height);
        const w = img.width * k, hgt = img.height * k;
        g.drawImage(img, (size - w) / 2, (size - hgt) / 2, w, hgt);
        resolve(c.toDataURL(pixel ? 'image/png' : 'image/webp', 0.92));
      };
      img.onerror = () => reject(new Error('not an image'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('could not read file'));
    reader.readAsDataURL(file);
  });
}

function iconGrid(current, onPick) {
  const grid = h('div', { class: 'icon-pick' });
  const file = h('input', { type: 'file', accept: '.png,.jpg,.jpeg,.gif,.webp,.ico,.bmp,image/*', hidden: true });
  const importTile = h('button', { class: 'icon-import', 'data-tip': 'import image or .ico', html: icon('upload', 15) });
  importTile.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    try {
      const url = await importImage(f);
      rememberIcon(url);
      draw(url);
      onPick(url);
    } catch {
      toast('could not use that file', 'try a png, jpg or ico', 'warn');
    }
  });
  const draw = (sel) => {
    grid.innerHTML = '';
    grid.append(importTile, file);
    const tiles = [...savedIconList.map((u) => ({ v: u, src: u, custom: true })), ...spriteNames.map((n) => ({ v: n, src: sprite(n, 4) }))];
    tiles.forEach((t) => {
      const b = h('button', { class: (t.v === sel ? 'on' : '') + (t.custom ? ' custom' : '') }, h('img', { src: t.src, alt: '' }));
      b.addEventListener('click', () => {
        grid.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        onPick(t.v);
      });
      grid.appendChild(b);
    });
  };
  draw(current);
  return grid;
}

const DEFAULTS = { java: 'auto', sandbox: false, minMem: 1, maxMem: 4, args: '', width: '', height: '', fullscreen: false, pre: '', wrapper: '', post: '', env: '' };

export function settingsOf(inst) {
  inst.settings = { ...DEFAULTS, ...(inst.settings || {}) };
  return inst.settings;
}

const modLists = new Map();

export function installedMods(id, fresh = false) {
  if (!host.native) return Promise.resolve([]);
  if (!fresh && modLists.has(id)) return modLists.get(id);
  const p = host.call('mods.list', { id }).catch(() => []);
  modLists.set(id, p);
  return p;
}

on('mods', () => modLists.clear());

let versionCache = null;
function versionList() {
  if (!host.native) return Promise.resolve([]);
  if (!versionCache) versionCache = host.call('versions.list').catch((err) => { versionCache = null; throw err; });
  return versionCache;
}

export function mountInstances(root, app) {
  let query = '';
  let tab = 'mods';
  let saveTimer = null;

  const listEl = h('div', { class: 'inst-rows' });
  const count = h('span', { class: 'count' });
  const searchInput = h('input', { type: 'text', placeholder: 'search instances', spellcheck: 'false' });

  const aside = h('aside', { class: 'inst-list' },
    h('div', { class: 'pane-head rv' }, h('h2', {}, 'instances ', count), h('span', { class: 'grow' }), h('button', { class: 'btn ghost sm', html: icon('plus', 14) + '<span>new</span>', onclick: () => openCreate() })),
    h('div', { class: 'inst-filter rv' }, h('label', { class: 'field' }, h('span', { html: icon('search', 14) }), searchInput)),
    listEl,
  );

  const detail = h('section', { class: 'inst-detail' });
  root.append(h('div', { class: 'inst-wrap' }, aside, detail));

  searchInput.addEventListener('input', () => { query = searchInput.value.trim().toLowerCase(); renderList(); });

  function visible() {
    return ordered(instances).filter((i) => !query || i.name.toLowerCase().includes(query) || i.version.includes(query) || i.loader.includes(query));
  }

  function current() {
    return instances.find((i) => i.id === state.selected) || ordered(instances)[0];
  }

  function save(inst, patch) {
    if (!host.native) return Promise.resolve();
    return host.call('instances.update', { id: inst.id, patch }).then((raw) => {
      const fresh = normalize(raw);
      Object.assign(inst, { ...fresh, playtime: inst.playtime, playtimeSec: inst.playtimeSec, last: inst.last, size: inst.size });
    }).catch((err) => toast('could not save', err.message, 'warn'));
  }

  function renderList() {
    const list = visible();
    count.textContent = instances.length;
    listEl.innerHTML = '';
    list.forEach((inst) => {
      const row = h('button', { class: 'inst-row rv' + (inst.id === state.selected ? ' on' : ''), data: { id: inst.id } },
        h('img', { src: instIcon(inst, 4), alt: '' }),
        h('div', { class: 'ir-text' }, h('b', { text: inst.name }), h('span', { text: `${inst.version}  ${inst.loader}` })),
        isPinned(inst.id) ? h('span', { class: 'ir-pin', html: icon('tack', 12) }) : null,
        h('span', { class: 'ir-time', text: relTime(inst.lastPlayed) }),
        isRunning(inst.id) ? h('span', { class: 'ir-live' }) : null,
      );
      row.addEventListener('click', () => set('selected', inst.id));
      row.addEventListener('dblclick', () => app.launch(inst));
      row.addEventListener('contextmenu', (e) => contextMenu(e, inst));
      listEl.appendChild(row);
    });
    if (!instances.length) listEl.appendChild(h('div', { class: 'empty', text: 'no instances yet' }));
    else if (!list.length) listEl.appendChild(h('div', { class: 'empty', text: `nothing called "${query}"` }));
    reveal(listEl, '.rv', 22);
  }

  function emptyDetail() {
    detail.innerHTML = '';
    detail.appendChild(h('div', { class: 'empty big inst-empty rv' },
      h('div', { html: icon('cube', 30) }),
      h('b', { text: 'make your first instance' }),
      h('span', { text: 'pick a minecraft version and a mod loader, nelya downloads the rest' }),
      h('button', { class: 'btn primary', html: icon('plus', 14) + '<span>new instance</span>', onclick: () => openCreate() }),
    ));
    reveal(detail, '.rv', 40);
  }

  function renderDetail(animate = true) {
    const inst = current();
    if (!inst) {
      emptyDetail();
      return;
    }
    detail.innerHTML = '';
    const running = isRunning(inst.id);
    const sizeEl = h('b', { text: inst.sizeBytes != null ? fmtBytes(inst.sizeBytes) : '...' });
    const hero = h('div', { class: 'hero rv' },
      h('button', { class: 'hero-art', 'data-tip': 'change icon', onclick: () => changeIcon(inst) }, h('img', { src: instIcon(inst, 8), alt: '' }), h('i'), h('span', { class: 'hero-art-edit', html: icon('edit', 15) })),
      h('div', { class: 'hero-text' },
        h('div', { class: 'crumb', text: `%appdata%/nelya/instances/${inst.id}` }),
        h('h1', { text: inst.name }),
        h('div', { class: 'hero-tags' },
          h('span', { class: 'tag', text: inst.version }),
          h('span', { class: 'tag', text: inst.loader + (inst.loaderVersion ? ' ' + inst.loaderVersion : '') }),
          inst.mods ? h('span', { class: 'tag', text: inst.mods + ' mods' }) : null,
        ),
      ),
      h('div', { class: 'hero-actions' },
        h('button', { class: 'btn primary' + (running ? ' running' : ''), html: running ? icon('stop', 14) + '<span>running</span>' : icon('play', 14) + '<span>play</span>', onclick: () => (running ? app.showLaunch(inst.id) : app.launch(inst)) }),
        h('button', { class: 'btn icon', html: icon('folder', 16), 'data-tip': 'open folder', onclick: () => openFolder(inst) }),
        moreBtn(inst),
      ),
    );

    const stat = (label, value, numeric, fmt) => {
      const v = value instanceof Node ? value : h('b', { text: numeric === undefined ? value : '0' });
      if (numeric !== undefined) setTimeout(() => countUp(v, numeric, { fmt }), 120);
      return h('div', { class: 'stat' }, h('span', { text: label }), v);
    };
    const stats = h('div', { class: 'stats rv' },
      stat('playtime', '', inst.playtime, (x) => (x < 1 / 60 ? '0m' : fmtHours(x))),
      stat('last played', relTime(inst.lastPlayed)),
      stat('mods', '', inst.mods),
      stat('worlds', '', inst.worlds),
      stat('size on disk', sizeEl),
    );
    if (host.native) host.call('instances.size', { id: inst.id }).then((n) => { inst.sizeBytes = n; sizeEl.textContent = fmtBytes(n); }).catch(() => {});

    const tabs = h('div', { class: 'tabs2 rv' });
    const ink = h('span', { class: 'tabs2-ink' });
    const body = h('div', { class: 'tab-body' });
    ['mods', 'worlds', 'screenshots', 'logs', 'settings'].forEach((t) => {
      const b = h('button', { class: t === tab ? 'on' : '', text: t });
      b.addEventListener('click', () => {
        tab = t;
        tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        moveInk();
        renderTab(inst, body);
      });
      tabs.appendChild(b);
    });
    tabs.appendChild(ink);
    const moveInk = () => {
      const on = tabs.querySelector('button.on');
      if (!on) return;
      ink.style.width = on.offsetWidth + 'px';
      ink.style.transform = `translateX(${on.offsetLeft}px)`;
    };

    detail.append(hero, stats, tabs, body);
    requestAnimationFrame(moveInk);
    new ResizeObserver(moveInk).observe(tabs);
    renderTab(inst, body);
    if (animate) reveal(detail, '.rv', 50);
    else detail.querySelectorAll('.rv').forEach((x) => x.classList.add('in'));
  }

  function openFolder(inst, sub) {
    if (host.native) host.call('open', { id: inst.id, sub: sub || '' }).catch((err) => toast('could not open the folder', err.message, 'warn'));
  }

  function changeIcon(inst) {
    let pick = inst.icon;
    const preview = h('img', { class: 'create-preview', src: instIcon(inst, 8), alt: '' });
    const grid = iconGrid(pick, (v) => {
      pick = v;
      preview.src = instIcon({ icon: v }, 8);
      preview.classList.remove('bump');
      void preview.offsetWidth;
      preview.classList.add('bump');
    });
    const m = modal(h('div', { class: 'icon-modal' },
      h('div', { class: 'modal-head' }, h('h3', { text: 'change icon' }), h('button', { class: 'btn icon', html: icon('x', 16), onclick: () => m.close() })),
      h('div', { class: 'icon-modal-body' },
        h('div', { class: 'create-art' }, preview, h('span', { class: 'mono dim', text: inst.name })),
        h('div', {}, h('div', { class: 'label', text: 'pick one, or import a png, jpg or ico' }), grid),
      ),
      h('div', { class: 'modal-foot' }, h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost', text: 'cancel', onclick: () => m.close() }),
        h('button', { class: 'btn primary', html: icon('check', 14) + '<span>use icon</span>', onclick: async () => {
          inst.icon = pick;
          m.close();
          await save(inst, { icon: pick });
          renderList();
          renderDetail(false);
          emit('instances');
          toast('icon changed', inst.name, 'ok');
        } }),
      ),
    ), { cls: 'icon-modal-wrap' });
  }

  function openSettings(inst) {
    tab = 'settings';
    if (state.selected !== inst.id) set('selected', inst.id);
    else renderDetail(false);
  }

  function settingsTab(inst) {
    const st = settingsOf(inst);
    const changed = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => save(inst, { settings: { ...st } }), 400);
    };
    const row = (title, desc, control) => h('div', { class: 'set-row rv2' }, h('div', { class: 'set-label' }, h('b', { text: title }), desc ? h('span', { text: desc }) : null), h('div', { class: 'set-control' }, control));
    const group = (title) => h('div', { class: 'set-group rv2', text: title });
    const text = (key, placeholder) => {
      const input = h('input', { type: 'text', class: 'mono', value: st[key] || '', placeholder, spellcheck: 'false' });
      input.addEventListener('input', () => { st[key] = input.value; changed(); });
      return h('label', { class: 'field small wide' }, input);
    };
    const total = Math.max(4, Math.round((navigator.deviceMemory || 8) >= 8 ? 32 : navigator.deviceMemory * 2));
    const maxSl = slider({ min: 1, max: 24, step: 0.5, value: st.maxMem, format: (v) => v.toFixed(1) + ' gb', onInput: (v) => { st.maxMem = v; if (st.minMem > v) st.minMem = v; changed(); } });
    const minSl = slider({ min: 0.5, max: 8, step: 0.5, value: st.minMem, format: (v) => v.toFixed(1) + ' gb', onInput: (v) => { st.minMem = Math.min(v, st.maxMem); changed(); } });
    const args = h('textarea', { class: 'mono args', spellcheck: 'false', rows: 3, placeholder: '-XX:+UseG1GC -Dfile.encoding=UTF-8' }, st.args || '');
    args.addEventListener('input', () => { st.args = args.value; changed(); });
    const w = h('input', { type: 'text', value: st.width || '', placeholder: 'auto', class: 'mono' });
    const hh = h('input', { type: 'text', value: st.height || '', placeholder: 'auto', class: 'mono' });
    w.addEventListener('input', () => { st.width = w.value.replace(/\D/g, ''); changed(); });
    hh.addEventListener('input', () => { st.height = hh.value.replace(/\D/g, ''); changed(); });
    const javaSel = select([{ value: 'auto', label: 'automatic', hint: 'downloads the right one' }, ...javas.map((j) => ({ value: j.id, label: j.name, hint: j.managed ? 'nelya' : 'system' }))], st.java, (v) => { st.java = v; changed(); });
    return h('div', { class: 'inst-settings' },
      group('java & memory'),
      row('java runtime', 'which java this instance launches with', javaSel),
      row('maximum memory', null, maxSl),
      row('minimum memory', 'memory reserved at startup', minSl),
      row('jvm arguments', 'empty by default, add your own flags', args),
      group('sync'),
      row('sync this instance', 'share the files picked on the sync tab with other synced instances', toggle((state.syncInstances || []).includes(inst.id), (v) => {
        const list = new Set(state.syncInstances || []);
        if (v) list.add(inst.id);
        else list.delete(inst.id);
        set('syncInstances', [...list]);
        if (!v && host.native) host.call('sync.detach', { id: inst.id }).catch(() => {});
        const picked = syncTargets().filter((t) => t.on).map((t) => t.label);
        toast(v ? inst.name + ' is syncing' : inst.name + ' stopped syncing', v ? (picked.length ? picked.slice(0, 3).join(', ') + (picked.length > 3 ? '...' : '') : 'pick what to sync on the sync tab') : 'its files are its own again', 'ok');
      })),
      group('security'),
      row('sandbox', 'mods can only touch this instance and the internet, not the rest of your pc. windows asks for admin once the first time', toggle(!!st.sandbox, (v) => {
        st.sandbox = v;
        changed();
        toast(v ? 'sandbox on for ' + inst.name : 'sandbox off for ' + inst.name, v ? 'applies next time you play' : '', 'ok');
      })),
      group('window'),
      row('resolution', 'leave empty to let minecraft decide', h('div', { class: 'res' }, h('label', { class: 'field small' }, w), h('span', { class: 'dim', text: 'x' }), h('label', { class: 'field small' }, hh),
        select(['custom', '1280 x 720', '1600 x 900', '1920 x 1080', '2560 x 1440'], 'custom', (v) => { if (v !== 'custom') { const [a, b] = v.split(' x '); w.value = a; hh.value = b; st.width = a; st.height = b; changed(); } }))),
      row('start fullscreen', null, toggle(!!st.fullscreen, (v) => { st.fullscreen = v; changed(); })),
      group('launch hooks'),
      row('pre-launch command', 'runs before the game starts', text('pre', '$INST_DIR\\sync.bat')),
      row('wrapper command', 'runs java through this program', text('wrapper', '')),
      row('post-exit command', 'runs after the game closes', text('post', '$INST_DIR\\backup.bat')),
      row('environment variables', 'KEY=value, separated by spaces', text('env', '')),
      h('div', { class: 'set-inline rv2' },
        h('button', { class: 'btn ghost sm', html: icon('refresh', 13) + '<span>reset to defaults</span>', onclick: async () => {
          inst.settings = { ...DEFAULTS };
          await save(inst, { settings: { ...DEFAULTS } });
          renderTab(inst, detail.querySelector('.tab-body'));
          toast('settings reset', inst.name);
        } }),
      ),
    );
  }

  function confirmDelete(inst) {
    const m = modal(h('div', { class: 'small-form' },
      h('div', { class: 'modal-head' }, h('h3', { text: 'delete ' + inst.name + '?' }), h('button', { class: 'btn icon', html: icon('x', 16), onclick: () => m.close() })),
      h('p', { class: 'dim confirm-text', text: 'its worlds, mods and settings go to the recycle bin, so you can still get them back from there.' }),
      h('div', { class: 'modal-foot' }, h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost', text: 'keep it', onclick: () => m.close() }),
        h('button', { class: 'btn danger-fill', html: icon('trash', 14) + '<span>delete</span>', onclick: async () => {
          m.close();
          try {
            if (host.native) await host.call('instances.delete', { id: inst.id });
            const i = instances.indexOf(inst);
            if (i >= 0) instances.splice(i, 1);
            if (state.selected === inst.id) set('selected', ordered(instances)[0] ? ordered(instances)[0].id : null);
            set('pinned', (state.pinned || []).filter((x) => x !== inst.id));
            set('syncInstances', (state.syncInstances || []).filter((x) => x !== inst.id));
            emit('instances');
            renderList();
            renderDetail(false);
            toast(inst.name + ' deleted', 'moved to the recycle bin', 'ok');
          } catch (err) {
            toast('could not delete it', err.message, 'warn');
          }
        } }),
      ),
    ), { cls: 'narrow' });
  }

  function instMenu(inst, opts = {}) {
    const item = (ic, label, fn, cls = '') => h('button', { class: 'menu-item ' + cls, onclick: () => { closePop(); fn(); } }, h('span', { html: icon(ic, 14) }), h('span', { text: label }));
    return h('div', { class: 'menu' },
      opts.play ? item('play', isRunning(inst.id) ? 'show game' : 'play', () => (isRunning(inst.id) ? app.showLaunch(inst.id) : app.launch(inst))) : null,
      opts.play ? item('userplus', 'launch alt', () => app.launch(inst, { alt: true })) : null,
      opts.play ? h('hr') : null,
      item('edit', 'edit instance', () => openCreate(inst)),
      item('image', 'change icon', () => changeIcon(inst)),
      item('sliders', 'instance settings', () => (root.classList.contains('active') ? openSettings(inst) : app.instanceSettings(inst))),
      item('tack', isPinned(inst.id) ? 'unpin' : 'pin to top', () => {
        const pinned = togglePin(inst.id);
        toast(pinned ? 'pinned ' + inst.name : 'unpinned ' + inst.name, pinned ? 'it shows first on home' : '', 'ok');
      }),
      h('hr'),
      item('folder', 'open folder', () => openFolder(inst)),
      item('copy', 'duplicate', async () => {
        try {
          const raw = await host.call('instances.duplicate', { id: inst.id });
          const copy = normalize(raw);
          instances.push(copy);
          set('selected', copy.id);
          emit('instances');
          renderList();
          toast('duplicated', copy.name, 'ok');
        } catch (err) {
          toast('could not duplicate', err.message, 'warn');
        }
      }),
      item('link', 'create desktop shortcut', () => {
        host.send('shortcut', inst.id);
        toast('shortcut created', 'it launches ' + inst.name + ' straight away', 'ok');
      }),
      h('hr'),
      item('trash', 'delete instance', () => confirmDelete(inst), 'danger'),
    );
  }

  function moreBtn(inst) {
    const b = h('button', { class: 'btn icon', html: icon('more', 16) });
    b.addEventListener('click', () => popover(b, instMenu(inst), { width: 220, align: 'right' }));
    return b;
  }

  const cursor = h('i', { class: 'ctx-anchor' });
  document.getElementById('layer').appendChild(cursor);

  function contextMenu(e, inst) {
    e.preventDefault();
    closePop();
    if (state.selected !== inst.id) set('selected', inst.id);
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
    popover(cursor, instMenu(inst), { width: 220, offset: 2 });
  }

  function renderTab(inst, body) {
    body.classList.remove('in');
    body.innerHTML = '';
    if (tab === 'mods') body.appendChild(modsTab(inst));
    if (tab === 'worlds') body.appendChild(worldsTab(inst));
    if (tab === 'screenshots') body.appendChild(shotsTab(inst));
    if (tab === 'logs') body.appendChild(logsTab(inst));
    if (tab === 'settings') body.appendChild(settingsTab(inst));
    void body.offsetWidth;
    body.classList.add('in');
    reveal(body, '.rv2', 18);
  }

  function loading(text) {
    return h('div', { class: 'tab-loading mono dim' }, h('span', { class: 'spinner' }), h('span', { text }));
  }

  function modsTab(inst) {
    const wrap = h('div', { class: 'tab-mods' });
    if (inst.loader === 'vanilla') {
      wrap.appendChild(h('div', { class: 'empty big' }, h('div', { html: icon('puzzle', 28) }), h('b', { text: 'vanilla has no mod loader' }), h('span', { text: 'edit the instance and pick fabric, quilt, forge or neoforge to add mods' })));
      return wrap;
    }
    const filterIn = h('input', { type: 'text', placeholder: 'filter mods', spellcheck: 'false' });
    const rows = h('div', { class: 'mod-table' });
    const updAll = h('button', { class: 'btn ghost sm upd-all', disabled: true, html: icon('refresh', 13) + '<span>update all</span>' });
    const tools = h('div', { class: 'tab-tools' },
      h('label', { class: 'field small' }, h('span', { html: icon('search', 13) }), filterIn),
      h('span', { class: 'grow' }),
      updAll,
      h('button', { class: 'btn ghost sm', html: icon('folder', 13) + '<span>mods folder</span>', onclick: () => openFolder(inst, 'mods') }),
      h('button', { class: 'btn ghost sm', html: icon('plus', 13) + '<span>add mods</span>', onclick: () => app.go('mods', { forInstance: inst.id }) }),
    );
    wrap.append(tools, rows);
    rows.appendChild(loading('reading the mods folder'));
    let list = [];
    let updates = {};
    let updating = false;
    const syncAll = () => {
      const n = Object.keys(updates).length;
      updAll.disabled = updating || !n;
      updAll.classList.toggle('has', n > 0 && !updating);
      if (!updating) updAll.innerHTML = icon(n ? 'refresh' : 'check', 13) + `<span>${n ? `update all <b>${n}</b>` : 'up to date'}</span>`;
    };
    updAll.addEventListener('click', async () => {
      const files = Object.keys(updates);
      if (updating || !files.length) return;
      updating = true;
      syncAll();
      updAll.innerHTML = icon('refresh', 13, 'spin') + `<span>updating ${files.length}</span>`;
      rows.querySelectorAll('.upd').forEach((b) => {
        b.classList.add('busy');
        b.innerHTML = icon('refresh', 11, 'spin') + '<span>updating</span>';
      });
      const items = files.map((f) => {
        const u = updates[f];
        const m = list.find((x) => x.file === f) || {};
        return { versionId: u.versionId, title: u.title || m.title || f, icon: u.icon || m.icon };
      });
      try {
        const done = await host.call('mods.install', { id: inst.id, target: inst.name, items });
        updates = {};
        list = (await installedMods(inst.id, true)) || list;
        toast(`updated ${done.length} mod${done.length === 1 ? '' : 's'}`, inst.name, 'ok');
        emit('mods');
      } catch (err) {
        toast('update all failed', err.message, 'warn');
        updates = (await host.call('mods.updates', { id: inst.id, force: true }).catch(() => null)) || updates;
      }
      updating = false;
      draw();
    });
    const draw = () => {
      syncAll();
      const q = filterIn.value.trim().toLowerCase();
      rows.innerHTML = '';
      const shown = list.filter((m) => !q || (m.title || m.file).toLowerCase().includes(q));
      shown.forEach((m) => {
        const upd = updates[m.file];
        const row = h('div', { class: 'mod-line rv2' + (m.enabled ? '' : ' off') },
          h('img', { class: 'mod-ic', src: m.icon || UNKNOWN, alt: '' }),
          h('div', { class: 'ml-name' }, h('b', { text: m.title || m.file }), h('small', { class: 'mono dim', text: m.file })),
          h('span', { class: 'mono dim', text: m.version || '' }),
          upd ? updateTag(inst, m, upd, (f) => { delete updates[f]; syncAll(); }) : h('span'),
          h('span', { class: 'mono dim', text: fmtBytes(m.size) }),
          h('div', { class: 'ml-end' },
            h('button', { class: 'btn icon sm ml-del', html: icon('trash', 13), 'data-tip': 'remove', onclick: async () => {
              try {
                await host.call('mods.remove', { id: inst.id, file: m.file });
                list = list.filter((x) => x !== m);
                inst.mods = Math.max(0, inst.mods - 1);
                emit('mods');
                draw();
                toast('removed ' + (m.title || m.file), '', 'ok');
              } catch (err) {
                toast('could not remove it', err.message, 'warn');
              }
            } }),
            toggle(m.enabled, async (v) => {
              row.classList.toggle('off', !v);
              try {
                await host.call('mods.toggle', { id: inst.id, file: m.file, enabled: v });
                m.enabled = v;
              } catch (err) {
                toast('could not change it', err.message, 'warn');
              }
            }),
          ),
        );
        rows.appendChild(row);
      });
      if (!list.length) rows.appendChild(h('div', { class: 'empty big' }, h('div', { html: icon('puzzle', 26) }), h('b', { text: 'no mods yet' }), h('span', { text: 'find some on the mods tab, or drop jars into the mods folder' })));
      else if (!shown.length) rows.appendChild(h('div', { class: 'empty', text: 'no mods match' }));
      reveal(rows, '.rv2', 10);
    };
    filterIn.addEventListener('input', draw);
    installedMods(inst.id, true).then((l) => {
      list = l || [];
      if (inst.mods !== list.length) {
        inst.mods = list.length;
        const stat = detail.querySelector('.stats .stat:nth-child(3) b');
        if (stat) stat.textContent = String(list.length);
        emit('instances');
      }
      draw();
      if (!host.native || !list.length) return;
      updAll.innerHTML = icon('refresh', 13, 'spin') + '<span>checking</span>';
      host.call('mods.updates', { id: inst.id }).then((u) => { updates = u || {}; draw(); }).catch(() => syncAll());
    });
    return wrap;
  }

  function updateTag(inst, m, upd, onDone) {
    const b = h('button', { class: 'upd', text: 'update', 'data-tip': 'update to ' + upd.version });
    b.addEventListener('click', async () => {
      if (b.classList.contains('busy')) return;
      b.classList.add('busy');
      b.innerHTML = icon('refresh', 11, 'spin') + '<span>updating</span>';
      try {
        await host.call('mods.install', { id: inst.id, target: inst.name, items: [{ versionId: upd.versionId, title: upd.title || m.title, icon: upd.icon || m.icon }] });
        b.classList.remove('busy');
        b.classList.add('done');
        b.innerHTML = icon('check', 11) + '<span>updated</span>';
        if (onDone) onDone(m.file);
        const row = b.closest('.mod-line');
        if (row) row.querySelector('.mono.dim').textContent = upd.version;
        emit('mods');
        setTimeout(() => {
          b.classList.add('gone');
          setTimeout(() => b.replaceWith(h('span')), 300);
        }, 1400);
      } catch (err) {
        b.classList.remove('busy');
        b.textContent = 'update';
        toast('update failed', err.message, 'warn');
      }
    });
    return b;
  }

  function worldsTab(inst) {
    const wrap = h('div', {});
    const tools = h('div', { class: 'tab-tools' }, h('span', { class: 'grow' }), h('button', { class: 'btn ghost sm', html: icon('folder', 13) + '<span>saves folder</span>', onclick: () => openFolder(inst, 'saves') }));
    const grid = h('div', { class: 'world-grid' });
    wrap.append(tools, grid);
    grid.appendChild(loading('reading worlds'));
    const show = (list) => {
      grid.innerHTML = '';
      if (!list.length) {
        grid.appendChild(h('div', { class: 'empty big' }, h('div', { html: icon('globe', 28) }), h('b', { text: 'no worlds yet' }), h('span', { text: 'make one in game and it shows up here' })));
        return;
      }
      list.forEach((w) => {
        grid.appendChild(h('div', { class: 'world rv2' },
          h('div', { class: 'world-img' + (w.icon ? ' real' : ''), style: { backgroundImage: `url(${w.icon || landscape(inst.id + w.folder, 320, 160)})` } },
            h('button', { class: 'world-play', html: icon('play', 14) + '<span>play world</span>', onclick: () => app.launch(inst, { world: w.folder }) })),
          h('div', { class: 'world-meta' }, h('b', { text: w.name }), h('span', { text: `${w.mode}, ${relTime(w.lastPlayed)}` })),
        ));
      });
      reveal(grid, '.rv2', 30);
    };
    if (host.native) host.call('files.worlds', { id: inst.id }).then((l) => {
      inst.worlds = l.length;
      const stat = detail.querySelector('.stats .stat:nth-child(4) b');
      if (stat) stat.textContent = String(l.length);
      show(l);
    }).catch(() => show([]));
    else show([]);
    return wrap;
  }

  function shotsTab(inst) {
    const wrap = h('div', {});
    const tools = h('div', { class: 'tab-tools' }, h('span', { class: 'grow' }), h('button', { class: 'btn ghost sm', html: icon('folder', 13) + '<span>screenshots folder</span>', onclick: () => openFolder(inst, 'screenshots') }));
    const grid = h('div', { class: 'shot-grid' });
    wrap.append(tools, grid);
    grid.appendChild(loading('reading screenshots'));
    const show = (list) => {
      grid.innerHTML = '';
      if (!list.length) {
        grid.appendChild(h('div', { class: 'empty big' }, h('div', { html: icon('image', 28) }), h('b', { text: 'no screenshots yet' }), h('span', { text: 'press f2 in game to take one' })));
        return;
      }
      list.forEach((s) => {
        const b = h('button', { class: 'shot real rv2', style: { backgroundImage: `url("${s.url}")` } });
        b.addEventListener('click', () => {
          const m = modal(h('div', { class: 'lightbox' },
            h('img', { src: s.url, alt: '', class: 'real' }),
            h('div', { class: 'lightbox-bar' }, h('span', { class: 'mono', text: s.name }), h('span', { class: 'grow' }),
              h('button', { class: 'btn ghost sm', html: icon('copy', 13) + '<span>copy</span>', onclick: () => { host.send('clip:image', s.path); toast('copied to clipboard', s.name, 'ok'); } }),
              h('button', { class: 'btn ghost sm', html: icon('x', 13) + '<span>close</span>', onclick: () => m.close() })),
          ), { cls: 'wide' });
        });
        grid.appendChild(b);
      });
      reveal(grid, '.rv2', 20);
    };
    if (host.native) host.call('files.screenshots', { id: inst.id }).then(show).catch(() => show([]));
    else show([]);
    return wrap;
  }

  function logsTab(inst) {
    let lvl = 'all';
    let lines = [];
    const box = h('pre', { class: 'log' });
    const draw = () => {
      box.innerHTML = '';
      const shown = lines.filter((l) => lvl === 'all' || l.lvl === lvl);
      shown.forEach((l) => box.appendChild(h('div', { class: 'log-' + l.lvl, text: l.text })));
      if (!lines.length) box.appendChild(h('div', { class: 'dim', text: 'no log yet, play this instance once' }));
      box.scrollTop = box.scrollHeight;
    };
    const text = () => lines.map((l) => l.text).join('\n');
    const wrap = h('div', { class: 'tab-logs' },
      h('div', { class: 'tab-tools' },
        segmented(['all', 'info', 'warn', 'error'], 'all', (v) => { lvl = v; draw(); }, { cls: 'small' }),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost sm', html: icon('copy', 13) + '<span>copy</span>', onclick: () => { host.send('clip:text', text()); toast('log copied', 'latest.log', 'ok'); } }),
        h('button', { class: 'btn ghost sm', html: icon('upload', 13) + '<span>share</span>', onclick: async (e) => {
          const btn = e.currentTarget;
          if (!lines.length) return;
          btn.classList.add('busy');
          try {
            const url = await host.call('files.share', { text: text() });
            host.send('clip:text', url);
            toast('log uploaded', url + ' copied', 'ok', 6000);
          } catch (err) {
            toast('could not upload the log', err.message, 'warn');
          }
          btn.classList.remove('busy');
        } }),
        h('button', { class: 'btn ghost sm', html: icon('folder', 13) + '<span>logs folder</span>', onclick: () => openFolder(inst, 'logs') }),
      ),
      box,
    );
    box.appendChild(loading('reading latest.log'));
    if (host.native) {
      host.call('files.log', { id: inst.id }).then((t) => {
        lines = String(t || '').split('\n').filter((l) => l.trim()).map((l) => ({ text: l.replace(/\r$/, ''), lvl: /\/ERROR\]|\/FATAL\]/.test(l) ? 'error' : /\/WARN\]/.test(l) ? 'warn' : 'info' }));
        draw();
      }).catch(() => draw());
    } else draw();
    return wrap;
  }

  function openCreate(editing) {
    let ver = editing ? editing.version : null;
    let loader = editing ? editing.loader : 'fabric';
    let loaderVersion = editing ? editing.loaderVersion : null;
    let kind = 'release';
    let ico = editing ? editing.icon : 'grass';
    let all = [];
    const nameIn = h('input', { type: 'text', value: editing ? editing.name : '', placeholder: 'my new instance', spellcheck: 'false' });
    const preview = h('img', { class: 'create-preview', src: instIcon({ icon: ico }, 8), alt: '' });
    const icons = iconGrid(ico, (v) => { ico = v; preview.src = instIcon({ icon: v }, 8); });
    const vlist = h('div', { class: 'ver-list' });
    const verFilter = h('input', { type: 'text', placeholder: 'find a version', spellcheck: 'false' });
    const lvWrap = h('div', { class: 'lv-wrap' });
    const createBtn = h('button', { class: 'btn primary', html: icon(editing ? 'check' : 'plus', 14) + `<span>${editing ? 'save' : 'create'}</span>` });

    const drawVersions = () => {
      vlist.innerHTML = '';
      const q = verFilter.value.trim();
      const list = all.filter((v) => v.type === kind && (!q || v.id.includes(q)));
      if (!all.length) {
        vlist.appendChild(loading(host.native ? 'loading versions from mojang' : 'versions load inside the app'));
        return;
      }
      list.slice(0, 400).forEach((v) => {
        const row = h('button', { class: 'ver' + (v.id === ver ? ' on' : '') }, h('span', { class: 'radio' }), h('b', { text: v.id }), h('span', { class: 'mono dim', text: v.date }));
        row.addEventListener('click', () => {
          ver = v.id;
          vlist.querySelectorAll('.ver').forEach((x) => x.classList.toggle('on', x === row));
          loadLoaders();
        });
        vlist.appendChild(row);
      });
      if (!list.length) vlist.appendChild(h('div', { class: 'empty', text: 'no versions match' }));
      const on = vlist.querySelector('.ver.on');
      if (on) on.scrollIntoView({ block: 'nearest' });
    };

    let loaderReq = 0;
    const loadLoaders = async () => {
      lvWrap.innerHTML = '';
      createBtn.disabled = !ver;
      if (loader === 'vanilla' || !ver) {
        loaderVersion = null;
        return;
      }
      const req = ++loaderReq;
      lvWrap.appendChild(loading(`checking ${loader} for ${ver}`));
      let list = [];
      try {
        list = host.native ? await host.call('loaders.list', { loader, mc: ver }) : [];
      } catch {}
      if (req !== loaderReq) return;
      lvWrap.innerHTML = '';
      if (!list.length) {
        loaderVersion = null;
        createBtn.disabled = true;
        lvWrap.appendChild(h('div', { class: 'lv-none mono', text: `${loader} is not available for ${ver}` }));
        return;
      }
      createBtn.disabled = false;
      const stable = list.find((x) => x.stable) || list[0];
      if (!loaderVersion || !list.some((x) => x.id === loaderVersion)) loaderVersion = stable.id;
      lvWrap.appendChild(select(list.slice(0, 60).map((x) => ({ value: x.id, label: x.id, hint: x.stable ? '' : 'beta' })), loaderVersion, (v) => (loaderVersion = v), { label: loader }));
    };

    const loaderSeg = segmented(loaders.map((l) => ({ value: l, label: l })), loader, (v) => {
      loader = v;
      loaderVersion = null;
      loadLoaders();
    });
    verFilter.addEventListener('input', drawVersions);

    const m = modal(h('div', { class: 'create' },
      h('div', { class: 'modal-head' }, h('h3', { text: editing ? 'edit instance' : 'new instance' }), h('button', { class: 'btn icon', html: icon('x', 16), onclick: () => m.close() })),
      h('div', { class: 'create-grid' },
        h('div', { class: 'create-left' },
          h('div', { class: 'create-art' }, preview),
          h('div', { class: 'label', text: 'icon' }),
          icons,
        ),
        h('div', { class: 'create-right' },
          h('div', { class: 'label', text: 'name' }),
          h('label', { class: 'field' }, nameIn),
          h('div', { class: 'label', text: 'game version' }),
          h('div', { class: 'ver-tools' },
            segmented([{ value: 'release', label: 'releases' }, { value: 'snapshot', label: 'snapshots' }, { value: 'old', label: 'old' }], kind, (v) => { kind = v; drawVersions(); }, { cls: 'small' }),
            h('label', { class: 'field small' }, h('span', { html: icon('search', 12) }), verFilter),
          ),
          vlist,
          h('div', { class: 'label', text: 'mod loader' }),
          loaderSeg,
          lvWrap,
        ),
      ),
      h('div', { class: 'modal-foot' },
        h('span', { class: 'mono dim', text: editing ? 'changing the version re-downloads on next launch' : 'files go to %appdata%/nelya/instances' }),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost', text: 'cancel', onclick: () => m.close() }),
        createBtn,
      ),
    ), { cls: 'create-modal' });
    setTimeout(() => nameIn.focus(), 200);
    createBtn.disabled = true;
    drawVersions();
    versionList().then((list) => {
      all = list || [];
      if (!ver) ver = (all.find((v) => v.type === 'release') || {}).id || null;
      drawVersions();
      loadLoaders();
    }).catch((err) => {
      vlist.innerHTML = '';
      vlist.appendChild(h('div', { class: 'empty', text: 'could not load versions: ' + err.message }));
    });

    createBtn.addEventListener('click', async () => {
      if (!ver || createBtn.disabled) return;
      const name = nameIn.value.trim() || (loader === 'vanilla' ? ver : `${ver} ${loader}`);
      createBtn.disabled = true;
      try {
        if (editing) {
          editing.name = name;
          await save(editing, { name, version: ver, loader, loaderVersion, icon: ico });
          toast('saved', name, 'ok');
        } else {
          const raw = await host.call('instances.create', { spec: { name, version: ver, loader, loaderVersion, icon: ico } });
          const inst = normalize(raw);
          instances.push(inst);
          set('selected', inst.id);
          toast('setting up ' + inst.name, 'downloading the game, see the top right', 'dl');
        }
        m.close();
        renderList();
        renderDetail();
        emit('instances');
      } catch (err) {
        createBtn.disabled = false;
        toast('could not create it', err.message, 'warn');
      }
    });
  }

  on('selected', () => {
    listEl.querySelectorAll('.inst-row').forEach((r) => r.classList.toggle('on', r.dataset.id === state.selected));
    if (root.classList.contains('active')) renderDetail();
    else renderDetail(false);
  });
  on('running', () => { renderList(); renderDetail(false); });
  on('pinned', () => { renderList(); renderDetail(false); });
  on('instances', () => { renderList(); });

  renderList();
  renderDetail(false);

  return {
    enter() {
      renderList();
      renderDetail();
      reveal(aside, ':scope > .rv', 50);
    },
    leave() {},
    openCreate,
    menu: instMenu,
    openSettings(inst) {
      openSettings(inst);
    },
  };
}
