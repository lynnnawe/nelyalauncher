import { h, reveal, toast, toggle } from './ui.js';
import { icon } from './icons.js';
import { instIcon } from './sprites.js';
import { instances } from './data.js';
import { ordered, state, on } from './state.js';
import { host } from './host.js';

const STORE = 'nelya-sync';

const DEFAULT_TARGETS = [
  { id: 'options', path: 'options.txt', label: 'options', desc: 'keybinds, video settings, sound and language', ic: 'sliders', on: true },
  { id: 'servers', path: 'servers.dat', label: 'server list', desc: 'your multiplayer servers', ic: 'globe', on: true },
  { id: 'hotbars', path: 'hotbar.nbt', label: 'saved hotbars', desc: 'creative mode hotbar presets', ic: 'layers', on: false },
  { id: 'commands', path: 'command_history.txt', label: 'command history', desc: 'what you get when pressing up in chat', ic: 'terminal', on: false },
  { id: 'resourcepacks', path: 'resourcepacks/', label: 'resource packs', desc: 'shared folder, stored once on disk', ic: 'image', on: true },
  { id: 'shaderpacks', path: 'shaderpacks/', label: 'shader packs', desc: 'shared folder, stored once on disk', ic: 'sparkle', on: false },
  { id: 'screenshots', path: 'screenshots/', label: 'screenshots', desc: 'every screenshot in one place', ic: 'image', on: true },
  { id: 'saves', path: 'saves/', label: 'worlds', desc: 'singleplayer saves, older versions may upgrade them', ic: 'cube', on: false },
];

function load() {
  if (!host.native) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved && Array.isArray(saved.targets)) return saved;
    } catch {}
  }
  return {
    targets: DEFAULT_TARGETS.map((t) => ({ ...t })),
    last: 0,
  };
}

function save(data) {
  if (host.native) host.call('store.set', { key: 'sync', value: data }).catch(() => {});
  else {
    try { localStorage.setItem(STORE, JSON.stringify(data)); } catch {}
  }
}

let ready = null;

export function syncReady() {
  if (!shared) shared = load();
  if (!ready) {
    ready = !host.native ? Promise.resolve() : host.call('store.get', { key: 'sync' }).then((v) => {
      if (v && Array.isArray(v.targets)) {
        shared.targets.length = 0;
        v.targets.forEach((t) => shared.targets.push(t));
        shared.last = v.last || 0;
      } else save(shared);
    }).catch(() => {});
  }
  return ready;
}

function ago(t) {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  return Math.round(s / 3600) + 'h ago';
}

let shared = null;

export function syncTargets() {
  if (!shared) shared = load();
  return shared.targets;
}

export function mountSync(root, app) {
  if (!shared) shared = load();
  const data = shared;
  const persist = () => save(data);

  const lastText = h('span', { class: 'mono dim' });
  const who = h('div', { class: 'sync-who' });
  const syncBtn = h('button', { class: 'btn ghost sm', html: icon('refresh', 13) + '<span>sync now</span>' });
  const list = h('div', { class: 'sync-list' });
  const pathIn = h('input', { type: 'text', placeholder: 'add a file or folder, like config/xaerominimap', spellcheck: 'false' });

  root.append(h('div', { class: 'sync-wrap' },
    h('div', { class: 'sync-head rv' },
      h('div', {}, h('h2', { text: 'sync' }), h('p', { class: 'dim', text: 'pick what synced instances share. turn syncing on per instance in its settings tab.' })),
      h('span', { class: 'grow' }),
      h('span', { class: 'sync-state' }, h('span', { class: 'sync-dot' }), lastText),
      syncBtn,
    ),
    h('div', { class: 'rv' }, who),
    h('div', { class: 'sync-left rv' }, list,
      h('label', { class: 'field small sync-add' }, h('span', { html: icon('plus', 13) }), pathIn,
        h('button', { class: 'btn ghost sm', html: '<span>add</span>', onclick: addFolder }))),
  ));

  pathIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') addFolder(); });

  function addFolder() {
    const p = pathIn.value.trim().replace(/\\/g, '/');
    if (!p) { pathIn.focus(); return; }
    const id = 'custom-' + Date.now().toString(36);
    data.targets.push({ id, path: p, label: p.split('/').filter(Boolean).pop() || p, desc: p.includes('.') ? 'custom file' : 'custom folder', ic: 'folder', on: true, custom: true });
    pathIn.value = '';
    persist();
    renderList();
    toast('now syncing ' + p, '', 'ok');
  }

  function renderWho() {
    who.innerHTML = '';
    const ids = state.syncInstances || [];
    const synced = ordered(instances).filter((i) => ids.includes(i.id));
    if (!synced.length) {
      who.appendChild(h('span', { class: 'dim', text: 'no instances are syncing yet' }));
      return;
    }
    who.appendChild(h('span', { class: 'dim', text: 'syncing' }));
    synced.forEach((i) => who.appendChild(h('button', { class: 'sync-chip', onclick: () => app.instanceSettings(i) }, h('img', { src: instIcon(i, 4), alt: '' }), h('span', { text: i.name }))));
  }

  function renderList() {
    list.innerHTML = '';
    data.targets.forEach((t) => {
      const row = h('div', { class: 'sync-row' + (t.on ? '' : ' off') },
        h('span', { class: 'sync-ic', html: icon(t.ic, 15) }),
        h('div', { class: 'sync-text' }, h('b', { text: t.label }), h('span', { text: t.desc })),
        h('span', { class: 'sync-path mono', text: t.path }),
        t.custom ? h('button', { class: 'btn icon sm', html: icon('trash', 13), 'data-tip': 'remove', onclick: () => {
          data.targets.splice(data.targets.indexOf(t), 1);
          persist();
          renderList();
        } }) : null,
        toggle(t.on, (v) => {
          t.on = v;
          row.classList.toggle('off', !v);
          persist();
        }),
      );
      row.addEventListener('click', (e) => {
        if (e.target.closest('.switch, button')) return;
        row.querySelector('.switch input').click();
      });
      list.appendChild(row);
    });
  }

  function tickLast() {
    lastText.textContent = data.last ? 'synced ' + ago(data.last) : 'not synced yet';
  }

  syncBtn.addEventListener('click', () => {
    if (syncBtn.classList.contains('busy')) return;
    if (!(state.syncInstances || []).length) {
      toast('nothing to sync', 'turn on syncing in an instance\u2019s settings', 'warn');
      return;
    }
    syncBtn.classList.add('busy');
    root.classList.add('syncing');
    syncBtn.innerHTML = icon('refresh', 13, 'spin') + '<span>syncing</span>';
    lastText.textContent = 'syncing...';
    const finish = (ok, msg) => {
      data.last = ok ? Date.now() : data.last;
      persist();
      syncBtn.classList.remove('busy');
      root.classList.remove('syncing');
      syncBtn.innerHTML = icon('refresh', 13) + '<span>sync now</span>';
      tickLast();
      if (ok) toast('synced', msg, 'ok');
      else toast('sync failed', msg, 'warn');
    };
    if (!host.native) {
      setTimeout(() => finish(true, 'demo mode'), 900);
      return;
    }
    persist();
    host.call('sync.now').then((r) => finish(true, `${r.targets} things across ${r.instances} instances`)).catch((err) => finish(false, err.message));
  });

  setInterval(() => { if (!root.classList.contains('syncing')) tickLast(); }, 15000);
  on('syncInstances', renderWho);
  tickLast();
  renderWho();
  renderList();
  syncReady().then(() => { tickLast(); renderList(); });

  return {
    enter() {
      tickLast();
      renderWho();
      renderList();
      reveal(root, '.rv', 60);
    },
    leave() {},
  };
}
