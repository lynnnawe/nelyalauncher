import { h, toast, segmented } from './ui.js';
import { icon } from './icons.js';
import { instIcon } from './sprites.js';
import { instances, normalize, relTime } from './data.js';
import { set, emit } from './state.js';
import { host } from './host.js';

const SOURCES = {
  modrinth: 'modrinth app',
  prism: 'prism launcher',
  pandora: 'pandora',
  lunar: 'lunar client',
  curseforge: 'curseforge',
};

const progress = new Map();
if (host.native) host.event('import.progress', (d) => {
  const fn = progress.get(d.key);
  if (fn) fn(d);
});

export function importPanel(app) {
  let list = [];
  let filter = 'all';
  const picked = new Set();
  let busy = false;

  const body = h('div', { class: 'imp-list' });
  const goBtn = h('button', { class: 'btn primary', html: icon('download', 14) + '<span>import</span>' });
  const countEl = h('span', { class: 'mono dim imp-count' });
  const filterWrap = h('div', { class: 'imp-filter' });
  const fileBtn = h('button', { class: 'btn ghost sm', html: icon('upload', 13) + '<span>import a modpack file</span>' });
  const rescan = h('button', { class: 'btn icon sm', html: icon('refresh', 14), 'data-tip': 'scan again' });

  const wrap = h('div', { class: 'imp' },
    h('div', { class: 'imp-head rv' },
      h('div', {},
        h('b', { text: 'bring your instances over' }),
        h('span', { class: 'dim', text: 'nelya copies them into its own folder, the originals stay where they are' }),
      ),
      h('span', { class: 'grow' }),
      rescan,
      fileBtn,
    ),
    h('div', { class: 'rv' }, filterWrap),
    h('div', { class: 'rv' }, body),
    h('div', { class: 'imp-foot rv' }, countEl, h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost sm', text: 'select all', onclick: () => { visible().filter((c) => !c.imported).forEach((c) => picked.add(c.key)); draw(); } }),
      h('button', { class: 'btn ghost sm', text: 'none', onclick: () => { picked.clear(); draw(); } }),
      goBtn,
    ),
  );

  function visible() {
    return list.filter((c) => filter === 'all' || c.source === filter);
  }

  function drawFilter() {
    filterWrap.innerHTML = '';
    const counts = {};
    list.forEach((c) => (counts[c.source] = (counts[c.source] || 0) + 1));
    const opts = [{ value: 'all', label: `all ${list.length}` }, ...Object.keys(SOURCES).filter((s) => counts[s]).map((s) => ({ value: s, label: `${SOURCES[s]} ${counts[s]}` }))];
    if (!opts.some((o) => o.value === filter)) filter = 'all';
    filterWrap.appendChild(segmented(opts, filter, (v) => { filter = v; draw(); }, { cls: 'small' }));
    const missing = Object.keys(SOURCES).filter((s) => !counts[s]);
    if (missing.length) filterWrap.appendChild(h('span', { class: 'mono dim imp-none', text: 'not found: ' + missing.map((s) => SOURCES[s]).join(', ') }));
  }

  function draw() {
    body.innerHTML = '';
    const shown = visible();
    if (!list.length) {
      body.appendChild(h('div', { class: 'empty big' }, h('div', { html: icon('search', 26) }), h('b', { text: 'no other launchers found' }), h('span', { text: 'you can still import a .mrpack or curseforge .zip file' })));
    }
    shown.forEach((c) => {
      const on = picked.has(c.key);
      const bar = h('i');
      const state = h('span', { class: 'imp-state mono' });
      const row = h('button', { class: 'imp-row' + (on ? ' on' : '') + (c.imported ? ' done' : ''), disabled: c.imported || busy },
        h('span', { class: 'box', html: icon('check', 11) }),
        h('img', { src: c.icon || instIcon({ icon: c.loader === 'forge' || c.loader === 'neoforge' ? 'cog' : c.loader === 'vanilla' ? 'grass' : 'sapling' }, 4), alt: '', class: c.icon ? 'real' : '' }),
        h('div', { class: 'imp-text' },
          h('b', { text: c.name }),
          h('small', { class: 'mono', text: `${c.version} ${c.loader}${c.loaderVersion ? ' ' + c.loaderVersion : ''}` }),
        ),
        h('span', { class: 'imp-src mono', text: SOURCES[c.source] }),
        h('span', { class: 'imp-meta mono dim', text: `${c.mods} mods${c.worlds ? ', ' + c.worlds + ' worlds' : ''}` }),
        h('span', { class: 'imp-meta mono dim', text: c.lastPlayed ? relTime(c.lastPlayed) : '' }),
        c.imported ? h('span', { class: 'imp-state mono ok', text: 'imported' }) : state,
        h('span', { class: 'imp-bar' }, bar),
      );
      if (c.note) row.setAttribute('data-tip', c.note);
      row.addEventListener('click', () => {
        if (c.imported || busy) return;
        if (picked.has(c.key)) picked.delete(c.key);
        else picked.add(c.key);
        row.classList.toggle('on', picked.has(c.key));
        count();
      });
      progress.set(c.key, (d) => {
        row.classList.add('working');
        if (d.state === 'done') {
          row.classList.remove('working');
          row.classList.add('done');
          state.textContent = 'imported';
          state.classList.add('ok');
          bar.style.transform = 'scaleX(1)';
          return;
        }
        if (d.state === 'failed') {
          row.classList.remove('working');
          state.textContent = 'failed';
          state.classList.add('bad');
          row.setAttribute('data-tip', d.error || 'failed');
          return;
        }
        const k = d.total ? d.done / d.total : 0;
        bar.style.transform = `scaleX(${Math.max(0.03, k)})`;
        state.textContent = Math.round(k * 100) + '%';
      });
      body.appendChild(row);
    });
    count();
  }

  function count() {
    const n = [...picked].filter((k) => list.some((c) => c.key === k && !c.imported)).length;
    countEl.textContent = n ? `${n} selected` : 'pick what to import';
    goBtn.disabled = !n || busy;
    goBtn.innerHTML = icon('download', 14) + `<span>import${n ? ' ' + n : ''}</span>`;
  }

  async function scan() {
    body.innerHTML = '';
    body.appendChild(h('div', { class: 'tab-loading mono dim' }, h('span', { class: 'spinner' }), h('span', { text: 'looking for other launchers' })));
    if (!host.native) {
      list = [];
      drawFilter();
      draw();
      return;
    }
    try {
      list = await host.call('import.scan');
      list.sort((a, b) => (a.imported - b.imported) || ((b.lastPlayed || 0) - (a.lastPlayed || 0)));
    } catch (err) {
      list = [];
      toast('could not scan', err.message, 'warn');
    }
    picked.forEach((k) => { if (!list.some((c) => c.key === k)) picked.delete(k); });
    drawFilter();
    draw();
  }

  function adopt(raws) {
    raws.forEach((raw) => {
      const inst = normalize(raw);
      instances.push(inst);
    });
    if (raws.length) {
      set('selected', raws[raws.length - 1].id);
      emit('instances');
    }
  }

  goBtn.addEventListener('click', async () => {
    const keys = [...picked].filter((k) => list.some((c) => c.key === k && !c.imported));
    if (!keys.length || busy) return;
    busy = true;
    count();
    body.querySelectorAll('.imp-row').forEach((r) => (r.disabled = true));
    goBtn.innerHTML = '<span class="spinner"></span><span>importing</span>';
    try {
      const made = await host.call('import.run', { keys });
      adopt(made);
      list.forEach((c) => { if (keys.includes(c.key) && made.length) c.imported = true; });
      picked.clear();
      toast(`imported ${made.length} instance${made.length === 1 ? '' : 's'}`, 'game files download in the background', 'ok', 5000);
    } catch (err) {
      toast('import failed', err.message, 'warn');
    }
    busy = false;
    await scan();
  });

  fileBtn.addEventListener('click', async () => {
    if (!host.native || busy) return;
    busy = true;
    fileBtn.disabled = true;
    fileBtn.innerHTML = '<span class="spinner"></span><span>importing</span>';
    try {
      const res = await host.call('import.pick');
      if (res && res.instance) {
        adopt([res.instance]);
        toast(res.instance.name + ' imported', res.missing ? `${res.missing} files could not be downloaded` : 'mods downloaded, game files are next', res.missing ? 'warn' : 'ok', 6000);
      }
    } catch (err) {
      toast('could not import that file', err.message, 'warn', 6000);
    }
    busy = false;
    fileBtn.disabled = false;
    fileBtn.innerHTML = icon('upload', 13) + '<span>import a modpack file</span>';
  });

  rescan.addEventListener('click', scan);
  scan();
  return wrap;
}
