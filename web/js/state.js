import { host } from './host.js';

const saved = host.native ? {} : (() => {
  try {
    return JSON.parse(localStorage.getItem('nelya') || '{}');
  } catch {
    return {};
  }
})();

export const state = Object.assign(
  {
    selected: 'survival',
    account: 'alex',
    accent: 'lavender',
    motion: true,
    stars: true,
    cat: true,
    globeDetail: 'high',
    memory: 6,
    pinned: ['survival'],
    threads: 6,
    oneAtATime: false,
    syncInstances: [],
    autoDeps: true,
    showDownloads: false,
    autoUpdate: true,
    onStart: 'dock',
    wheelPages: true,
    arrowPages: true,
    startWithWindows: false,
    splash: true,
    running: [],
    page: 'home',
  },
  saved,
  { running: [], page: 'home' },
);

const subs = new Map();

export function on(key, fn) {
  if (!subs.has(key)) subs.set(key, []);
  subs.get(key).push(fn);
}

let saveTimer = null;

function persist() {
  const { running, page, ...keep } = state;
  if (host.native) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => host.call('settings.save', { settings: keep }).catch(() => {}), 250);
    return;
  }
  try {
    localStorage.setItem('nelya', JSON.stringify(keep));
  } catch {}
}

export function hydrate(settings) {
  if (!settings || typeof settings !== 'object') return;
  Object.entries(settings).forEach(([k, v]) => {
    if (k === 'running' || k === 'page') return;
    state[k] = v;
  });
}

export function set(key, value) {
  state[key] = value;
  (subs.get(key) || []).forEach((fn) => fn(value));
  persist();
}

export function emit(key, value) {
  (subs.get(key) || []).forEach((fn) => fn(value));
}

export const accents = {
  lavender: '157,140,240',
  rose: '226,140,170',
  sage: '146,192,152',
  sand: '216,182,132',
  ice: '134,180,232',
  mono: '222,221,230',
};

export function ordered(list) {
  const pins = state.pinned || [];
  return [...list.filter((i) => pins.includes(i.id)), ...list.filter((i) => !pins.includes(i.id))];
}

export function isPinned(id) {
  return (state.pinned || []).includes(id);
}

export function togglePin(id) {
  const pins = new Set(state.pinned || []);
  if (pins.has(id)) pins.delete(id);
  else pins.add(id);
  set('pinned', [...pins]);
  return pins.has(id);
}

export const isRunning = (id) => Array.isArray(state.running) && state.running.includes(id);
