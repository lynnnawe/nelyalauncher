import { h, toast } from './ui.js';
import { icon } from './icons.js';
import { modIcon } from './sprites.js';
import { logs } from './logs.js';
import { state, on } from './state.js';
import { host } from './host.js';

function esc(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function mountConsole(root, app) {
  let follow = true;
  let unseen = 0;
  let crashed = null;

  const statusDot = h('span', { class: 'con-dot' });
  const statusText = h('span', { class: 'con-state-text' });
  const statusTime = h('span', { class: 'con-state-time mono' });
  const status = h('div', { class: 'con-state' }, statusDot, statusText, statusTime);

  const logEl = h('div', { class: 'con-log mono' });
  const jump = h('button', { class: 'con-jump', html: icon('chevron', 14) + '<span class="con-jump-n"></span>' });
  const crashCard = h('div', { class: 'crash' });

  const head = h('div', { class: 'con-head rv' },
    h('h2', { text: 'console' }),
    status,
    h('span', { class: 'grow' }),
    h('button', { class: 'btn ghost sm', html: icon('copy', 13) + '<span>copy log</span>', onclick: copyLog }),
    h('button', { class: 'btn ghost sm', html: icon('folder', 13) + '<span>log folder</span>', onclick: openFolder }),
  );

  const body = h('div', { class: 'con-body rv' }, logEl, jump, crashCard);
  root.append(h('div', { class: 'con-wrap' }, head, body));

  function text() {
    return logs.lines.map((e) => `[${e.t}] ${e.text}`).join('\r\n');
  }

  function copyLog() {
    if (host.native) host.send('log:copy', text());
    else {
      try { navigator.clipboard.writeText(text()); } catch {}
    }
    toast('copied latest.log', 'paste it anywhere as a file', 'ok');
  }

  function openFolder() {
    if (host.native) host.send('log:open', text());
    else toast('opened folder', '%appdata%/.nelya/logs');
  }

  function row(e, fresh) {
    return h('div', { class: `con-line l-${e.lvl}${fresh ? ' fresh' : ''}`, html: `<span class="ts">${e.t}</span><span class="tx">${esc(e.text)}</span>` });
  }

  function render() {
    logEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    logs.lines.slice(-800).forEach((e) => frag.appendChild(row(e, false)));
    logEl.appendChild(frag);
    if (!logs.lines.length) logEl.appendChild(h('div', { class: 'con-empty', text: 'nothing here yet' }));
    toBottom();
  }

  function toBottom() {
    logEl.scrollTop = logEl.scrollHeight;
    unseen = 0;
    jump.classList.remove('in');
  }

  logs.on((e) => {
    if (e === null) { render(); return; }
    const empty = logEl.querySelector('.con-empty');
    if (empty) empty.remove();
    logEl.appendChild(row(e, true));
    while (logEl.children.length > 800) logEl.firstChild.remove();
    if (follow) toBottom();
    else {
      unseen++;
      jump.querySelector('.con-jump-n').textContent = unseen + ' new';
      jump.classList.add('in');
    }
  });

  logEl.addEventListener('scroll', () => {
    const atEnd = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 6;
    follow = atEnd;
    if (atEnd) {
      unseen = 0;
      jump.classList.remove('in');
    }
  });

  jump.addEventListener('click', () => {
    follow = true;
    toBottom();
  });

  function showCrash(c) {
    crashed = c;
    crashCard.innerHTML = '';
    crashCard.append(
      h('div', { class: 'crash-top' },
        h('span', { class: 'crash-ic', html: icon('info', 15) }),
        h('div', {}, h('b', { text: `${c.instance} crashed` }), h('span', { class: 'mono', text: `exit code ${c.code}` })),
        h('button', { class: 'btn icon sm', html: icon('x', 13), onclick: () => hideCrash() }),
      ),
      h('div', { class: 'crash-mod' },
        h('img', { class: 'mod-ic', src: modIcon(c.modId), alt: '' }),
        h('div', {}, h('span', { class: 'dim', text: 'caused by' }), h('b', { text: c.mod }), h('span', { class: 'mono dim', text: c.file })),
      ),
    );
    crashCard.classList.add('in');
    sync();
  }

  function hideCrash() {
    crashed = null;
    crashCard.classList.remove('in');
    sync();
  }

  function sync() {
    const running = !!state.running && app.launcher.phase === 'running';
    const inst = running ? app.launcher.instance : null;
    root.classList.toggle('live', running);
    root.classList.toggle('dead', !running && !!crashed);
    statusText.textContent = running ? `${inst.name} running` : crashed ? 'crashed' : 'idle';
    if (!running) statusTime.textContent = '';
  }

  setInterval(() => {
    if (!state.running || app.launcher.phase !== 'running') return;
    const s = Math.floor((Date.now() - app.launcher.started) / 1000);
    statusTime.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
  }, 1000);

  on('running', (id) => {
    if (id) hideCrash();
    setTimeout(sync, 50);
  });
  on('crash', showCrash);
  sync();
  render();

  return {
    enter() {
      sync();
      render();
      root.querySelectorAll('.rv').forEach((el, i) => {
        el.classList.remove('in');
        el.style.setProperty('--d', i * 60 + 'ms');
      });
      void root.offsetWidth;
      root.querySelectorAll('.rv').forEach((el) => el.classList.add('in'));
    },
    leave() {},
  };
}
