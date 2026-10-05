import { h, toast } from './ui.js';
import { icon } from './icons.js';
import { instIcon } from './sprites.js';
import { AsciiMoon } from './ascii.js';
import { state, set, emit } from './state.js';
import { logs, guessLevel } from './logs.js';
import { accounts, relTime } from './data.js';
import { downloads } from './downloads.js';
import { host } from './host.js';

export function createLauncher(el, hooks = {}) {
  let moon = null;
  let clock = null;
  let focus = null;
  let seq = 0;
  const sessions = new Map();

  const pre = h('pre', { class: 'launch-cube' });
  const title = h('div', { class: 'launch-title' });
  const fill = h('div', { class: 'fill' });
  const pct = h('span', { class: 'launch-pct mono' });
  const status = h('div', { class: 'launch-status mono' });
  const log = h('div', { class: 'launch-log mono' });
  const logWrap = h('div', { class: 'launch-log-wrap' }, log);
  const logBtn = h('button', { class: 'btn ghost sm', html: icon('terminal', 13) + '<span>show log</span>' });
  const hideBtn = h('button', { class: 'btn ghost sm', html: icon('eye', 13) + '<span>back to launcher</span>' });
  const stopBtn = h('button', { class: 'btn ghost sm danger', html: icon('x', 13) + '<span>cancel</span>' });
  const timeEl = h('div', { class: 'launch-time mono' });

  el.append(
    h('div', { class: 'launch-inner' },
      pre,
      title,
      h('div', { class: 'launch-load' }, h('div', { class: 'track' }, fill)),
      h('div', { class: 'launch-row' }, status, pct),
      timeEl,
      logWrap,
      h('div', { class: 'launch-actions' }, logBtn, hideBtn, stopBtn),
    ),
  );

  const current = () => (focus ? sessions.get(focus) : null);
  const accountName = (id) => (accounts.find((a) => a.id === id) || {}).name || '';

  logBtn.addEventListener('click', () => {
    const open = el.classList.toggle('log-open');
    logBtn.innerHTML = icon('terminal', 13) + `<span>${open ? 'hide log' : 'show log'}</span>`;
    logWrap.scrollTop = logWrap.scrollHeight;
  });
  hideBtn.addEventListener('click', hide);
  stopBtn.addEventListener('click', () => {
    const s = current();
    if (!s) return hide();
    if (s.phase === 'failed') {
      sessions.delete(s.key);
      refocus();
      return;
    }
    kill(s);
  });

  function syncRunning() {
    const ids = [...new Set([...sessions.values()].filter((s) => s.phase === 'running').map((s) => s.inst.id))];
    const prev = Array.isArray(state.running) ? state.running : [];
    if (ids.length !== prev.length || ids.some((id, i) => id !== prev[i])) set('running', ids);
  }

  function progress(p, label) {
    fill.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`;
    pct.textContent = label !== undefined ? label : Math.round(p * 100) + '%';
  }

  function render() {
    const s = current();
    if (!s) return;
    title.innerHTML = '';
    const others = [...sessions.values()].filter((x) => x.inst.id === s.inst.id);
    const tag = s.alt || others.length > 1 ? (accountName(s.account) || 'alt') : '';
    title.append(
      h('img', { src: instIcon(s.inst, 4), alt: '' }),
      h('b', { text: s.inst.name }),
      h('span', { class: 'dim', text: `${s.inst.version} ${s.inst.loader}` + (tag ? `, ${tag}` : '') }),
    );
    el.classList.toggle('running', s.phase === 'running');
    el.classList.toggle('done', s.phase === 'running');
    el.classList.toggle('failed', s.phase === 'failed');
    status.textContent = s.status;
    progress(s.progress, s.progressLabel);
    stopBtn.innerHTML = s.phase === 'running' ? icon('stop', 12) + '<span>stop game</span>' : s.phase === 'failed' ? icon('x', 13) + '<span>close</span>' : icon('x', 13) + '<span>cancel</span>';
    log.innerHTML = '';
    s.lines.forEach(([text, lvl]) => log.appendChild(h('div', { class: 'log-' + lvl, text })));
    if (el.classList.contains('log-open')) logWrap.scrollTop = logWrap.scrollHeight;
    if (!moon) moon = new AsciiMoon(pre);
    moon.speed = s.phase === 'running' ? 0.6 : 1.6;
    moon.render();
    tick();
  }

  function overlayLine(s, text, lvl) {
    s.lines.push([text, lvl]);
    if (s.lines.length > 250) s.lines.shift();
    if (s.key !== focus) return;
    log.appendChild(h('div', { class: 'log-' + lvl, text }));
    while (log.children.length > 250) log.firstChild.remove();
    if (el.classList.contains('log-open')) logWrap.scrollTop = logWrap.scrollHeight;
  }

  function line(s, text, lvl = 'info', src = 'launcher') {
    logs.push(text, lvl, src);
    overlayLine(s, text, lvl);
  }

  function update(s, fields) {
    Object.assign(s, fields);
    if (s.key === focus) {
      if ('status' in fields) status.textContent = s.status;
      if ('progress' in fields || 'progressLabel' in fields) progress(s.progress, s.progressLabel);
    }
  }

  function show(instId) {
    if (instId) {
      const match = [...sessions.values()].filter((s) => s.inst.id === instId);
      if (match.length && !match.some((s) => s.key === focus)) focus = match[match.length - 1].key;
    }
    if (!current()) {
      const any = [...sessions.values()].pop();
      if (!any) return;
      focus = any.key;
    }
    render();
    el.classList.add('open');
    if (moon) moon.start();
  }

  function hide() {
    el.classList.remove('open');
    if (moon) setTimeout(() => !el.classList.contains('open') && moon && moon.stop(), 500);
  }

  function refocus() {
    const next = [...sessions.values()].reverse().find((s) => s.phase === 'running') || [...sessions.values()].pop();
    focus = next ? next.key : null;
    if (!next) hide();
    else if (el.classList.contains('open')) render();
  }

  function pickAlt(target) {
    const busy = new Set([...sessions.values()].filter((s) => s.inst.id === target.id).map((s) => s.account));
    const free = accounts.filter((a) => !busy.has(a.id));
    return (free.find((a) => a.id !== state.account) || free[0] || accounts.find((a) => a.id === state.account) || accounts[0] || {}).id;
  }

  function altLabel(target) {
    const id = pickAlt(target);
    const busy = [...sessions.values()].some((s) => s.inst.id === target.id && s.account === id);
    return { name: accountName(id), same: busy || id === state.account };
  }

  function launch(target, opts = {}) {
    const existing = [...sessions.values()].filter((s) => s.inst.id === target.id && s.phase !== 'failed');
    if (!opts.alt && existing.length) {
      focus = existing[existing.length - 1].key;
      show();
      return;
    }
    if (host.native && !accounts.length) {
      toast('add an account first', 'sign in with microsoft to play', 'warn');
      if (hooks.needAccount) hooks.needAccount();
      return;
    }
    [...sessions.values()].filter((s) => s.inst.id === target.id && s.phase === 'failed').forEach((s) => sessions.delete(s.key));
    const account = opts.alt ? pickAlt(target) : state.account;
    if (opts.alt && existing.some((s) => s.account === account)) toast('launching with the same account', 'add another account to play an alt, servers kick duplicate logins', 'warn', 5200);
    const key = target.id + ':' + Date.now().toString(36) + (++seq);
    const s = { key, inst: target, account, alt: !!opts.alt, phase: 'loading', status: 'starting...', progress: 0, progressLabel: '', lines: [], started: 0 };
    sessions.set(key, s);
    focus = key;
    el.classList.remove('log-open');
    logBtn.innerHTML = icon('terminal', 13) + '<span>show log</span>';
    show();
    if (!host.native) {
      demo(s);
      return;
    }
    host.call('game.launch', { id: target.id, session: key, account, world: opts.world || null, server: opts.server || null })
      .catch((err) => fail(s, err.message));
  }

  function fail(s, message) {
    update(s, { phase: 'failed', status: message, progress: 0, progressLabel: '' });
    syncRunning();
    if (s.key === focus) render();
    line(s, message, 'error');
    toast('could not start ' + s.inst.name, message, 'warn', 6000);
  }

  function running(s, pid) {
    update(s, { phase: 'running', status: 'running', progress: 1, progressLabel: pid ? 'pid ' + pid : '', started: Date.now() });
    s.inst.lastPlayed = Date.now();
    s.inst.last = 'just now';
    syncRunning();
    if (s.key === focus) render();
    clearInterval(clock);
    clock = setInterval(tick, 1000);
    setTimeout(() => {
      if (s.phase !== 'running' || !sessions.has(s.key)) return;
      if (s.key === focus) hide();
      if (state.onStart !== 'keep') host.send('dock');
    }, 1800);
  }

  function tick() {
    const s = current();
    const live = s && s.phase === 'running' ? s : [...sessions.values()].find((x) => x.phase === 'running');
    if (!live) {
      timeEl.textContent = '';
      return;
    }
    const sec = Math.floor((Date.now() - live.started) / 1000);
    const txt = [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map((n) => String(n).padStart(2, '0')).join(':');
    timeEl.textContent = s && s.phase === 'running' ? 'session ' + txt : '';
    const chip = document.getElementById('running-chip');
    if (chip) {
      const count = [...sessions.values()].filter((x) => x.phase === 'running').length;
      chip.querySelector('.rc-time').textContent = txt;
      chip.querySelector('.rc-name').textContent = count > 1 ? `${count} games` : live.inst.name;
    }
  }

  function finish(s, d) {
    const wasRunning = s.phase === 'running';
    if (d.failed) {
      fail(s, d.error || 'the game could not start');
      return;
    }
    sessions.delete(s.key);
    syncRunning();
    if (![...sessions.values()].some((x) => x.phase === 'running')) {
      clearInterval(clock);
      if (state.onStart !== 'keep') host.send('undock');
    }
    if (s.key === focus) refocus();
    if (d.cancelled) {
      toast('launch cancelled', s.inst.name, 'warn');
      return;
    }
    const name = s.inst.name;
    s.inst.playtimeSec = (s.inst.playtimeSec || 0) + (d.played || 0);
    s.inst.playtime = s.inst.playtimeSec / 3600;
    s.inst.lastPlayed = Date.now();
    s.inst.last = relTime(s.inst.lastPlayed);
    const sec = d.played || 0;
    const played = sec < 60 ? sec + 's' : sec < 3600 ? Math.round(sec / 60) + 'm' : (sec / 3600).toFixed(1) + 'h';
    if (d.crash) {
      const c = d.crash;
      emit('crash', { instance: name, code: d.code, mod: c.mod || 'unknown', modId: c.modId || c.mod || '', file: c.file || 'no crash report', reason: c.reason || c.description || 'the game closed with an error', report: c.report });
      toast(name + ' crashed', c.mod ? 'caused by ' + c.mod + ', see console' : 'see the console for details', 'warn', 6500);
      if (hooks.notify) hooks.notify(name + ' crashed', c.mod ? 'caused by ' + c.mod : 'exit code ' + d.code);
    } else if (wasRunning || d.code !== undefined) {
      toast(name + ' closed', `played ${played}`, 'ok');
    }
    emit('mods');
  }

  const find = (d) => sessions.get(d.session) || (!d.session ? [...sessions.values()].find((s) => s.inst.id === d.id) : null);

  if (host.native) {
    host.event('game.state', (d) => {
      const s = find(d);
      if (!s) return;
      if (d.state === 'running') running(s, d.pid);
      else update(s, { status: d.step + '...' });
    });
    host.event('game.log', (d) => {
      const s = find(d);
      (d.lines || []).forEach((l) => {
        const lvl = guessLevel(l);
        logs.push(l, lvl, 'game');
        if (s) overlayLine(s, l, lvl);
      });
    });
    host.event('game.exit', (d) => {
      const s = find(d);
      if (s) finish(s, d);
    });
    downloads.on((items) => {
      sessions.forEach((s) => {
        if (s.phase !== 'loading') return;
        const mine = items.filter((x) => x.target === s.inst.name && x.status === 'downloading');
        if (!mine.length) return;
        const total = mine.reduce((a, x) => a + x.size, 0);
        const done = mine.reduce((a, x) => a + x.done, 0);
        update(s, { progress: done / total, progressLabel: `${Math.round(done)} / ${Math.round(total)} mb`, status: 'downloading ' + mine.map((x) => x.name).join(', ') });
      });
    });
  }

  function kill(s) {
    if (!host.native) {
      (s.timers || []).forEach(clearTimeout);
      finish(s, { id: s.inst.id, session: s.key, code: 0, played: s.started ? Math.floor((Date.now() - s.started) / 1000) : 0, cancelled: s.phase !== 'running' });
      return;
    }
    host.call('game.kill', { id: s.inst.id, session: s.key }).catch(() => {});
  }

  function stop(instId) {
    const s = instId ? [...sessions.values()].reverse().find((x) => x.inst.id === instId) : current();
    if (s) kill(s);
  }

  function demo(s) {
    s.timers = [];
    const steps = ['checking game files', 'downloading libraries', 'preparing natives', 'signing in'];
    steps.forEach((step, i) => s.timers.push(setTimeout(() => {
      update(s, { status: step + '...', progress: (i + 1) / (steps.length + 1), progressLabel: undefined });
      line(s, step, 'info');
    }, 400 + i * 500)));
    s.timers.push(setTimeout(() => {
      line(s, '[Render thread/INFO]: Setting user: ' + (accountName(s.account) || 'player'), 'info', 'game');
      running(s, 0);
    }, 400 + steps.length * 500));
  }

  return {
    launch,
    show,
    hide,
    stop,
    altLabel,
    get phase() { const s = current(); return s ? s.phase : 'idle'; },
    get instance() { const s = current(); return s ? s.inst : null; },
    get started() { const s = current(); return s ? s.started : 0; },
    get count() { return [...sessions.values()].filter((s) => s.phase === 'running').length; },
  };
}
