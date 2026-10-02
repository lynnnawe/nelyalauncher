import { state } from './state.js';
import { host } from './host.js';

const items = [];
const subs = new Set();
let seq = 0;
let timer = null;

function notify() {
  subs.forEach((fn) => fn(items));
}

function tick() {
  const dt = 0.12;
  const limit = state.oneAtATime ? 1 : Math.max(1, state.threads || 6);
  let active = items.filter((d) => d.status === 'downloading');
  for (const d of items) {
    if (active.length >= limit) break;
    if (d.status !== 'queued') continue;
    d.status = 'downloading';
    d.started = performance.now();
    active.push(d);
  }
  const share = active.length ? 1 / Math.sqrt(active.length) : 1;
  active.forEach((d) => {
    const target = (9 + Math.random() * 22) * share;
    d.speed += (target - d.speed) * 0.35;
    d.done = Math.min(d.size, d.done + d.speed * dt);
    if (d.done >= d.size) {
      d.status = 'done';
      d.speed = 0;
      d.finished = Date.now();
      d.resolve(d);
    }
  });
  notify();
  if (!items.some((d) => d.status === 'queued' || d.status === 'downloading')) {
    clearInterval(timer);
    timer = null;
  }
}

const MB = 1048576;

if (host.native) {
  host.event('download.add', (d) => {
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    items.unshift({ id: d.id, name: d.name, size: Math.max(0.01, (d.size || 0) / MB), done: 0, speed: 0, target: d.target, kind: d.kind, icon: d.icon, status: 'downloading', resolve, promise, added: Date.now() });
    if (items.length > 60) items.splice(60);
    notify();
  });
  host.event('download.progress', (d) => {
    const item = items.find((x) => x.id === d.id);
    if (!item) return;
    item.done = (d.done || 0) / MB;
    item.size = Math.max(item.done, (d.size || 0) / MB, 0.01);
    item.speed = d.speed || 0;
    notify();
  });
  host.event('download.done', (d) => {
    const item = items.find((x) => x.id === d.id);
    if (!item) return;
    if (d.ok) {
      item.status = 'done';
      item.done = item.size;
      item.speed = 0;
    } else {
      item.status = d.cancelled ? 'cancelled' : 'failed';
      item.error = d.error;
      if (d.cancelled) items.splice(items.indexOf(item), 1);
    }
    item.resolve(item);
    notify();
  });
}

export const downloads = {
  items,
  add({ name, size, target = '', kind = 'mod', icon = null }) {
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    const d = { id: ++seq, name, size: Math.max(0.05, size), done: 0, speed: 0, target, kind, icon, status: 'queued', resolve, promise, added: Date.now() };
    items.unshift(d);
    if (!timer) timer = setInterval(tick, 120);
    notify();
    return d;
  },
  clear() {
    for (let i = items.length - 1; i >= 0; i--) if (items[i].status === 'done' || items[i].status === 'failed') items.splice(i, 1);
    notify();
  },
  cancel(id) {
    if (host.native) {
      host.call('downloads.cancel', { id }).catch(() => {});
      return;
    }
    const d = items.find((x) => x.id === id);
    if (!d || d.status === 'done') return;
    d.status = 'cancelled';
    d.resolve(d);
    items.splice(items.indexOf(d), 1);
    notify();
  },
  get active() {
    return items.filter((d) => d.status === 'queued' || d.status === 'downloading');
  },
  on(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};
