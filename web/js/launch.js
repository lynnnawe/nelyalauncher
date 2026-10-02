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
  let started = 0;
  let inst = null;
  let phase = 'idle';
  let demoTimers = [];

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

  logBtn.addEventListener('click', () => {
    const open = el.classList.toggle('log-open');
    logBtn.innerHTML = icon('terminal', 13) + `<span>${open ? 'hide log' : 'show log'}</span>`;
    logWrap.scrollTop = logWrap.scrollHeight;
  });
  hideBtn.addEventListener('click', hide);
  stopBtn.addEventListener('click', () => {
    if (phase === 'failed') {
      phase = 'idle';
      hide();
      return;
    }
    if (phase === 'running') stop();
    else cancel();
  });

  function overlayLine(text, lvl) {
    log.appendChild(h('div', { class: 'log-' + lvl, text }));
    while (log.children.length > 250) log.firstChild.remove();
    if (el.classList.contains('log-open')) logWrap.scrollTop = logWrap.scrollHeight;
  }

  function line(text, lvl = 'info', src = 'launcher') {
    logs.push(text, lvl, src);
    overlayLine(text, lvl);
  }

  function progress(p, label) {
    fill.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`;
    pct.textContent = label !== undefined ? label : Math.round(p * 100) + '%';
  }

  function show() {
    el.classList.add('open');
    if (moon) moon.start();
  }

  function hide() {
    el.classList.remove('open');
    if (moon) setTimeout(() => !el.classList.contains('open') && moon && moon.stop(), 500);
  }

  function reset(target) {
    inst = target;
    log.innerHTML = '';
    el.classList.remove('running', 'done', 'failed');
    stopBtn.innerHTML = icon('x', 13) + '<span>cancel</span>';
    timeEl.textContent = '';
    title.innerHTML = '';
    title.append(h('img', { src: instIcon(inst, 4), alt: '' }), h('b', { text: inst.name }), h('span', { class: 'dim', text: `${inst.version} ${inst.loader}` }));
    if (!moon) moon = new AsciiMoon(pre);
    moon.speed = 1.6;
    moon.render();
    progress(0, '');
  }

  function launch(target, opts = {}) {
    if (state.running && state.running !== target.id) {
      toast('already running', `${state.running} is still open`, 'warn');
      show();
      return;
    }
    if (state.running === target.id || (phase === 'loading' && inst && inst.id === target.id)) {
      show();
      return;
    }
    if (host.native && !accounts.length) {
      toast('add an account first', 'sign in with microsoft to play', 'warn');
      if (hooks.needAccount) hooks.needAccount();
      return;
    }
    reset(target);
    phase = 'loading';
    el.classList.remove('log-open');
    logBtn.innerHTML = icon('terminal', 13) + '<span>show log</span>';
    status.textContent = 'starting...';
    show();
    if (!host.native) {
      demo(opts);
      return;
    }
    host.call('game.launch', { id: target.id, account: state.account, world: opts.world || null, server: opts.server || null })
      .catch((err) => fail(err.message));
  }

  function fail(message) {
    phase = 'failed';
    el.classList.add('failed');
    status.textContent = message;
    progress(0, '');
    stopBtn.innerHTML = icon('x', 13) + '<span>close</span>';
    line(message, 'error');
    toast('could not start ' + (inst ? inst.name : 'the game'), message, 'warn', 6000);
  }

  function running(pid) {
    phase = 'running';
    set('running', inst.id);
    el.classList.add('running', 'done');
    status.textContent = 'running';
    progress(1, pid ? 'pid ' + pid : '');
    stopBtn.innerHTML = icon('stop', 12) + '<span>stop game</span>';
    if (moon) moon.speed = 0.6;
    started = Date.now();
    inst.lastPlayed = Date.now();
    inst.last = 'just now';
    tick();
    clearInterval(clock);
    clock = setInterval(tick, 1000);
    setTimeout(() => {
      if (phase !== 'running') return;
      hide();
      if (state.onStart !== 'keep') host.send('dock');
    }, 1800);
  }

  function tick() {
    const s = Math.floor((Date.now() - started) / 1000);
    const txt = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
    timeEl.textContent = 'session ' + txt;
    const chip = document.getElementById('running-chip');
    if (chip) chip.querySelector('.rc-time').textContent = txt;
  }

  function finish(d) {
    clearInterval(clock);
    if (state.onStart !== 'keep') host.send('undock');
    const wasRunning = phase === 'running';
    phase = 'idle';
    if (d.failed) {
      fail(d.error || 'the game could not start');
      return;
    }
    if (d.cancelled) {
      hide();
      toast('launch cancelled', inst ? inst.name : '', 'warn');
      return;
    }
    hide();
    const name = inst ? inst.name : d.id;
    if (inst) {
      inst.playtimeSec = (inst.playtimeSec || 0) + (d.played || 0);
      inst.playtime = inst.playtimeSec / 3600;
      inst.lastPlayed = Date.now();
      inst.last = relTime(inst.lastPlayed);
    }
    set('running', null);
    const s = d.played || 0;
    const played = s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : (s / 3600).toFixed(1) + 'h';
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

  if (host.native) {
    host.event('game.state', (d) => {
      if (!inst || d.id !== inst.id) return;
      if (d.state === 'running') {
        running(d.pid);
        return;
      }
      status.textContent = d.step + '...';
    });
    host.event('game.log', (d) => {
      (d.lines || []).forEach((l) => {
        const lvl = guessLevel(l);
        logs.push(l, lvl, 'game');
        if (inst && d.id === inst.id) overlayLine(l, lvl);
      });
    });
    host.event('game.exit', (d) => {
      if (!inst || d.id !== inst.id) return;
      finish(d);
    });
    downloads.on((items) => {
      if (phase !== 'loading' || !inst) return;
      const mine = items.filter((x) => x.target === inst.name && x.status === 'downloading');
      if (!mine.length) return;
      const total = mine.reduce((a, x) => a + x.size, 0);
      const done = mine.reduce((a, x) => a + x.done, 0);
      progress(done / total, `${Math.round(done)} / ${Math.round(total)} mb`);
      status.textContent = 'downloading ' + mine.map((x) => x.name).join(', ');
    });
  }

  function stop() {
    if (!inst) return;
    if (!host.native) {
      demoTimers.forEach(clearTimeout);
      finish({ id: inst.id, code: 0, played: Math.floor((Date.now() - started) / 1000) });
      return;
    }
    host.call('game.kill', { id: inst.id }).catch(() => {});
  }

  function cancel() {
    if (!inst) return;
    if (!host.native) {
      demoTimers.forEach(clearTimeout);
      phase = 'idle';
      hide();
      toast('launch cancelled', inst.name, 'warn');
      return;
    }
    host.call('game.kill', { id: inst.id }).catch(() => {});
  }

  function demo() {
    demoTimers.forEach(clearTimeout);
    demoTimers = [];
    const steps = ['checking game files', 'downloading libraries', 'preparing natives', 'signing in'];
    steps.forEach((s, i) => demoTimers.push(setTimeout(() => {
      status.textContent = s + '...';
      progress((i + 1) / (steps.length + 1));
      line(s, 'info');
    }, 400 + i * 500)));
    demoTimers.push(setTimeout(() => {
      line('[Render thread/INFO]: Setting user: ' + ((accounts.find((a) => a.id === state.account) || accounts[0] || {}).name || 'player'), 'info', 'game');
      running(0);
    }, 400 + steps.length * 500));
  }

  return { launch, show, hide, stop, get phase() { return phase; }, get instance() { return inst; }, get started() { return started; } };
}
