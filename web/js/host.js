const wv = window.chrome && window.chrome.webview;
const listeners = new Map();
const pending = new Map();
const calls = new Map();
const events = new Map();
let seq = 0;

if (wv) {
  wv.addEventListener('message', (e) => {
    const data = e.data || {};
    if (data.type === 'reply') {
      const c = calls.get(data.id);
      if (!c) return;
      calls.delete(data.id);
      if (data.ok) c.resolve(data.data);
      else c.reject(new Error(data.error || 'something went wrong'));
      return;
    }
    if (data.type === 'event') {
      (events.get(data.name) || []).forEach((fn) => {
        try {
          fn(data.data);
        } catch (err) {
          console.error(err);
        }
      });
      return;
    }
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
      return;
    }
    (listeners.get(data.type) || []).forEach((fn) => fn(data));
  });
}

export const host = {
  native: !!wv,
  send(type, value) {
    if (!wv) return;
    wv.postMessage(value === undefined ? { type } : { type, value: String(value) });
  },
  on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  },
  request(type, value, ms = 20000) {
    return new Promise((resolve) => {
      if (!wv) { resolve(null); return; }
      const id = 'r' + ++seq;
      pending.set(id, resolve);
      wv.postMessage({ type, value: id + '|' + value });
      setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        resolve({ ok: false, error: 'no answer from mojang' });
      }, ms);
    });
  },
  call(method, args = {}) {
    if (!wv) return Promise.reject(new Error('only works inside the nelya app'));
    const id = 'c' + ++seq;
    return new Promise((resolve, reject) => {
      calls.set(id, { resolve, reject });
      wv.postMessage({ type: 'call', id, method, args });
    });
  },
  event(name, fn) {
    if (!events.has(name)) events.set(name, []);
    events.get(name).push(fn);
  },
  emit(type) {
    (listeners.get(type) || []).forEach((fn) => fn({ type }));
  },
};

const interactive = 'button, a, input, textarea, select, label, [data-nodrag], [role="button"]';

export function bindChrome(root = document) {
  root.querySelectorAll('[data-drag]').forEach((el) => {
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target.closest(interactive)) return;
      host.send('drag', (e.clientX / window.innerWidth).toFixed(3));
    });
    if (el.hasAttribute('data-maxonclick')) {
      el.addEventListener('dblclick', (e) => {
        if (e.target.closest(interactive)) return;
        host.send('maximize');
      });
    }
  });

  root.querySelectorAll('[data-edge]').forEach((el) => {
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      host.send('resize', el.dataset.edge);
    });
  });

  root.querySelectorAll('[data-window]').forEach((el) => {
    el.addEventListener('click', () => host.send(el.dataset.window));
  });
}
