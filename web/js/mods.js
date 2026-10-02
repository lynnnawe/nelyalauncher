import { h, reveal, toast, segmented, select, modal, fmtDownloads } from './ui.js';
import { icon } from './icons.js';
import { instIcon, UNKNOWN } from './sprites.js';
import { instances, hoursSincePlayed, relTime, fmtBytes } from './data.js';
import { state, emit } from './state.js';
import { installedMods } from './instances.js';
import { downloads } from './downloads.js';
import { host } from './host.js';

const API = 'https://api.modrinth.com/v2';
const LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'];

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('modrinth answered ' + r.status);
  return r.json();
}

function loaderOk(v, loader) {
  return v.loaders.includes(loader) || (loader === 'quilt' && v.loaders.includes('fabric'));
}

export function mountMods(root, app) {
  let q = '';
  let sort = 'relevance';
  let loader = 'all';
  let forInst = null;
  let offset = 0;
  let total = 0;
  let busy = false;
  let req = 0;

  const input = h('input', { type: 'text', placeholder: 'search modrinth', spellcheck: 'false' });
  const sortSel = select([
    { value: 'relevance', label: 'relevance' },
    { value: 'downloads', label: 'downloads' },
    { value: 'follows', label: 'follows' },
    { value: 'updated', label: 'recently updated' },
    { value: 'newest', label: 'newest' },
  ], sort, (v) => { sort = v; search(); }, { label: 'sort' });
  const loaderSeg = segmented(['all', ...LOADERS].map((v) => ({ value: v, label: v })), 'all', (v) => { loader = v; search(); }, { cls: 'small' });
  const forChip = h('div', { class: 'for-chip' });

  const results = h('div', { class: 'mod-results' });
  const summary = h('div', { class: 'mod-summary mono dim' });
  const more = h('div', { class: 'mod-more' });
  const main = h('div', { class: 'mods-main' }, summary, results, more);

  const head = h('div', { class: 'mods-head' },
    h('label', { class: 'field big rv' }, h('span', { html: icon('search', 16) }), input, h('kbd', { text: '/' })),
    h('div', { class: 'mods-tools rv' }, loaderSeg, forChip, h('span', { class: 'grow' }), sortSel),
  );

  root.append(h('div', { class: 'mods-wrap' }, head, main));

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    results.classList.add('loading');
    timer = setTimeout(() => {
      q = input.value.trim();
      search();
    }, 300);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && root.classList.contains('active') && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      input.focus();
    }
  });

  main.addEventListener('scroll', () => {
    if (main.scrollTop + main.clientHeight > main.scrollHeight - 300) page();
  });

  function setFor(inst) {
    forInst = inst || null;
    forChip.innerHTML = '';
    forChip.classList.toggle('on', !!forInst);
    if (!forInst) return;
    forChip.append(
      h('img', { src: instIcon(forInst, 4), alt: '' }),
      h('span', { text: `for ${forInst.name}, ${forInst.version} ${forInst.loader}` }),
      h('button', { html: icon('x', 11), onclick: () => { setFor(null); search(); } }),
    );
  }

  function facets() {
    const f = [['project_type:mod']];
    const l = forInst ? forInst.loader : loader;
    if (l !== 'all' && l !== 'vanilla') f.push(l === 'quilt' ? ['categories:quilt', 'categories:fabric'] : ['categories:' + l]);
    if (forInst) f.push(['versions:' + forInst.version]);
    return JSON.stringify(f);
  }

  async function search() {
    offset = 0;
    total = 0;
    const id = ++req;
    results.classList.add('loading');
    results.innerHTML = '';
    for (let i = 0; i < 4; i++) results.appendChild(h('div', { class: 'mod-card ghost' }, h('i'), h('div', {}, h('i'), h('i'), h('i'))));
    more.innerHTML = '';
    try {
      const data = await getJson(`${API}/search?query=${encodeURIComponent(q)}&limit=20&offset=0&index=${sort}&facets=${encodeURIComponent(facets())}`);
      if (id !== req) return;
      total = data.total_hits;
      offset = data.hits.length;
      results.innerHTML = '';
      results.classList.remove('loading');
      summary.textContent = `${total.toLocaleString('en-US')} mods on modrinth`;
      fill(data.hits, true);
    } catch (err) {
      if (id !== req) return;
      results.innerHTML = '';
      results.classList.remove('loading');
      summary.textContent = '';
      results.appendChild(h('div', { class: 'empty big' }, h('div', { html: icon('globe', 26) }), h('b', { text: 'could not reach modrinth' }), h('span', { text: err.message }), h('button', { class: 'btn ghost sm', html: icon('refresh', 13) + '<span>try again</span>', onclick: search })));
    }
  }

  async function page() {
    if (busy || offset >= total) return;
    busy = true;
    const id = req;
    more.innerHTML = '';
    more.appendChild(h('span', { class: 'spinner' }));
    try {
      const data = await getJson(`${API}/search?query=${encodeURIComponent(q)}&limit=20&offset=${offset}&index=${sort}&facets=${encodeURIComponent(facets())}`);
      if (id !== req) return;
      offset += data.hits.length;
      fill(data.hits, false);
    } catch {}
    more.innerHTML = '';
    busy = false;
  }

  function fill(hits, fresh) {
    if (fresh && !hits.length) {
      results.appendChild(h('div', { class: 'empty big' }, h('div', { html: icon('search', 26) }), h('b', { text: 'no mods found' }), h('span', { text: 'try a different search or loader' })));
      return;
    }
    const added = [];
    hits.forEach((m) => {
      const btn = h('button', { class: 'install', html: icon('download', 14) + '<span>install</span>' });
      btn.addEventListener('click', () => {
        if (btn.classList.contains('busy')) return;
        if (!host.native) {
          toast('installing works inside the app', '', 'warn');
          return;
        }
        ask(m, btn);
      });
      const loaders = (m.categories || []).filter((c) => LOADERS.includes(c));
      const card = h('div', { class: 'mod-card rv' },
        h('img', { class: 'mod-ic', src: m.icon_url || UNKNOWN, alt: '', loading: 'lazy' }),
        h('div', { class: 'mc-body' },
          h('div', { class: 'mc-title' }, h('b', { text: m.title }), h('span', { class: 'dim', text: 'by ' + m.author })),
          h('p', { text: m.description }),
          h('div', { class: 'mc-tags' }, h('span', { class: 'tag faint', text: loaders.join(' / ') })),
        ),
        h('div', { class: 'mc-side' },
          h('div', { class: 'mc-stats' },
            h('span', { html: icon('download', 12) + fmtDownloads(m.downloads / 1e6) }),
            h('span', { html: icon('clock', 12) + relTime(Date.parse(m.date_modified)) }),
          ),
          btn,
        ),
      );
      results.appendChild(card);
      added.push(card);
    });
    added.forEach((el, i) => {
      el.style.setProperty('--d', Math.min(i, 12) * 30 + 'ms');
      el.classList.add('in');
    });
  }

  async function ask(mod, btn) {
    btn.classList.add('busy');
    btn.innerHTML = '<span class="spinner"></span>';
    let versions = [];
    const have = {};
    try {
      const [vs, ...lists] = await Promise.all([getJson(`${API}/project/${mod.project_id}/version`), ...instances.map((i) => installedMods(i.id))]);
      versions = vs;
      instances.forEach((inst, i) => { have[inst.id] = (lists[i] || []).some((x) => x.projectId === mod.project_id); });
    } catch (err) {
      btn.classList.remove('busy');
      btn.innerHTML = icon('download', 14) + '<span>install</span>';
      toast('could not load versions', err.message, 'warn');
      return;
    }
    btn.classList.remove('busy');
    btn.innerHTML = icon('download', 14) + '<span>install</span>';
    const compatible = (inst) => versions.filter((v) => loaderOk(v, inst.loader) && v.game_versions.includes(inst.version));
    const why = (inst) => inst.loader === 'vanilla' ? 'vanilla, no mod loader' : !compatible(inst).length ? `no build for ${inst.version} ${inst.loader}` : have[inst.id] ? 'already installed' : '';
    const can = (inst) => !why(inst);
    if (!instances.length) {
      toast('make an instance first', 'mods install into an instance', 'warn');
      return;
    }
    const all = [...instances].sort((a, b) => (can(b) - can(a)) || (hoursSincePlayed(a) - hoursSincePlayed(b)));
    let target = (forInst && can(forInst) ? forInst : null) || all.find((i) => i.id === state.selected && can(i)) || all.find(can) || null;
    let version = null;
    let plan = null;
    let planReq = 0;

    const pickList = h('div', { class: 'pick-list' });
    const depList = h('div', { class: 'dep-list' });
    const verList = h('div', { class: 'ver-list small' });
    const advBody = h('div', { class: 'adv-body' }, h('div', { class: 'adv-in' }, h('div', { class: 'label', text: 'mod version' }), verList));
    const advBtn = h('button', { class: 'adv-toggle', html: icon('right', 13) + '<span>advanced</span>' });
    const foot = h('span', { class: 'mono dim install-sum' });
    const go = h('button', { class: 'btn primary', html: icon('download', 14) + '<span>install</span>' });

    all.forEach((inst) => {
      const reason = why(inst);
      const row = h('button', { class: 'pick' + (reason ? ' no' : '') + (target === inst ? ' on' : ''), disabled: !!reason },
        h('span', { class: 'radio' }),
        h('img', { src: instIcon(inst, 4), alt: '' }),
        h('span', { class: 'pick-text' }, h('b', { text: inst.name }), h('small', { text: `${inst.version} ${inst.loader}` })),
        h('span', { class: 'pick-why mono', text: reason || relTime(inst.lastPlayed) }),
      );
      row.addEventListener('click', () => {
        target = inst;
        pickList.querySelectorAll('.pick').forEach((x) => x.classList.toggle('on', x === row));
        pickVersions();
      });
      pickList.appendChild(row);
    });

    advBtn.addEventListener('click', () => {
      const open = advBody.classList.toggle('open');
      advBtn.classList.toggle('open', open);
    });

    function pickVersions() {
      verList.innerHTML = '';
      go.disabled = !target;
      if (!target) {
        depList.innerHTML = '';
        depList.appendChild(h('div', { class: 'dep none', text: 'none of your instances can run this mod' }));
        foot.textContent = '';
        return;
      }
      const list = compatible(target);
      version = list.find((v) => v.version_type === 'release') || list[0];
      list.slice(0, 30).forEach((v) => {
        const row = h('button', { class: 'ver' + (v === version ? ' on' : '') },
          h('span', { class: 'radio' }),
          h('b', { text: v.version_number }),
          h('span', { class: 'chan chan-' + v.version_type, text: v.version_type }),
          h('span', { class: 'mono dim', text: relTime(Date.parse(v.date_published)) }),
        );
        row.addEventListener('click', () => {
          version = v;
          verList.querySelectorAll('.ver').forEach((x) => x.classList.toggle('on', x === row));
          loadPlan();
        });
        verList.appendChild(row);
      });
      loadPlan();
    }

    async function loadPlan() {
      const id = ++planReq;
      plan = null;
      go.disabled = true;
      depList.innerHTML = '';
      depList.appendChild(h('div', { class: 'dep none' }, h('span', { class: 'spinner' }), h('span', { text: ' checking dependencies' })));
      try {
        const p = await host.call('mods.plan', { id: target.id, versionId: version.id });
        if (id !== planReq) return;
        plan = p;
      } catch (err) {
        if (id !== planReq) return;
        depList.innerHTML = '';
        depList.appendChild(h('div', { class: 'dep none', text: 'could not check dependencies: ' + err.message }));
        return;
      }
      depList.innerHTML = '';
      const deps = plan.items.slice(1);
      if (!deps.length) depList.appendChild(h('div', { class: 'dep none', text: 'no extra dependencies needed' }));
      deps.forEach((d) => {
        depList.appendChild(h('div', { class: 'dep' },
          h('img', { class: 'mod-ic', src: d.icon || UNKNOWN, alt: '' }),
          h('b', { text: d.title }),
          h('span', { class: 'mono dim', text: state.autoDeps === false ? 'skipped, auto install is off' : d.version + ', installs automatically' }),
          h('span', { class: 'dep-ic', html: icon('plus', 12) }),
        ));
      });
      (plan.missing || []).forEach((name) => depList.appendChild(h('div', { class: 'dep have-not' }, h('b', { text: name }), h('span', { class: 'mono dim', text: 'no compatible version found' }))));
      const files = state.autoDeps === false ? plan.items.slice(0, 1) : plan.items;
      const bytes = files.reduce((a, x) => a + (x.size || 0), 0);
      foot.textContent = `${files.length} file${files.length > 1 ? 's' : ''}, ${fmtBytes(bytes)}, ${version.version_number}`;
      go.disabled = false;
    }

    const m = modal(h('div', { class: 'install-ask' },
      h('div', { class: 'modal-head' },
        h('div', { class: 'ask-title' }, h('img', { class: 'mod-ic', src: mod.icon_url || UNKNOWN, alt: '' }), h('div', {}, h('h3', { text: 'install ' + mod.title }), h('span', { class: 'dim', text: 'by ' + mod.author }))),
        h('button', { class: 'btn icon', html: icon('x', 16), onclick: () => m.close() }),
      ),
      h('div', { class: 'ask-scroll' },
        h('div', { class: 'label', text: 'which instance' }),
        pickList,
        h('div', { class: 'label', text: 'dependencies' }),
        depList,
        advBtn,
        advBody,
      ),
      h('div', { class: 'modal-foot' }, foot, h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost', text: 'cancel', onclick: () => m.close() }),
        go,
      ),
    ), { cls: 'ask-modal' });

    go.addEventListener('click', () => {
      if (!target || !plan || go.disabled) return;
      const inst = target;
      const items = state.autoDeps === false ? plan.items.slice(0, 1) : plan.items;
      m.close();
      run(mod, inst, items, btn);
    });

    pickVersions();
  }

  async function run(mod, inst, items, btn) {
    btn.classList.add('busy');
    btn.innerHTML = '<span class="install-fill"></span><span class="install-pct">queued</span>';
    const fillEl = btn.querySelector('.install-fill');
    const pct = btn.querySelector('.install-pct');
    const names = items.map((x) => x.title);
    const off = downloads.on((list) => {
      const mine = list.filter((d) => d.target === inst.name && d.kind === 'mod' && names.some((n) => d.name.startsWith(n)));
      if (!mine.length) return;
      const tot = mine.reduce((a, d) => a + d.size, 0);
      const done = mine.reduce((a, d) => a + d.done, 0);
      const k = tot ? Math.min(1, done / tot) : 0;
      fillEl.style.transform = `scaleX(${k})`;
      pct.textContent = Math.round(k * 100) + '%';
    });
    try {
      await host.call('mods.install', { id: inst.id, target: inst.name, items });
      inst.mods += items.length;
      emit('mods');
      btn.classList.remove('busy');
      btn.className = 'install done';
      btn.innerHTML = icon('check', 14) + '<span>installed</span>';
      const deps = items.slice(1).map((x) => x.title);
      toast(`${mod.title} installed`, deps.length ? `plus ${deps.join(', ')} in ${inst.name}` : `added to ${inst.name}`, 'ok');
      setTimeout(() => {
        btn.className = 'install';
        btn.innerHTML = icon('download', 14) + '<span>install</span>';
      }, 2500);
    } catch (err) {
      btn.classList.remove('busy');
      btn.innerHTML = icon('download', 14) + '<span>install</span>';
      toast(`${mod.title} failed`, err.message, 'warn');
    }
    off();
  }

  let started = false;

  return {
    enter(opts = {}) {
      if (opts.forInstance) {
        setFor(instances.find((i) => i.id === opts.forInstance));
        started = false;
      }
      if (opts.query !== undefined) {
        input.value = opts.query;
        q = opts.query;
        started = false;
      }
      if (!started) {
        started = true;
        search();
      }
      reveal(root, '.mods-head > .rv', 40);
    },
    leave() {},
  };
}
