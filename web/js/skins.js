import { h, reveal, toast, segmented, modal } from './ui.js';
import { icon } from './icons.js';
import { SkinViewer, setFace, registerSkin, normalizeSkin, customInfo, skinTexture } from './skin.js';
import { accounts } from './data.js';
import { state, set, on } from './state.js';
import { removeAccount, adoptAccount } from './login.js';
import { host } from './host.js';

const STORE = 'skins';

async function loadLibrary() {
  if (host.native) {
    try {
      const v = await host.call('store.get', { key: STORE });
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  try {
    return JSON.parse(localStorage.getItem('nelya-skins') || '[]');
  } catch {
    return [];
  }
}

function saveLibrary(list) {
  const keep = list.slice(0, 30);
  if (host.native) host.call('store.set', { key: STORE, value: keep }).catch(() => {});
  else {
    try { localStorage.setItem('nelya-skins', JSON.stringify(keep)); } catch {}
  }
}

async function lookup(name) {
  if (host.native) return host.request('skin:fetch', name);
  try {
    const r = await fetch('https://api.ashcon.app/mojang/v2/user/' + encodeURIComponent(name));
    if (r.status === 404) return { ok: false, error: 'no player with that name' };
    const j = await r.json();
    if (j.code === 429) return { ok: false, error: 'mojang is rate limiting, try again in a minute' };
    const skin = j.textures && j.textures.skin;
    if (!skin || !skin.data) return { ok: false, error: 'could not read that skin' };
    return { ok: true, name: j.username, slim: !!j.textures.slim, data: skin.data, cape: j.textures.cape && j.textures.cape.data };
  } catch {
    return { ok: false, error: 'could not reach mojang' };
  }
}

export function mountSkins(root, app) {
  let library = [];
  let preview = null;

  const view = h('div', { class: 'skin-view' });
  const viewer = new SkinViewer(view, { scale: 10 });
  const active = () => accounts.find((a) => a.id === state.account) || accounts[0] || null;

  const poseSeg = segmented([
    { value: 'idle', label: 'idle', icon: 'stand' },
    { value: 'walk', label: 'walk', icon: 'walk' },
  ], 'idle', (v) => (viewer.pose = v), { cls: 'small' });
  const modelSeg = segmented(['classic', 'slim'], 'classic', (v) => viewer.setModel(v === 'slim'), { cls: 'small' });
  const syncModel = () => {
    const btns = modelSeg.querySelectorAll('button');
    btns.forEach((b, i) => b.classList.toggle('on', i === (viewer.slim ? 1 : 0)));
    modelSeg.refresh();
  };

  const wearBar = h('div', { class: 'wear-bar' });
  const stage = h('div', { class: 'skin-left rv' },
    view,
    wearBar,
    h('div', { class: 'skin-controls' }, poseSeg, modelSeg),
    h('div', { class: 'skin-hint mono dim', text: 'drag to rotate' }),
  );

  const stealIn = h('input', { type: 'text', placeholder: 'minecraft username', spellcheck: 'false', maxlength: '16' });
  const stealBtn = h('button', { class: 'btn primary sm steal-go', html: icon('download', 13) + '<span>steal</span>' });
  const stealField = h('label', { class: 'field steal-field' }, h('span', { html: icon('search', 14) }), stealIn, stealBtn);
  const stealMsg = h('div', { class: 'steal-msg mono' });
  const stealCard = h('div', { class: 'steal-card' });

  const accList = h('div', { class: 'acc-list' });
  const lib = h('div', { class: 'skin-lib' });
  const capes = h('div', { class: 'cape-row' });
  const capeHead = h('div', { class: 'pane-head rv' }, h('h2', { text: 'cape' }));
  const capeWrap = h('div', { class: 'rv' }, capes);
  const upload = h('input', { type: 'file', accept: '.png,image/png', hidden: true });

  const side = h('div', { class: 'skin-right' },
    h('div', { class: 'pane-head rv' }, h('h2', { text: 'steal a skin' })),
    h('div', { class: 'rv' }, stealField, stealMsg, stealCard),
    h('div', { class: 'pane-head rv' }, h('h2', { text: 'accounts' }), h('span', { class: 'grow' }), h('button', { class: 'btn ghost sm', html: icon('userplus', 13) + '<span>add</span>', onclick: () => app.addAccount() })),
    h('div', { class: 'rv' }, accList),
    h('div', { class: 'pane-head rv' }, h('h2', { text: 'skin library' }), h('span', { class: 'grow' }), h('button', { class: 'btn ghost sm', html: icon('upload', 13) + '<span>upload</span>', onclick: () => upload.click() }), upload),
    h('div', { class: 'rv' }, lib),
    capeHead,
    capeWrap,
  );

  root.append(h('div', { class: 'skins-wrap' }, stage, side));

  function current() {
    const acc = active();
    return acc ? acc.skin : 'alex';
  }

  function show(key, label) {
    viewer.setSkin(key);
    viewer.setName(label);
    syncModel();
    const info = customInfo(key);
    const acc = active();
    const ownCape = acc && acc.capes ? acc.capes.find((c) => c.active) : null;
    viewer.setCape(info && info.cape ? info.cape : ownCape && ownCape.texture ? ownCape.texture : null);
    renderWearBar();
  }

  function renderWearBar() {
    wearBar.innerHTML = '';
    const acc = active();
    const showing = preview || current();
    const isOwn = acc && showing === acc.skin;
    wearBar.classList.toggle('in', !!acc && !isOwn);
    if (!acc || isOwn) return;
    const btn = h('button', { class: 'btn primary sm', html: icon('user', 13) + `<span>wear on ${acc.name}</span>` });
    btn.addEventListener('click', () => wear(showing, btn));
    wearBar.append(
      h('span', { class: 'mono dim', text: 'previewing, not on your account yet' }),
      btn,
      h('button', { class: 'btn ghost sm', html: icon('x', 12) + '<span>back</span>', onclick: () => { preview = null; show(current(), acc.name); renderLib(); } }),
    );
  }

  async function wear(key, btn) {
    const acc = active();
    if (!acc) {
      app.addAccount();
      return;
    }
    if (!host.native) {
      toast('changing skins works inside the app', '', 'warn');
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span><span>uploading</span>';
    }
    try {
      const raw = await host.call('accounts.skin', { id: acc.id, png: skinTexture(key), slim: viewer.slim });
      if (raw.skin) raw.skin = await normalizeSkin(raw.skin);
      const fresh = adoptAccount(raw);
      Object.assign(acc, fresh);
      preview = null;
      show(acc.skin, acc.name);
      renderAccounts();
      renderLib();
      set('account', state.account);
      toast('skin changed', 'this is now your skin on minecraft', 'ok');
    } catch (err) {
      toast('could not change your skin', err.message, 'warn', 6000);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = icon('user', 13) + `<span>wear on ${acc.name}</span>`;
      }
    }
  }

  async function steal() {
    const name = stealIn.value.trim();
    if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) {
      fail(name ? 'that is not a valid username' : 'type a username first');
      return;
    }
    stealField.classList.remove('bad');
    stealField.classList.add('busy');
    stealBtn.disabled = true;
    stealBtn.innerHTML = '<span class="spinner"></span><span>looking</span>';
    stealMsg.textContent = 'asking mojang for ' + name + '...';
    stealMsg.className = 'steal-msg mono in';
    const res = await lookup(name);
    stealField.classList.remove('busy');
    stealBtn.disabled = false;
    stealBtn.innerHTML = icon('download', 13) + '<span>steal</span>';
    if (!res || !res.ok) {
      fail(res ? res.error : 'could not reach mojang');
      return;
    }
    try {
      const url = await normalizeSkin('data:image/png;base64,' + res.data);
      const cape = res.cape ? 'data:image/png;base64,' + res.cape : null;
      const key = 'player:' + res.name;
      registerSkin(key, url, { slim: !!res.slim, cape });
      stealMsg.className = 'steal-msg mono';
      stealIn.value = '';
      preview = key;
      show(key, res.name);
      renderLib();
      renderCard({ name: res.name, url, slim: !!res.slim, cape, kind: 'player' }, key);
      toast('stole ' + res.name + "'s skin", res.slim ? 'slim model' : 'classic model', 'ok');
    } catch {
      fail('could not read that skin');
    }
  }

  function fail(msg) {
    stealMsg.textContent = msg;
    stealMsg.className = 'steal-msg mono in bad';
    stealField.classList.remove('bad');
    void stealField.offsetWidth;
    stealField.classList.add('bad');
  }

  let syncCard = () => {};

  const keyOf = (e) => (e.kind === 'upload' ? 'upload:' : 'player:') + e.name;
  const inLibrary = (key) => library.some((x) => keyOf(x).toLowerCase() === key.toLowerCase());

  function addToLibrary(entry) {
    library = [entry, ...library.filter((x) => keyOf(x).toLowerCase() !== keyOf(entry).toLowerCase())];
    saveLibrary(library);
    renderLib();
    const card = lib.querySelector('.skin-card.stolen');
    if (card) card.classList.add('fresh');
  }

  function renderCard(entry, key) {
    const { name, slim, cape } = entry;
    const img = h('img', { alt: '' });
    setFace(img, key, 40);
    const addBtn = h('button', { class: 'btn ghost sm lib-add' });
    syncCard = () => {
      const have = inLibrary(key);
      addBtn.classList.toggle('have', have);
      addBtn.innerHTML = have ? icon('check', 13) + '<span>in library</span>' : icon('plus', 13) + '<span>add to library</span>';
    };
    addBtn.addEventListener('click', () => {
      if (inLibrary(key)) return;
      addToLibrary(entry);
      toast(name + ' added to your library', '', 'ok');
    });
    syncCard();
    const card = h('div', { class: 'steal-result' },
      img,
      h('div', { class: 'sr-meta' }, h('b', { text: name }), h('span', { class: 'mono dim', text: (slim ? 'slim' : 'classic') + (cape ? ', has a cape' : '') })),
      h('button', { class: 'btn ghost sm', html: icon('user', 13) + '<span>wear</span>', onclick: (e) => wear(key, e.currentTarget) }),
      addBtn,
    );
    stealCard.innerHTML = '';
    stealCard.appendChild(card);
    stealCard.classList.remove('in');
    void stealCard.offsetWidth;
    stealCard.classList.add('in');
  }

  upload.addEventListener('change', async () => {
    const f = upload.files && upload.files[0];
    upload.value = '';
    if (!f) return;
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      const url = await normalizeSkin(data);
      const name = f.name.replace(/\.png$/i, '').slice(0, 24) || 'skin';
      const entry = { name, url, slim: viewer.slim, cape: null, kind: 'upload' };
      registerSkin(keyOf(entry), url, { slim: entry.slim });
      addToLibrary(entry);
      preview = keyOf(entry);
      show(preview, name);
      renderLib();
      toast(name + ' added to your library', 'press wear to put it on', 'ok');
    } catch {
      toast('that is not a skin file', '64x64 or 64x32 png only', 'warn');
    }
  });

  stealBtn.addEventListener('click', (e) => {
    e.preventDefault();
    steal();
  });
  stealIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') steal();
  });
  stealIn.addEventListener('input', () => {
    stealField.classList.remove('bad');
    if (stealMsg.classList.contains('bad')) stealMsg.className = 'steal-msg mono';
  });

  function renderAccounts() {
    accList.innerHTML = '';
    if (!accounts.length) {
      accList.appendChild(h('div', { class: 'acc-empty' },
        h('span', { class: 'dim', text: 'no account yet' }),
        h('button', { class: 'btn primary sm', html: icon('userplus', 13) + '<span>sign in with microsoft</span>', onclick: () => app.addAccount() }),
      ));
      viewer.setName('no account');
      return;
    }
    accounts.forEach((a) => {
      const img = h('img', { alt: '' });
      setFace(img, a.skin, 32);
      const row = h('div', { class: 'acc' + (a.id === state.account ? ' on' : '') },
        h('span', { class: 'radio' }),
        img,
        h('div', { class: 'acc-meta' }, h('b', { text: a.name }), h('span', { text: 'microsoft' })),
        h('button', { class: 'btn icon sm', html: icon('logout', 14), 'data-tip': 'sign out', onclick: (e) => {
          e.stopPropagation();
          const wasActive = a.id === state.account;
          removeAccount(a.id);
          if (wasActive) set('account', accounts[0] ? accounts[0].id : null);
          preview = null;
          const acc = active();
          show(current(), acc ? acc.name : 'no account');
          renderAccounts();
          renderLib();
          renderCapes();
          toast('signed out', a.name);
        } }),
      );
      row.addEventListener('click', () => {
        if (a.id === state.account) return;
        seen = a.id;
        set('account', a.id);
        preview = null;
        show(a.skin, a.name);
        renderAccounts();
        renderLib();
        renderCapes();
        toast('switched account', a.name, 'ok');
      });
      accList.appendChild(row);
    });
    const acc = active();
    if (acc) viewer.setName(acc.name);
  }

  function renderLib() {
    syncCard();
    lib.innerHTML = '';
    const acc = active();
    const showing = preview || current();
    const items = [
      ...(acc && acc.skinData ? [{ key: acc.skin, label: 'current', mine: true }] : []),
      ...library.map((s) => ({ key: keyOf(s), label: s.name, stolen: true })),
    ];
    lib.classList.toggle('none', !items.length);
    if (!items.length) {
      lib.appendChild(h('div', { class: 'lib-empty dim', text: 'nothing here yet, steal a skin or upload a png' }));
      return;
    }
    items.forEach((it) => {
      const img = h('img', { alt: '' });
      setFace(img, it.key, 40);
      const b = h('button', { class: 'skin-card' + (showing === it.key ? ' on' : '') + (it.stolen ? ' stolen' : '') + (it.mine ? ' mine' : '') }, img, h('span', { text: it.label }));
      if (it.stolen) {
        const x = h('i', { class: 'skin-del', html: icon('x', 11), 'data-tip': 'forget' });
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          library = library.filter((s) => keyOf(s) !== it.key);
          saveLibrary(library);
          if (preview === it.key) {
            preview = null;
            show(current(), acc ? acc.name : 'no account');
          }
          renderLib();
        });
        b.appendChild(x);
      }
      b.addEventListener('click', () => {
        preview = it.mine ? null : it.key;
        show(it.key, it.mine && acc ? acc.name : it.label);
        lib.querySelectorAll('.skin-card').forEach((x) => x.classList.toggle('on', x === b));
      });
      lib.appendChild(b);
    });
  }

  function renderCapes() {
    capes.innerHTML = '';
    const acc = active();
    const owned = acc && acc.capes ? acc.capes : [];
    capeHead.hidden = !acc;
    capeWrap.hidden = !acc;
    if (!acc) return;
    if (!owned.length) {
      capes.appendChild(h('span', { class: 'dim cape-none', text: 'this account has no capes' }));
      return;
    }
    const list = [{ id: null, alias: 'none', active: !owned.some((c) => c.active) }, ...owned];
    list.forEach((c) => {
      const b = h('button', { class: 'cape' + (c.active ? ' on' : '') },
        h('span', { class: 'cape-swatch' + (c.id ? '' : ' none'), style: c.texture ? { backgroundImage: `url(${c.texture})`, backgroundSize: '128px 64px', backgroundPosition: '-2px -2px', imageRendering: 'pixelated' } : {} }),
        h('span', { text: (c.alias || 'cape').toLowerCase() }),
      );
      b.addEventListener('click', async () => {
        if (c.active) return;
        capes.querySelectorAll('.cape').forEach((x) => x.classList.toggle('on', x === b));
        viewer.setCape(c.texture || null);
        try {
          const raw = await host.call('accounts.cape', { id: acc.id, cape: c.id });
          if (raw.skin) raw.skin = await normalizeSkin(raw.skin);
          Object.assign(acc, adoptAccount(raw));
          renderCapes();
          toast(c.id ? (c.alias || 'cape').toLowerCase() + ' cape on' : 'cape off', 'changed on minecraft', 'ok');
        } catch (err) {
          toast('could not change your cape', err.message, 'warn');
          renderCapes();
        }
      });
      capes.appendChild(b);
    });
  }

  let seen = state.account;
  on('account', (id) => {
    if (id === seen) return;
    seen = id;
    preview = null;
    const acc = active();
    show(current(), acc ? acc.name : 'no account');
    renderAccounts();
    renderLib();
    renderCapes();
  });

  const acc0 = active();
  show(current(), acc0 ? acc0.name : 'no account');
  renderAccounts();
  renderLib();
  renderCapes();
  loadLibrary().then((list) => {
    library = list.filter((x) => x && x.url && x.name);
    library.forEach((s) => registerSkin(keyOf(s), s.url, { slim: s.slim, cape: s.cape }));
    renderLib();
  });

  return {
    enter() {
      viewer.start();
      poseSeg.refresh();
      syncModel();
      renderAccounts();
      renderCapes();
      reveal(root, '.rv', 50);
    },
    leave() {
      setTimeout(() => { if (!root.classList.contains('active')) viewer.stop(); }, 400);
    },
  };
}
