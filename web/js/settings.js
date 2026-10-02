import { h, reveal, toast, segmented, select, toggle, slider } from './ui.js';
import { updateState, onUpdate, checkUpdates, downloadUpdate, restartToUpdate } from './updates.js';
import { icon } from './icons.js';
import { AsciiMoon } from './ascii.js';
import { javas } from './data.js';
import { host } from './host.js';
import { fmtBytes, relTime } from './data.js';
import { state, set, accents } from './state.js';
import { importPanel } from './importer.js';

export function mountSettings(root, app) {
  const sections = [
    { id: 'general', icon: 'sliders', label: 'general' },
    { id: 'downloads', icon: 'download', label: 'downloads' },
    { id: 'java', icon: 'coffee', label: 'java runtimes' },
    { id: 'import', icon: 'upload', label: 'import' },
    { id: 'appearance', icon: 'palette', label: 'appearance' },
    { id: 'accessibility', icon: 'eye', label: 'accessibility' },
    { id: 'about', icon: 'info', label: 'about' },
  ];
  let current = 'general';
  let cube = null;

  const nav = h('nav', { class: 'set-nav' });
  const ink = h('span', { class: 'set-ink' });
  nav.appendChild(ink);
  const content = h('div', { class: 'set-content' });

  sections.forEach((s) => {
    const b = h('button', { class: s.id === current ? 'on' : '', html: icon(s.icon, 15) + `<span>${s.label}</span>`, data: { id: s.id } });
    b.addEventListener('click', () => show(s.id));
    nav.appendChild(b);
  });

  root.append(h('div', { class: 'set-wrap' }, h('div', { class: 'set-side' }, h('h2', { class: 'rv', text: 'settings' }), nav), content));

  const row = (title, desc, control) => h('div', { class: 'set-row rv' }, h('div', { class: 'set-label' }, h('b', { text: title }), desc ? h('span', { text: desc }) : null), h('div', { class: 'set-control' }, control));
  const group = (title) => h('div', { class: 'set-group rv', text: title });

  function moveInk() {
    const on = nav.querySelector('button.on');
    if (!on) return;
    ink.style.height = on.offsetHeight + 'px';
    ink.style.transform = `translateY(${on.offsetTop}px)`;
  }

  function show(id) {
    current = id;
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    moveInk();
    if (cube) { cube.stop(); cube = null; }
    content.innerHTML = '';
    content.scrollTop = 0;
    content.appendChild(build(id));
    reveal(content, '.rv', 28);
  }

  function updateRow() {
    const desc = h('span');
    const btn = h('button', { class: 'btn ghost sm' });
    const el = h('div', { class: 'set-row rv' }, h('div', { class: 'set-label' }, h('b', { text: 'nelya ' + (state.appVersion || '') }), desc), h('div', { class: 'set-control' }, btn));
    let busy = '';
    let seen = false;
    const render = (s) => {
      if (el.isConnected) seen = true;
      else if (seen) return off();
      btn.disabled = !!busy || !host.native;
      if (!host.native) {
        desc.textContent = 'updates check github when running the app';
        btn.innerHTML = icon('refresh', 13) + '<span>check</span>';
        return;
      }
      if (!s) {
        desc.textContent = 'checking github...';
        btn.innerHTML = '<span class="spinner"></span>';
        return;
      }
      if (s.ready) {
        desc.textContent = `${s.latest} is downloaded, it installs when you close nelya`;
        btn.innerHTML = icon('refresh', 13) + '<span>restart now</span>';
      } else if (s.downloading || busy === 'download') {
        desc.textContent = `downloading ${s.latest}...`;
        btn.innerHTML = '<span class="spinner"></span><span>downloading</span>';
      } else if (s.newer && !s.portable) {
        desc.textContent = `${s.latest} is available` + (s.error ? `, ${s.error}` : '');
        btn.innerHTML = icon('download', 13) + `<span>update to ${s.latest}</span>`;
      } else if (busy === 'check') {
        desc.textContent = 'checking github...';
        btn.innerHTML = '<span class="spinner"></span><span>checking</span>';
      } else {
        const when = s.checkedAt ? 'checked ' + relTime(s.checkedAt) : 'not checked yet';
        desc.textContent = s.error ? s.error + ', ' + when : s.portable ? 'running outside Nelya.exe, updates are off' : `you're on the latest, ${when}`;
        btn.innerHTML = icon('refresh', 13) + '<span>check for updates</span>';
      }
    };
    const off = onUpdate(render);
    btn.addEventListener('click', async () => {
      const s = updateState();
      try {
        if (s && s.ready) return await restartToUpdate();
        busy = s && s.newer && !s.portable ? 'download' : 'check';
        render(s);
        if (busy === 'download') await downloadUpdate();
        else {
          const fresh = await checkUpdates();
          if (fresh && fresh.newer) toast('nelya ' + fresh.latest + ' is available', 'press update to get it', 'info');
          else if (fresh && !fresh.error) toast("you're up to date", 'nelya ' + fresh.current, 'ok');
        }
      } catch (err) {
        toast('update failed', err.message, 'warn');
      }
      busy = '';
      render(updateState());
    });
    render(updateState());
    return el;
  }

  function build(id) {
    if (id === 'general') {
      const cacheBtn = h('button', { class: 'btn ghost sm', html: icon('trash', 13) + '<span>clear cache</span>' });
      if (host.native) host.call('cache.size').then((n) => { cacheBtn.innerHTML = icon('trash', 13) + `<span>clear ${fmtBytes(n)}</span>`; }).catch(() => {});
      cacheBtn.addEventListener('click', async () => {
        if (!host.native) return;
        cacheBtn.disabled = true;
        try {
          const left = await host.call('cache.clear');
          cacheBtn.innerHTML = icon('check', 13) + `<span>cleared, ${fmtBytes(left)} left</span>`;
          toast('cache cleared', '', 'ok');
        } catch (err) {
          toast('could not clear the cache', err.message, 'warn');
        }
        cacheBtn.disabled = false;
      });
      const root = state.root || '%appdata%/nelya';
      return h('div', {},
        group('launcher'),
        row('when the game starts', 'dock tucks nelya into the tray by the clock until the game closes', segmented([{ value: 'keep', label: 'keep open' }, { value: 'dock', label: 'dock' }], state.onStart === 'keep' ? 'keep' : 'dock', (v) => set('onStart', v))),
        row('start with windows', 'open nelya when you sign in to windows', toggle(!!state.startWithWindows, (v) => set('startWithWindows', v))),
        group('updates'),
        updateRow(),
        row('update automatically', 'download new versions in the background, they install when nelya closes', toggle(state.autoUpdate !== false, (v) => set('autoUpdate', v))),
        group('storage'),
        row('data folder', 'instances, game files, java and settings all live here', h('div', { class: 'path' }, h('span', { class: 'mono', text: root }), h('button', { class: 'btn ghost sm', html: icon('folder', 13) + '<span>open</span>', onclick: () => host.call('open', { id: '' }).catch(() => {}) }))),
        row('cache', 'version lists, installers and downloaded metadata', cacheBtn),
      );
    }
    if (id === 'downloads') {
      const threads = slider({ min: 1, max: 32, value: state.threads, format: (v) => v + ' at once', onInput: (v) => set('threads', v) });
      threads.classList.toggle('disabled', state.oneAtATime);
      return h('div', {},
        group('queue'),
        row('one mod at a time', 'download mods one after another instead of in parallel', toggle(state.oneAtATime, (v) => {
          set('oneAtATime', v);
          threads.classList.toggle('disabled', v);
        })),
        row('parallel downloads', 'how many files download together', threads),
        group('mods'),
        row('install dependencies', 'add required mods automatically', toggle(state.autoDeps !== false, (v) => set('autoDeps', v))),
        row('show download list', 'open the downloads popup when something starts', toggle(!!state.showDownloads, (v) => set('showDownloads', v))),
      );
    }
    if (id === 'java') {
      const list = h('div', { class: 'java-list' });
      const comps = h('div', { class: 'java-list' });
      const drawJavas = () => {
        list.innerHTML = '';
        if (!javas.length) list.appendChild(h('div', { class: 'empty', text: 'no java found yet, nelya downloads one when you first play' }));
        javas.forEach((j) => {
          list.appendChild(h('div', { class: 'java' },
            h('span', { class: 'java-ic', html: icon('coffee', 15) }),
            h('div', {}, h('b', { text: j.name }), h('span', { class: 'mono dim', text: j.path })),
            h('span', { class: 'tag', text: j.managed ? 'nelya' : 'system' }),
          ));
        });
      };
      const drawComponents = (items) => {
        comps.innerHTML = '';
        items.forEach((c) => {
          const btn = h('button', { class: 'btn ghost sm', html: c.installed ? icon('check', 13) + '<span>installed</span>' : icon('download', 13) + '<span>install</span>', disabled: c.installed });
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span><span>downloading</span>';
            try {
              const fresh = await host.call('java.install', { component: c.id });
              javas.length = 0;
              fresh.forEach((x) => javas.push(x));
              drawJavas();
              btn.innerHTML = icon('check', 13) + '<span>installed</span>';
              toast('java ' + c.name + ' installed', c.id, 'ok');
            } catch (err) {
              btn.disabled = false;
              btn.innerHTML = icon('download', 13) + '<span>install</span>';
              toast('could not install java', err.message, 'warn');
            }
          });
          comps.appendChild(h('div', { class: 'java' },
            h('span', { class: 'java-ic', html: icon('cube', 15) }),
            h('div', {}, h('b', { text: 'java ' + c.name }), h('span', { class: 'mono dim', text: c.id })),
            btn,
          ));
        });
      };
      drawJavas();
      if (host.native) {
        host.call('java.list').then((l) => { javas.length = 0; l.forEach((x) => javas.push(x)); drawJavas(); }).catch(() => {});
        comps.appendChild(h('div', { class: 'tab-loading mono dim' }, h('span', { class: 'spinner' }), h('span', { text: 'asking mojang' })));
        host.call('java.components').then(drawComponents).catch(() => { comps.innerHTML = ''; });
      }
      return h('div', {},
        group('found on this pc'),
        h('div', { class: 'rv' }, list),
        group('runtimes from mojang'),
        h('div', { class: 'rv' }, comps),
        h('div', { class: 'rv set-note mono dim', text: 'each instance picks the right java automatically, you can override it in the instance settings' }),
      );
    }
    if (id === 'import') return importPanel(app);
    if (id === 'appearance') {
      const swatches = h('div', { class: 'swatches' });
      Object.entries(accents).forEach(([name, rgb]) => {
        const b = h('button', { class: 'swatch' + (state.accent === name ? ' on' : ''), style: { '--c': `rgb(${rgb})` }, 'data-tip': name });
        b.addEventListener('click', () => {
          swatches.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === b));
          set('accent', name);
        });
        swatches.appendChild(b);
      });
      return h('div', {},
        group('look'),
        row('accent', 'used for buttons, highlights and the globe markers', swatches),
        row('starfield', 'the drifting stars behind everything', toggle(state.stars, (v) => set('stars', v))),
        row('cat', 'a cat who naps on the play button', toggle(state.cat !== false, (v) => set('cat', v))),
        row('connection lines', 'the lines from the planet to your instances', segmented([{ value: 'static', label: 'always on' }, { value: 'once', label: 'draw once' }, { value: 'flow', label: 'animated' }], ['flow', 'once'].includes(state.wires) ? state.wires : 'static', (v) => set('wires', v))),
        row('globe detail', 'extreme draws the real earth with glowing coastlines', segmented(['low', 'medium', 'high', 'extreme'], state.globeDetail, (v) => { set('globeDetail', v); app.home.setDetail(v); })),
        group('startup'),
        row('splash screen', 'show the boot screen on startup', toggle(state.splash !== false, (v) => set('splash', v))),
      );
    }
    if (id === 'accessibility') {
      return h('div', {},
        group('home'),
        row('scroll to change pages', 'scroll over the planet to flip between instance pages', toggle(state.wheelPages !== false, (v) => set('wheelPages', v))),
        row('arrow keys change pages', 'use left and right to flip between instance pages', toggle(state.arrowPages !== false, (v) => set('arrowPages', v))),
      );
    }
    const pre = h('pre', { class: 'about-cube' });
    cube = new AsciiMoon(pre);
    cube.render();
    cube.start();
    return h('div', { class: 'about' },
      h('div', { class: 'rv' }, pre),
      h('div', { class: 'about-text rv' },
        h('h1', { text: 'nelya' }),
        h('span', { class: 'mono dim', text: 'version ' + (state.appVersion || '0.1.0') }),
        h('p', { text: 'bleh' }),
        h('div', { class: 'set-inline' },
          h('button', { class: 'btn ghost sm', html: icon('folder', 13) + '<span>data folder</span>', onclick: () => host.call('open', { id: '' }).catch(() => {}) }),
          h('button', { class: 'btn ghost sm', html: icon('terminal', 13) + '<span>launcher logs</span>', onclick: () => host.call('open', { id: '', sub: 'logs' }).catch(() => {}) }),
        ),
      ),
    );
  }

  show(current);

  return {
    enter() {
      reveal(root, '.set-side .rv', 40);
      show(current);
    },
    leave() {
      if (cube) cube.stop();
    },
  };
}
