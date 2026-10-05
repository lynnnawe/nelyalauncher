export const instances = [
  { id: 'survival', name: 'survival', version: '1.21.4', loader: 'fabric', mods: 142, playtime: 86.4, last: '2 hours ago', icon: 'grass', worlds: 3, size: '2.4 gb', lat: 38, lon: -20 },
  { id: 'create', name: 'create-above', version: '1.20.1', loader: 'neoforge', mods: 211, playtime: 41.2, last: 'yesterday', icon: 'cog', worlds: 2, size: '3.1 gb', lat: 12, lon: 70 },
  { id: 'pvp', name: 'pvp', version: '1.8.9', loader: 'forge', mods: 18, playtime: 212.7, last: '3 days ago', icon: 'sword', worlds: 0, size: '410 mb', lat: -22, lon: -95 },
  { id: 'vanilla', name: 'vanilla', version: '1.21.10', loader: 'vanilla', mods: 0, playtime: 12.9, last: 'last week', icon: 'diamond', worlds: 4, size: '880 mb', lat: 52, lon: 130 },
  { id: 'skyblock', name: 'skyblock', version: '1.20.1', loader: 'forge', mods: 96, playtime: 33.1, last: '2 weeks ago', icon: 'sapling', worlds: 1, size: '1.6 gb', lat: -38, lon: 20 },
  { id: 'hardcore', name: 'hardcore', version: '1.21.4', loader: 'fabric', mods: 37, playtime: 7.5, last: '3 weeks ago', icon: 'apple', worlds: 1, size: '640 mb', lat: 4, lon: -160 },
  { id: 'build', name: 'creative-builds', version: '1.21.1', loader: 'quilt', mods: 58, playtime: 54.0, last: 'last month', icon: 'bricks', worlds: 6, size: '1.9 gb', lat: 64, lon: -60 },
  { id: 'tekkit', name: 'tekkit-classic', version: '1.7.10', loader: 'forge', mods: 74, playtime: 120.3, last: '4 months ago', icon: 'tnt', worlds: 2, size: '1.1 gb', lat: -55, lon: 150 },
  { id: 'speedrun', name: 'speedrun', version: '1.16.1', loader: 'fabric', mods: 11, playtime: 19.6, last: '5 months ago', icon: 'pearl', worlds: 41, size: '2.0 gb', lat: 25, lon: 175 },
];

export const versions = [
  { id: '1.21.10', type: 'release', date: '2025-10-07' },
  { id: '1.21.9', type: 'release', date: '2025-09-30' },
  { id: '1.21.8', type: 'release', date: '2025-07-17' },
  { id: '1.21.7', type: 'release', date: '2025-06-30' },
  { id: '1.21.5', type: 'release', date: '2025-03-25' },
  { id: '1.21.4', type: 'release', date: '2024-12-03' },
  { id: '1.21.1', type: 'release', date: '2024-08-08' },
  { id: '1.20.6', type: 'release', date: '2024-04-29' },
  { id: '1.20.4', type: 'release', date: '2023-12-07' },
  { id: '1.20.1', type: 'release', date: '2023-06-12' },
  { id: '1.19.4', type: 'release', date: '2023-03-14' },
  { id: '1.19.2', type: 'release', date: '2022-08-05' },
  { id: '1.18.2', type: 'release', date: '2022-02-28' },
  { id: '1.16.5', type: 'release', date: '2021-01-15' },
  { id: '1.16.1', type: 'release', date: '2020-06-24' },
  { id: '1.12.2', type: 'release', date: '2017-09-18' },
  { id: '1.8.9', type: 'release', date: '2015-12-09' },
  { id: '1.7.10', type: 'release', date: '2014-06-26' },
  { id: '25w41a', type: 'snapshot', date: '2025-10-08' },
  { id: '25w37a', type: 'snapshot', date: '2025-09-09' },
  { id: '25w21a', type: 'snapshot', date: '2025-05-20' },
  { id: 'b1.7.3', type: 'old', date: '2011-07-08' },
  { id: 'a1.2.6', type: 'old', date: '2010-12-03' },
  { id: 'rd-132211', type: 'old', date: '2009-05-13' },
];

export const loaders = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'];

export const mods = [
  { id: 'sodium', name: 'Sodium', author: 'jellysquid3', desc: 'A modern rendering engine that greatly improves frame rates and stutter.', downloads: 234.2, updated: '3 days ago', tags: ['optimization'], loaders: ['fabric', 'quilt', 'neoforge'] },
  { id: 'fabric-api', name: 'Fabric API', author: 'modmuss50', desc: 'Core library and hooks that most Fabric mods depend on.', downloads: 265.2, updated: '1 day ago', tags: ['library'], loaders: ['fabric'] },
  { id: 'iris', name: 'Iris Shaders', author: 'coderbot', desc: 'Shader pack loader built to work alongside Sodium.', downloads: 181.9, updated: '6 days ago', tags: ['decoration', 'optimization'], loaders: ['fabric', 'quilt', 'neoforge'] },
  { id: 'lithium', name: 'Lithium', author: 'jellysquid3', desc: 'Optimizes game physics, mob AI and block ticking without changing behaviour.', downloads: 131.4, updated: '2 weeks ago', tags: ['optimization'], loaders: ['fabric', 'quilt', 'neoforge'] },
  { id: 'create', name: 'Create', author: 'simibubi', desc: 'Rotational power, contraptions and a whole lot of brass.', downloads: 26.8, updated: '1 week ago', tags: ['technology', 'decoration'], loaders: ['forge', 'neoforge', 'fabric'] },
  { id: 'jei', name: 'Just Enough Items', author: 'mezz', desc: 'Item and recipe viewer with search and bookmarks.', downloads: 79.5, updated: '4 days ago', tags: ['utility'], loaders: ['forge', 'neoforge', 'fabric'] },
  { id: 'modmenu', name: 'Mod Menu', author: 'Prospector', desc: 'Adds a mod list screen with config access.', downloads: 148.6, updated: '1 month ago', tags: ['utility'], loaders: ['fabric', 'quilt'] },
  { id: 'xaeros-minimap', name: "Xaero's Minimap", author: 'xaero96', desc: 'Minimap with waypoints and entity radar.', downloads: 113.1, updated: '5 days ago', tags: ['utility', 'adventure'], loaders: ['fabric', 'forge', 'neoforge'] },
  { id: 'entityculling', name: 'Entity Culling', author: 'tr7zw', desc: 'Skips rendering entities and block entities you cannot see.', downloads: 172.8, updated: '3 weeks ago', tags: ['optimization'], loaders: ['fabric', 'forge', 'neoforge'] },
  { id: 'terralith', name: 'Terralith', author: 'Stardust Labs', desc: 'Nearly a hundred new biomes using only vanilla blocks.', downloads: 23.4, updated: '2 months ago', tags: ['worldgen', 'adventure'], loaders: ['fabric', 'forge', 'neoforge', 'quilt'] },
  { id: 'farmers-delight', name: "Farmer's Delight", author: 'vectorwing', desc: 'Cooking, farming and a kitchen worth building.', downloads: 24.4, updated: '2 weeks ago', tags: ['food', 'decoration'], loaders: ['forge', 'neoforge', 'fabric'] },
  { id: 'sophisticated-backpacks', name: 'Sophisticated Backpacks', author: 'P3pp3rF1y', desc: 'Upgradeable backpacks with filters and auto-pickup.', downloads: 19.1, updated: '1 week ago', tags: ['storage', 'utility'], loaders: ['forge', 'neoforge'] },
  { id: 'ferritecore', name: 'FerriteCore', author: 'malte0811', desc: 'Cuts memory usage by deduplicating block state data.', downloads: 154.8, updated: '1 month ago', tags: ['optimization'], loaders: ['fabric', 'forge', 'neoforge', 'quilt'] },
  { id: 'appleskin', name: 'AppleSkin', author: 'squeek502', desc: 'Shows hunger and saturation values on food.', downloads: 91.9, updated: '3 months ago', tags: ['utility', 'food'], loaders: ['fabric', 'forge', 'neoforge'] },
  { id: 'waystones', name: 'Waystones', author: 'BlayTheNinth', desc: 'Teleport between discovered waystones across your world.', downloads: 25.9, updated: '2 weeks ago', tags: ['adventure', 'magic'], loaders: ['fabric', 'forge', 'neoforge'] },
  { id: 'distant-horizons', name: 'Distant Horizons', author: 'jeseibel', desc: 'Level of detail rendering for very long view distances.', downloads: 35.6, updated: '4 days ago', tags: ['optimization', 'decoration'], loaders: ['fabric', 'forge', 'neoforge'] },
];

export const accounts = [
  { id: 'alex', name: 'alex', type: 'microsoft', active: true, skin: 'alex' },
  { id: 'alt', name: 'alex_alt', type: 'microsoft', active: false, skin: 'wanderer' },
];

export const javas = [
  { id: 'j21', name: 'temurin 21.0.4', path: '~/.nelya/runtime/java-21', arch: 'x64', auto: true },
  { id: 'j17', name: 'temurin 17.0.12', path: '~/.nelya/runtime/java-17', arch: 'x64', auto: true },
  { id: 'j8', name: 'zulu 8.0.422', path: 'C:/Program Files/Zulu/zulu-8', arch: 'x64', auto: false },
];

export const notifications = [
  { title: 'nelya 0.1.1 is available', body: 'smaller downloads and faster instance imports', time: '2h', kind: 'update' },
  { title: '4 mod updates for survival', body: 'sodium, iris, lithium and modmenu', time: '5h', kind: 'mods' },
  { title: 'skyblock exited with code 0', body: 'played for 1h 12m', time: '2w', kind: 'game' },
];

export const worldNames = ['spawn island', 'the long winter', 'creative flat', 'nether hub test', 'seed 8127341972', 'river base'];

export function relTime(ms) {
  if (!ms) return 'never';
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' minutes ago';
  if (s < 7200) return '1 hour ago';
  if (s < 86400) return Math.round(s / 3600) + ' hours ago';
  if (s < 172800) return 'yesterday';
  if (s < 604800) return Math.round(s / 86400) + ' days ago';
  if (s < 1209600) return 'last week';
  if (s < 2592000) return Math.round(s / 604800) + ' weeks ago';
  if (s < 5184000) return 'last month';
  if (s < 31536000) return Math.round(s / 2592000) + ' months ago';
  return Math.round(s / 31536000) + ' years ago';
}

export function fmtBytes(n) {
  if (n == null) return '...';
  if (n < 1024) return n + ' b';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' kb';
  if (n < 1073741824) return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' mb';
  return (n / 1073741824).toFixed(1) + ' gb';
}

export function normalize(raw) {
  return {
    ...raw,
    mods: raw.mods || 0,
    worlds: raw.worlds || 0,
    playtimeSec: raw.playtime || 0,
    playtime: (raw.playtime || 0) / 3600,
    last: relTime(raw.lastPlayed),
    size: raw.sizeText || '...',
    settings: raw.settings || {},
  };
}

export function replaceAll(target, items) {
  target.length = 0;
  items.forEach((x) => target.push(x));
}

export function hoursSincePlayed(inst) {
  if (inst.lastPlayed !== undefined) return inst.lastPlayed ? (Date.now() - inst.lastPlayed) / 3600000 : Infinity;
  const t = String(inst.last || 'never').toLowerCase();
  if (t === 'never') return Infinity;
  if (t === 'just now') return 0;
  if (t === 'yesterday') return 24;
  if (t === 'last week') return 168;
  if (t === 'last month') return 720;
  const m = t.match(/(\d+)\s*(minute|hour|day|week|month|year)/);
  if (!m) return Infinity;
  const per = { minute: 1 / 60, hour: 1, day: 24, week: 168, month: 720, year: 8760 }[m[2]];
  return +m[1] * per;
}
