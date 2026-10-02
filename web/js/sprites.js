const SPRITES = {
  grass: {
    map: ['GGGGGGGG', 'GgGGGgGG', 'gDgGDgDg', 'DDdDDDdD', 'DdDDDDDD', 'DDDDdDDD', 'dDDDDDdD', 'DDdDDDDD'],
    pal: { G: '#7cbf5a', g: '#5a9a3f', D: '#8a6542', d: '#634832' },
  },
  diamond: {
    map: ['........', '..wccc..', '.wCCCcc.', 'wCCCCCCc', '.cCCCCc.', '..cCCc..', '...cc...', '........'],
    pal: { w: '#e8fffd', C: '#74e3d8', c: '#2f9e98' },
  },
  sword: {
    map: ['.......w', '......wS', '.....wS.', '..h.wS..', '...hS...', '...bh...', '..b..h..', '.b......'],
    pal: { w: '#ffffff', S: '#b9c6d8', h: '#8a6a3a', b: '#4e3620' },
  },
  pickaxe: {
    map: ['.cccc...', 'c....c..', '.....hc.', '....h..c', '...h....', '..h.....', '.h......', 'h.......'],
    pal: { c: '#9fd8f0', h: '#8a6040' },
  },
  apple: {
    map: ['....s...', '...s....', '.rrrRrr.', 'rrwrrrrr', 'rwrrrrrr', 'rrrrrrrd', '.rrrrrd.', '..rrdd..'],
    pal: { r: '#d04848', R: '#8a2a2a', w: '#f4a7a7', d: '#8f2c2c', s: '#6b4423' },
  },
  tnt: {
    map: ['RrRrRrRr', 'rRrRrRrR', 'wwwwwwww', 'kkwkwwkk', 'wkwkkwkw', 'wwwwwwww', 'RrRrRrRr', 'rRrRrRrR'],
    pal: { R: '#c83b3b', r: '#9e2a2a', w: '#e8e4dc', k: '#2a2a2a' },
  },
  chest: {
    map: ['.oooooo.', 'oOOOOOOo', 'oOOOOOOo', 'kkkyykkk', 'oOOyyOOo', 'oOOOOOOo', 'oOOOOOOo', '.oooooo.'],
    pal: { o: '#6b4520', O: '#a5702f', k: '#3b2610', y: '#e0c040' },
  },
  pearl: {
    map: ['..cccc..', '.cCCCCc.', 'cCwwCCCc', 'cCwCCCCc', 'cCCCCCCc', 'cCCCCCdc', '.cCCCdc.', '..cccc..'],
    pal: { c: '#0e3b38', C: '#2a8a7f', w: '#a6f0e0', d: '#1b5e57' },
  },
  cog: {
    map: ['...gg...', '.g.gg.g.', '..gggg..', 'gggddggg', 'gggddggg', '..gggg..', '.g.gg.g.', '...gg...'],
    pal: { g: '#c8b27a', d: '#2a2620' },
  },
  bricks: {
    map: ['rrrmrrrr', 'rrrmrrrr', 'mmmmmmmm', 'rmrrrrmr', 'rmrrrrmr', 'mmmmmmmm', 'rrrmrrrr', 'rrrmrrrr'],
    pal: { r: '#a0503c', m: '#cfc6ba' },
  },
  sapling: {
    map: ['...ll...', '..lLLl..', '.lLlLLl.', '..lLLl..', '...tl...', '...t....', '..dtd...', '.dddd...'],
    pal: { l: '#4f9a3a', L: '#7cc35a', t: '#7a5534', d: '#5e442b' },
  },
  book: {
    map: ['.bbbbbb.', 'bpppppbw', 'bpwwwpbw', 'bpppppbw', 'bpwwwpbw', 'bpppppbw', 'bbbbbbbw', '.wwwwwww'],
    pal: { b: '#5a2e4e', p: '#8a4a8e', w: '#e6dccb' },
  },
  eye: {
    map: ['..gggg..', '.gGGGGg.', 'gGGkkGGg', 'gGkkkkGg', 'gGkkkkGg', 'gGGkkGGg', '.gGGGGg.', '..gggg..'],
    pal: { g: '#1f5a3a', G: '#5fbf7a', k: '#0c1a12' },
  },
  bed: {
    map: ['........', '........', 'wwwrrrrr', 'wwwrrrrr', 'pppppppp', 'p......p', 'p......p', '........'],
    pal: { w: '#efe9e0', r: '#b8403e', p: '#7a5534' },
  },
  emerald: {
    map: ['...gg...', '..gGGg..', '.gGwGGg.', 'gGwGGGGg', 'gGGGGGGg', '.gGGGGg.', '..gGGg..', '...gg...'],
    pal: { g: '#1f8f4a', G: '#3fd47a', w: '#c8ffd8' },
  },
  gold: {
    map: ['........', '........', '...yyyy.', '..yYwYYy', '.yYYYYy.', 'yyyyyy..', '........', '........'],
    pal: { y: '#b88a1c', Y: '#f2c94c', w: '#fff2b0' },
  },
  potion: {
    map: ['...cc...', '...ww...', '..w..w..', '.wppppw.', 'wpPppPpw', 'wppppppw', '.wppppw.', '..wwww..'],
    pal: { c: '#8a5a3a', w: '#d8e4ee', p: '#b04ad8', P: '#e7a0ff' },
  },
  creeper: {
    map: ['gggggggg', 'gkkggkkg', 'gkkggkkg', 'gggkkggg', 'ggkkkkgg', 'ggkkkkgg', 'ggkggkgg', 'gggggggg'],
    pal: { g: '#5fae4c', k: '#1a2a16' },
  },
  slime: {
    map: ['.ssssss.', 'sSSSSSSs', 'sSkSSkSs', 'sSSSSSSs', 'sSSSkSSs', 'sSSSSSSs', 'sSSSSSSs', '.ssssss.'],
    pal: { s: '#4f9a3a', S: '#8be06a', k: '#2a5a20' },
  },
  cake: {
    map: ['........', '..r..r..', '.wwwwww.', 'wWwWwWww', 'bbbbbbbb', 'bRbbRbbb', 'bbbbbbbb', '........'],
    pal: { r: '#e04040', w: '#f4f0e8', W: '#e8c8c8', b: '#b07040', R: '#d04848' },
  },
  lantern: {
    map: ['...kk...', '..kkkk..', '.kyyyyk.', '.kyYYyk.', '.kyYYyk.', '.kyyyyk.', '..kkkk..', '........'],
    pal: { k: '#3a3a44', y: '#e0a030', Y: '#ffe080' },
  },
  heart: {
    map: ['........', '.rr..rr.', 'rRrrrrrr', 'rRrrrrrr', '.rrrrrr.', '..rrrr..', '...rr...', '........'],
    pal: { r: '#d83a4a', R: '#ffa0a8' },
  },
  mushroom: {
    map: ['..rrrr..', '.rwrrwr.', 'rrrrrrwr', 'rwrrrrrr', '...ss...', '...ss...', '..ssss..', '........'],
    pal: { r: '#d03a30', w: '#f4f0e8', s: '#e8dcc4' },
  },
  fish: {
    map: ['........', '...oo...', 'o.oooo..', 'ooOOOOko', 'ooOOOOOo', 'o.oooo..', '...oo...', '........'],
    pal: { o: '#3a8ab0', O: '#7cc4e0', k: '#102030' },
  },
  compass: {
    map: ['..gggg..', '.gwwwwg.', 'gwwrwwwg', 'gwwrwwwg', 'gwwkwwwg', 'gwwkwwwg', '.gwwwwg.', '..gggg..'],
    pal: { g: '#a0a0a8', w: '#e8e8e0', r: '#d03030', k: '#303038' },
  },
  star: {
    map: ['...y....', '..yYy...', 'yyYwYyy.', '.yYYYy..', '.yy.yy..', '.y...y..', '........', '........'],
    pal: { y: '#e0b030', Y: '#ffe080', w: '#fffbe0' },
  },
  flower: {
    map: ['........', '..p.p...', '.pPpPp..', '..pyp...', '.pPpPp..', '..p.p...', '...g....', '..gg....'],
    pal: { p: '#c060c0', P: '#f0a0f0', y: '#ffd040', g: '#4f9a3a' },
  },
  moon: {
    map: ['..llll..', '.lLL....', 'lLL.....', 'lLL.....', 'lLL.....', 'lLLL....', '.lLLLll.', '..llll..'],
    pal: { l: '#7f70d0', L: '#c3b8ff' },
  },
};

const cache = new Map();

export const spriteNames = Object.keys(SPRITES);

export function sprite(name, scale = 4) {
  const key = name + '@' + scale;
  if (cache.has(key)) return cache.get(key);
  const s = SPRITES[name] || SPRITES.grass;
  const c = document.createElement('canvas');
  c.width = 8 * scale;
  c.height = 8 * scale;
  const ctx = c.getContext('2d');
  s.map.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = s.pal[ch];
      ctx.fillRect(x * scale, y * scale, scale, scale);
    });
  });
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TONES = [
  ['#2a2738', '#9d8cf0', '#d9d2ff'],
  ['#232a2a', '#7fb8a8', '#d4efe6'],
  ['#2d2723', '#d0a77a', '#f3e1c9'],
  ['#2a2329', '#d08aa6', '#f5d6e2'],
  ['#22262e', '#86a3d6', '#d6e2f7'],
  ['#262626', '#b5b5b5', '#efefef'],
];

export function identicon(seed, scale = 5) {
  const key = 'id:' + seed + '@' + scale;
  if (cache.has(key)) return cache.get(key);
  const rnd = seeded(seed);
  const [bg, fg, hi] = TONES[Math.floor(rnd() * TONES.length)];
  const c = document.createElement('canvas');
  c.width = 8 * scale;
  c.height = 8 * scale;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  for (let y = 1; y < 7; y++) {
    for (let x = 1; x < 4; x++) {
      const r = rnd();
      if (r < 0.48) continue;
      ctx.fillStyle = r > 0.86 ? hi : fg;
      ctx.fillRect(x * scale, y * scale, scale, scale);
      ctx.fillRect((7 - x) * scale, y * scale, scale, scale);
    }
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function landscape(seed, w = 320, h = 180) {
  const key = 'ls:' + seed + w + 'x' + h;
  if (cache.has(key)) return cache.get(key);
  const rnd = seeded(seed);
  const px = 4;
  const cols = Math.ceil(w / px), rows = Math.ceil(h / px);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const night = rnd() < 0.4;
  const sky = night ? ['#0d0b18', '#1d1934'] : ['#7d8fc4', '#c5b8e8'];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, sky[0]);
  g.addColorStop(1, sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (night) {
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(230,225,255,${0.3 + rnd() * 0.6})`;
      ctx.fillRect(Math.floor(rnd() * cols) * px, Math.floor(rnd() * rows * 0.5) * px, px / 2, px / 2);
    }
    ctx.fillStyle = '#e9e4ff';
    ctx.fillRect(Math.floor(cols * (0.6 + rnd() * 0.3)) * px, px * 5, px * 3, px * 3);
  } else {
    ctx.fillStyle = '#fff6d8';
    ctx.fillRect(Math.floor(cols * (0.1 + rnd() * 0.3)) * px, px * 4, px * 4, px * 4);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 0; i < 4; i++) {
      const cx = Math.floor(rnd() * cols), cy = 3 + Math.floor(rnd() * 8), cw = 6 + Math.floor(rnd() * 10);
      ctx.fillRect(cx * px, cy * px, cw * px, px * 2);
      ctx.fillRect((cx + 2) * px, (cy - 1) * px, (cw - 4) * px, px);
    }
  }
  const layers = night
    ? [['#2a2545', 0.42], ['#1a1730', 0.56], ['#100e1e', 0.7]]
    : [['#8e8fb8', 0.45], ['#5b7a5a', 0.58], ['#3f5f3c', 0.72]];
  layers.forEach(([color, base], li) => {
    let y = base * rows + (rnd() - 0.5) * 6;
    const rough = 0.6 + li * 0.5;
    for (let x = 0; x < cols; x++) {
      y += (rnd() - 0.5) * rough * 2;
      y = Math.max(rows * 0.3, Math.min(rows * 0.9, y));
      const top = Math.round(y);
      ctx.fillStyle = color;
      ctx.fillRect(x * px, top * px, px, h - top * px);
      if (li === 2 && !night) {
        ctx.fillStyle = '#6d9a4a';
        ctx.fillRect(x * px, top * px, px, px);
      }
      if (li === 2 && rnd() < 0.05) {
        ctx.fillStyle = night ? '#0c0a17' : '#2c4a2a';
        const th = 3 + Math.floor(rnd() * 3);
        ctx.fillRect(x * px, (top - th) * px, px, th * px);
        ctx.fillRect((x - 1) * px, (top - th - 2) * px, px * 3, px * 2);
      }
    }
  });
  if (rnd() < 0.5) {
    ctx.fillStyle = night ? 'rgba(40,40,90,.85)' : 'rgba(70,110,170,.85)';
    ctx.fillRect(0, Math.floor(rows * 0.86) * px, w, h);
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function instIcon(inst, scale = 4) {
  const ic = inst && inst.icon;
  if (ic && ic.startsWith('data:')) return ic;
  return sprite(ic, scale);
}

const MOD_ICONS = {
  'sodium': 'sodium', 'fabric api': 'fabric-api', 'fabric-api': 'fabric-api', 'iris shaders': 'iris', 'iris': 'iris',
  'lithium': 'lithium', 'create': 'create', 'just enough items': 'jei', 'jei': 'jei', 'mod menu': 'modmenu', 'modmenu': 'modmenu',
  "xaero's minimap": 'xaeros-minimap', 'xaeros-minimap': 'xaeros-minimap', 'entity culling': 'entityculling', 'entityculling': 'entityculling',
  'terralith': 'terralith', "farmer's delight": 'farmers-delight', 'farmers-delight': 'farmers-delight',
  'sophisticated backpacks': 'sophisticated-backpacks', 'sophisticated-backpacks': 'sophisticated-backpacks',
  'sophisticated core': 'sophisticated-core', 'sophisticated-core': 'sophisticated-core', 'ferritecore': 'ferrite-core',
  'appleskin': 'appleskin', 'waystones': 'waystones', 'distant horizons': 'distanthorizons', 'distant-horizons': 'distanthorizons',
  'cloth config': 'cloth-config', 'architectury': 'architectury-api', 'yacl': 'yacl', 'continuity': 'continuity', 'indium': 'indium',
  'zoomify': 'zoomify', 'krypton': 'krypton', 'immediatelyfast': 'immediatelyfast', 'enhanced block entities': 'ebe',
  'dynamic fps': 'dynamic-fps', 'betterf3': 'betterf3', 'chat heads': 'chat-heads', 'jade': 'jade', 'mouse tweaks': 'mouse-tweaks',
  'inventory profiles': 'inventory-profiles-next', 'controlling': 'controlling', 'balm': 'balm',
};

export const UNKNOWN = 'img/unknown.svg';

export function modIcon(key, scale = 4) {
  const slug = MOD_ICONS[String(key).toLowerCase()];
  return slug ? `img/mods/${slug}.png` : UNKNOWN;
}
