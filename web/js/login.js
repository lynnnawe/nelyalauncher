import { h, toast } from './ui.js';
import { icon } from './icons.js';
import { host } from './host.js';
import { accounts } from './data.js';
import { registerSkin, normalizeSkin, setFace } from './skin.js';
import { set } from './state.js';

const STORE = 'nelya-accounts';

function save() {
  try {
    const keep = accounts.filter((a) => a.saved).map((a) => ({ id: a.id, name: a.name, skin: a.skin, url: a.url, slim: a.slim, cape: a.cape }));
    localStorage.setItem(STORE, JSON.stringify(keep));
  } catch {}
}

export function adoptAccount(raw) {
  const key = 'account:' + raw.id;
  if (raw.skin) registerSkin(key, raw.skin, { slim: !!raw.slim });
  return { ...raw, skin: raw.skin ? key : 'classic', skinData: raw.skin };
}

export function restoreAccounts() {
  if (host.native) return;
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(STORE) || '[]');
  } catch {}
  list.forEach((a) => {
    if (accounts.some((x) => x.id === a.id)) return;
    if (a.url) registerSkin(a.skin, a.url, { slim: a.slim, cape: a.cape });
    accounts.push({ ...a, type: 'microsoft', saved: true });
  });
}

export function removeAccount(id) {
  const i = accounts.findIndex((a) => a.id === id);
  if (i < 0) return;
  accounts.splice(i, 1);
  if (host.native) host.call('accounts.remove', { id }).catch(() => {});
  else save();
}

const STEPS = [
  { id: 'microsoft', label: 'sign in with microsoft', sub: 'in the window that just opened' },
  { id: 'xbox', label: 'xbox live', sub: 'linking your microsoft account' },
  { id: 'minecraft', label: 'minecraft services', sub: 'getting a game token' },
  { id: 'profile', label: 'your profile', sub: 'checking you own java edition' },
];

export function createLogin(el) {
  let busy = false;
  let waiting = null;
  let codeUrl = '';
  let lastStep = 'microsoft';
  const list = h('div', { class: 'login-steps' });
  const done = h('div', { class: 'login-done' });
  const err = h('div', { class: 'login-err' });
  const codeText = h('span', { class: 'lc-code mono' });
  const copyBtn = h('button', { class: 'btn ghost sm', html: icon('copy', 13) + '<span>copy</span>' });
  const openBtn = h('button', { class: 'btn ghost sm', html: icon('external', 13) + '<span>open microsoft.com/link</span>' });
  const codeBox = h('div', { class: 'login-code' },
    h('span', { class: 'lc-label mono dim', text: 'your code' }),
    codeText,
    h('div', { class: 'lc-actions' }, copyBtn, openBtn),
    h('div', { class: 'lc-wait mono dim' }, h('span', { class: 'spinner' }), h('span', { text: 'waiting for you to sign in' })),
  );
  const startBtn = h('button', { class: 'btn primary login-go', html: icon('user', 15) + '<span>sign in with microsoft</span>' });
  const codeLink = h('button', { class: 'login-alt', text: 'or use a code in your browser instead' });
  const closeBtn = h('button', { class: 'btn icon login-x', html: icon('x', 16) });
  const card = h('div', { class: 'login-card' },
    closeBtn,
    h('div', { class: 'login-mark' }),
    h('h2', { text: 'add a minecraft account' }),
    h('p', { class: 'login-lead', text: 'sign in with the microsoft account that owns minecraft java edition. the sign in page opens in a nelya window, not your browser.' }),
    codeBox,
    list,
    err,
    done,
    startBtn,
    codeLink,
    h('div', { class: 'login-fine mono', text: 'you sign in on microsoft’s own page, nelya never sees your password.' }),
  );
  el.appendChild(h('div', { class: 'login-scrim' }, card));

  function drawSteps(active, failed) {
    list.innerHTML = '';
    const at = active === 'done' ? STEPS.length : STEPS.findIndex((s) => s.id === active);
    STEPS.forEach((s, i) => {
      const st = failed && i === at ? 'bad' : i < at ? 'ok' : i === at ? 'now' : '';
      list.appendChild(h('div', { class: 'login-step ' + st },
        h('span', { class: 'ls-dot', html: st === 'ok' ? icon('check', 11) : st === 'bad' ? icon('x', 11) : '' }),
        h('div', {}, h('b', { text: s.label }), h('span', { text: s.sub })),
      ));
    });
  }

  function open() {
    reset();
    el.classList.add('open');
  }

  function close() {
    if (waiting && el.classList.contains('coding')) {
      host.call('accounts.device.cancel').catch(() => {});
      const w = waiting;
      waiting = null;
      w({ ok: false, cancelled: true });
    } else if (busy) return;
    el.classList.remove('open');
  }

  function reset() {
    busy = false;
    el.classList.remove('working', 'success', 'failed', 'coding');
    err.textContent = '';
    done.innerHTML = '';
    startBtn.disabled = false;
    startBtn.hidden = false;
    startBtn.onclick = null;
    codeLink.hidden = false;
    codeLink.dataset.mode = 'code';
    codeLink.textContent = 'or use a code in your browser instead';
    startBtn.innerHTML = icon('user', 15) + '<span>sign in with microsoft</span>';
    drawSteps(null);
  }

  host.event('login.step', (d) => {
    if (!busy) return;
    lastStep = d.step;
    el.classList.remove('coding');
    drawSteps(d.step);
  });
  host.event('login.done', (d) => {
    if (!waiting) return;
    const w = waiting;
    waiting = null;
    w(d);
  });

  function openLink() {
    host.call('open.link', { url: codeUrl }).catch(() => {});
  }

  copyBtn.addEventListener('click', () => {
    host.send('clip:text', codeText.textContent);
    copyBtn.innerHTML = icon('check', 13) + '<span>copied</span>';
    setTimeout(() => (copyBtn.innerHTML = icon('copy', 13) + '<span>copy</span>'), 1500);
  });
  openBtn.addEventListener('click', openLink);
  codeText.addEventListener('click', () => copyBtn.click());

  async function start(useCode) {
    if (busy) return;
    if (!host.native) {
      err.textContent = 'sign in only works inside the nelya app';
      el.classList.add('failed');
      return;
    }
    busy = true;
    lastStep = 'microsoft';
    el.classList.remove('failed', 'success');
    el.classList.add('working');
    err.textContent = '';
    startBtn.disabled = true;
    codeLink.hidden = true;
    drawSteps('microsoft');
    let res;
    if (!useCode) {
      startBtn.innerHTML = '<span class="spinner"></span><span>waiting for microsoft</span>';
      res = await new Promise((resolve) => {
        waiting = resolve;
        host.send('ms:login');
      });
    } else try {
      startBtn.innerHTML = '<span class="spinner"></span><span>getting a code</span>';
      const dev = await host.call('accounts.device');
      codeText.textContent = dev.code;
      codeUrl = (dev.url || 'https://www.microsoft.com/link') + '?otc=' + encodeURIComponent(dev.code);
      el.classList.add('coding');
      startBtn.hidden = true;
      host.send('clip:text', dev.code);
      openLink();
      res = await new Promise((resolve) => (waiting = resolve));
    } catch (e) {
      res = { ok: false, error: e.message };
    }
    busy = false;
    el.classList.remove('working', 'coding');
    startBtn.hidden = false;
    codeLink.hidden = false;
    if (res.cancelled) return;
    if (!res.ok) {
      drawSteps(lastStep, true);
      el.classList.add('failed');
      err.textContent = res.error || 'something went wrong';
      startBtn.disabled = false;
      startBtn.innerHTML = icon('refresh', 14) + '<span>try again</span>';
      if (useCode) codeLink.textContent = 'or sign in with a nelya window instead';
      codeLink.dataset.mode = useCode ? 'window' : 'code';
      return;
    }
    const raw = res.account || {};
    if (raw.skin) {
      try {
        raw.skin = await normalizeSkin(raw.skin);
      } catch {}
    }
    const acc = adoptAccount(raw);
    const at = accounts.findIndex((a) => a.id === acc.id);
    if (at >= 0) accounts[at] = acc;
    else accounts.push(acc);
    drawSteps('done');
    el.classList.add('success');
    const face = h('img', { alt: '' });
    setFace(face, acc.skin, 48);
    done.innerHTML = '';
    done.append(face, h('div', {}, h('b', { text: acc.name }), h('span', { class: 'mono dim', text: 'signed in, java edition' })));
    startBtn.disabled = false;
    startBtn.innerHTML = icon('check', 14) + '<span>done</span>';
    set('account', acc.id);
    toast('signed in as ' + acc.name, 'account added', 'ok');
    startBtn.onclick = () => {
      startBtn.onclick = null;
      close();
    };
  }

  startBtn.addEventListener('click', () => {
    if (el.classList.contains('success')) return;
    start(codeLink.dataset.mode === 'window');
  });
  codeLink.addEventListener('click', () => start(codeLink.dataset.mode !== 'window'));
  closeBtn.addEventListener('click', close);
  el.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('login-scrim')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.classList.contains('open')) close();
  });

  return { open, close };
}
