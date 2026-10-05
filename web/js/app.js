import { host, bindChrome } from './host.js';
import { h, bindTips, popover, closePop, toast } from './ui.js';
import { icon } from './icons.js';
import { Starfield } from './stars.js';
import { state, set, on, accents, hydrate } from './state.js';
import { instances, accounts, javas, notifications, normalize, replaceAll, relTime } from './data.js';
import { logs } from './logs.js';
import { normalizeSkin } from './skin.js';
import { mountHome } from './home.js';
import { mountInstances } from './instances.js';
import { mountMods } from './mods.js';
import { mountConsole } from './console.js';
import { mountSkins } from './skins.js';
import { mountSettings } from './settings.js';
import { createLauncher } from './launch.js';
import { createLogin, restoreAccounts, adoptAccount } from './login.js';
import { mountSync } from './sync.js';
import { downloads } from './downloads.js';
import { UNKNOWN } from './sprites.js';
import { initUpdates } from './updates.js';

const appEl = document.getElementById('app');
const tabs = document.getElementById('tabs');
const ink = tabs.querySelector('.tab-ink');
const pagesEl = document.getElementById('pages');

document.querySelector('.wc-min').innerHTML = icon('minus', 14);
document.querySelector('.wc-max').innerHTML = icon('window', 12);
document.querySelector('.wc-close').innerHTML = icon('x', 14);
const gear = document.getElementById('gear-btn');
gear.innerHTML = icon('gear', 16);
document.getElementById('bell-btn').insertAdjacentHTML('afterbegin', icon('bell', 15));
document.querySelector('.brand-mark').innerHTML = `<img src="${moonMark()}" alt="">`;

function moonMark() {
  const c = document.createElement('canvas');
  c.width = 36;
  c.height = 36;
  const g = c.getContext('2d');
  g.fillStyle = `rgb(${accents[state.accent]})`;
  g.beginPath();
  g.arc(17, 18, 14, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(25, 13, 12.5, 0, Math.PI * 2);
  g.fill();
  return c.toDataURL();
}

async function load() {
  if (!host.native) return;
  try {
    const init = await host.call('init');
    hydrate(init.settings);
    state.root = init.root;
    state.appVersion = init.version;
    replaceAll(instances, (init.instances || []).map(normalize));
    const rawAccounts = init.accounts || [];
    await Promise.all(rawAccounts.map(async (a) => {
      if (!a.skin) return;
      try {
        a.skin = await normalizeSkin(a.skin);
      } catch {
        a.skin = null;
      }
    }));
    replaceAll(accounts, rawAccounts.map(adoptAccount));
    notifications.length = 0;
    logs.clear();
    host.call('java.list').then((l) => replaceAll(javas, l || [])).catch(() => {});
    if (!instances.some((i) => i.id === state.selected)) state.selected = instances[0] ? instances[0].id : null;
    if (!accounts.some((a) => a.id === state.account)) state.account = accounts[0] ? accounts[0].id : null;
    state.pinned = (state.pinned || []).filter((id) => instances.some((i) => i.id === id));
    state.syncInstances = (state.syncInstances || []).filter((id) => instances.some((i) => i.id === id));
    const text = await host.call('log.read').catch(() => '');
    String(text || '').split(/\r?\n/).filter(Boolean).slice(-60).forEach((l) => {
      const m = l.match(/^\[[^\]]+\] \[(\w+)\] (.*)$/);
      if (m) logs.push(m[2], m[1] === 'error' ? 'error' : m[1] === 'warn' ? 'warn' : 'info', 'launcher');
    });
    logs.push(`nelya ${init.version} started, data in ${init.root}`, 'info', 'launcher');
  } catch (err) {
    console.error(err);
  }
}

async function boot() {
await load();
const sky = new Starfield(document.querySelector('.sky'), { density: 0.00016, drift: 2.2, tint: [215, 212, 235] });

restoreAccounts();
const launchHooks = {};
const launcher = createLauncher(document.getElementById('launch'), launchHooks);
const login = createLogin(document.getElementById('login'));

const app = {
  go,
  launch: (inst, opts) => launcher.launch(inst, opts),
  showLaunch: (id) => launcher.show(id),
  editInstance: (inst) => { go('instances'); setTimeout(() => pages.instances.openCreate(inst || undefined), 260); },
  instanceSettings: (inst) => { go('instances'); setTimeout(() => pages.instances.openSettings(inst), 220); },
  addAccount: () => { closePop(); login.open(); },
  instanceMenu: (inst, opts) => pages.instances.menu(inst, opts),
  launcher,
  home: null,
};

const pages = {};
const roots = {};
pagesEl.querySelectorAll('.page').forEach((p) => (roots[p.dataset.page] = p));
pages.home = mountHome(roots.home, app);
app.home = pages.home;
pages.instances = mountInstances(roots.instances, app);
pages.mods = mountMods(roots.mods, app);
pages.console = mountConsole(roots.console, app);
pages.skins = mountSkins(roots.skins, app);
pages.settings = mountSettings(roots.settings, app);
pages.sync = mountSync(roots.sync, app);

const syncTab = tabs.querySelector('.tab-sync');
function applySync() {
  const v = (state.syncInstances || []).length > 0;
  syncTab.classList.toggle('shown', v);
  if (!v && state.page === 'sync') go('home');
  requestAnimationFrame(() => moveInk());
  setTimeout(() => moveInk(), 360);
}
applySync();
on('syncInstances', applySync);

const bell = document.getElementById('bell-btn');
const dlBtn = document.getElementById('dl-btn');
dlBtn.innerHTML = `<svg class="dl-ring" viewBox="0 0 30 30"><circle cx="15" cy="15" r="12"/><circle class="dl-prog" cx="15" cy="15" r="12"/></svg>${icon('download', 15, 'dl-arrow')}<span class="dl-count"></span>`;
let dlList = null;
function fmtMb(v) {
  return v >= 100 ? Math.round(v) + ' mb' : v.toFixed(1) + ' mb';
}
function drawDownloads() {
  if (!dlList) return;
  dlList.innerHTML = '';
  if (!downloads.items.length) {
    dlList.appendChild(h('div', { class: 'empty', text: 'nothing downloading' }));
    return;
  }
  downloads.items.slice(0, 40).forEach((d) => {
    const pct = Math.round((d.done / d.size) * 100);
    const meta = d.kind === 'packfiles' ? `${Math.round(d.done)} of ${Math.round(d.size)} files` : d.status === 'done' ? `${fmtMb(d.size)}, done` : d.status === 'queued' ? `${fmtMb(d.size)}, queued` : `${fmtMb(d.done)} of ${fmtMb(d.size)}, ${d.speed.toFixed(1)} mb/s`;
    const row = h('div', { class: 'dl-row ' + d.status },
      d.icon || d.kind === 'mod' ? h('img', { src: d.icon || UNKNOWN, alt: '' }) : h('span', { class: 'dl-ic', html: icon(d.kind === 'java' ? 'coffee' : 'cube', 14) }),
      h('div', { class: 'dl-main' },
        h('div', { class: 'dl-top' }, h('b', { text: d.name }), h('span', { class: 'dl-target', text: d.target ? 'to ' + d.target : '' })),
        h('div', { class: 'dl-bar' }, h('i', { style: { transform: `scaleX(${d.done / d.size})` } })),
        h('div', { class: 'dl-meta mono' }, h('span', { text: meta }), h('span', { text: d.status === 'done' ? '' : pct + '%' })),
      ),
      d.status !== 'done' ? h('button', { class: 'btn icon sm dl-x', html: icon('x', 12), 'data-tip': 'cancel', onclick: () => downloads.cancel(d.id) }) : h('span', { class: 'dl-ok', html: icon('check', 13) }),
    );
    dlList.appendChild(row);
  });
}
function syncDlButton() {
  const active = downloads.active;
  const total = active.reduce((a, d) => a + d.size, 0);
  const done = active.reduce((a, d) => a + d.done, 0);
  const k = total ? done / total : 1;
  if (downloads.items.length && dlBtn.hidden) {
    dlBtn.hidden = false;
    requestAnimationFrame(() => dlBtn.classList.add('in'));
  }
  dlBtn.classList.toggle('busy', active.length > 0);
  dlBtn.querySelector('.dl-prog').style.strokeDashoffset = String(75.4 * (1 - k));
  dlBtn.querySelector('.dl-count').textContent = active.length ? String(active.length) : '';
  drawDownloads();
}
downloads.on(syncDlButton);
dlBtn.addEventListener('click', () => {
  dlList = h('div', { class: 'dl-list' });
  const box = h('div', { class: 'dl-pop' },
    h('div', { class: 'notes-head' }, h('b', { text: 'downloads' }), h('button', { class: 'link', text: 'clear finished', onclick: () => { downloads.clear(); if (!downloads.items.length) closePop(); } })),
    dlList,
    h('div', { class: 'dl-foot mono dim', text: state.oneAtATime ? 'one at a time' : `up to ${state.threads} at once` }),
  );
  drawDownloads();
  const pop = popover(dlBtn, box, { width: 360, align: 'right' });
  if (!pop) dlList = null;
});
on('oneAtATime', syncDlButton);

function notify(title, body, kind = 'game') {
  notifications.unshift({ title, body, kind, at: Date.now() });
  if (notifications.length > 30) notifications.length = 30;
  bell.classList.add('unread');
}
app.notify = notify;
initUpdates({ notify, toast });
launchHooks.needAccount = () => app.addAccount();
launchHooks.notify = (t, b) => notify(t, b, 'game');

if (host.native) {
  host.event('log', (d) => logs.push(d.text, d.lvl === 'error' ? 'error' : d.lvl === 'warn' ? 'warn' : 'info', 'launcher'));
  host.event('instance.state', (d) => {
    const inst = instances.find((i) => i.id === d.id);
    const name = inst ? inst.name : d.id;
    if (d.state === 'ready') {
      toast(name + ' is ready to play', 'everything is downloaded', 'ok');
      notify(name + ' is ready', 'finished downloading', 'update');
    }
    if (d.state === 'failed') {
      toast('could not set up ' + name, d.error || '', 'warn', 7000);
      notify('setting up ' + name + ' failed', d.error || '', 'game');
    }
  });
  host.event('autolaunch', (d) => {
    const inst = instances.find((i) => i.id === d.id);
    if (inst) setTimeout(() => launcher.launch(inst), 600);
  });
}

let current = null;
let switching = null;

const titleLogo = document.querySelector('.title-logo');
function fitLogo() {
  const t = tabs.getBoundingClientRect();
  const center = window.innerWidth / 2;
  titleLogo.classList.toggle('tight', t.right > center - 34);
}

function moveInk(instant) {
  fitLogo();
  const on = tabs.querySelector('button.on');
  ink.classList.toggle('gone', !on);
  if (!on) return;
  if (instant) ink.style.transition = 'none';
  ink.style.width = on.offsetWidth - 16 + 'px';
  ink.style.transform = `translateX(${on.offsetLeft + 8}px)`;
  if (instant) requestAnimationFrame(() => (ink.style.transition = ''));
}

function go(name, opts) {
  if (!pages[name]) return;
  closePop();
  tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.go === name));
  gear.classList.toggle('on', name === 'settings');
  moveInk();
  if (name === current) {
    if (opts) pages[name].enter(opts);
    return;
  }
  const prev = current;
  current = name;
  state.page = name;
  appEl.dataset.page = name;
  clearTimeout(switching);
  Object.values(roots).forEach((r) => r.classList.remove('leaving'));
  if (prev) {
    const out = roots[prev];
    out.classList.add('leaving');
    pages[prev].leave();
    switching = setTimeout(() => {
      out.classList.remove('active', 'leaving');
    }, 200);
  }
  const incoming = roots[name];
  setTimeout(() => {
    Object.entries(roots).forEach(([k, r]) => { if (k !== name) r.classList.remove('active'); });
    incoming.classList.add('active');
    pages[name].enter(opts);
  }, prev ? 160 : 0);
}

tabs.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
gear.addEventListener('click', () => go(current === 'settings' ? 'home' : 'settings'));
window.addEventListener('resize', () => moveInk(true));

document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || img.src.endsWith(UNKNOWN)) return;
  if (img.matches('.mod-ic, .dl-row > img')) img.src = UNKNOWN;
}, true);
bindChrome();
bindTips();

host.on('maximized', () => {
  appEl.classList.add('maxed');
  document.querySelector('.wc-max').innerHTML = icon('restore', 13);
});
host.on('restored', () => {
  appEl.classList.remove('maxed');
  document.querySelector('.wc-max').innerHTML = icon('window', 12);
});

function applyAccent(name) {
  const rgb = accents[name] || accents.lavender;
  document.documentElement.style.setProperty('--accent-rgb', rgb);
  document.querySelector('.brand-mark').innerHTML = `<img src="${moonMark()}" alt="">`;
}
applyAccent(state.accent);
on('accent', applyAccent);

function applyStars(v) {
  appEl.classList.toggle('no-stars', !v);
  sky.visible = v;
}
applyStars(state.stars);
on('stars', applyStars);


const chip = document.getElementById('running-chip');
on('running', (ids) => {
  if (ids && ids.length) {
    const inst = instances.find((i) => i.id === ids[0]);
    chip.querySelector('.rc-name').textContent = launcher.count > 1 ? `${launcher.count} games` : inst ? inst.name : ids[0];
    chip.hidden = false;
    requestAnimationFrame(() => chip.classList.add('in'));
  } else {
    chip.classList.remove('in');
    setTimeout(() => { if (!state.running.length) chip.hidden = true; }, 300);
  }
});
chip.addEventListener('click', () => launcher.show());

bell.addEventListener('click', () => {
  const list = h('div', { class: 'notes' },
    h('div', { class: 'notes-head' }, h('b', { text: 'notifications' }), h('button', { class: 'link', text: 'clear', onclick: () => { notifications.length = 0; closePop(); bell.classList.remove('unread'); } })),
    ...(notifications.length ? notifications.map((n) => h('div', { class: 'note' },
      h('span', { class: 'note-ic', html: icon(n.kind === 'update' ? 'download' : n.kind === 'mods' ? 'puzzle' : 'terminal', 14) }),
      h('div', {}, h('b', { text: n.title }), h('span', { text: n.body })),
      h('span', { class: 'note-time mono', text: n.at ? relTime(n.at).replace(' ago', '') : n.time }),
    )) : [h('div', { class: 'empty', text: 'all caught up' })]),
  );
  popover(bell, list, { width: 320, align: 'right' });
  bell.classList.remove('unread');
});
if (notifications.length) bell.classList.add('unread');

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (document.querySelector('.scrim')) return;
    if (current !== 'home') go('home');
    setTimeout(() => pages.home.focusSearch(), current === 'home' ? 0 : 260);
  }
  if (current === 'home' && state.arrowPages !== false && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest('input, textarea') && !document.querySelector('.scrim')) {
    pages.home.page(e.key === 'ArrowLeft' ? -1 : 1);
  }
  if (e.ctrlKey && /^[1-6]$/.test(e.key)) {
    e.preventDefault();
    go(['home', 'instances', 'mods', 'skins', ...((state.syncInstances || []).length ? ['sync'] : []), 'console', 'settings'][+e.key - 1]);
  }
});

document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('input, textarea')) e.preventDefault();
});

document.addEventListener('dragstart', (e) => e.preventDefault());

let revealed = false;
function revealApp() {
  if (revealed) return;
  revealed = true;
  appEl.classList.remove('booting');
  appEl.classList.add('entering');
  sky.start();
  go('home');
  requestAnimationFrame(() => moveInk(true));
  setTimeout(() => appEl.classList.remove('entering'), 1600);
}

host.on('shown', revealApp);

if (host.native) host.send('ready');
else setTimeout(revealApp, 120);
}

boot();
