const lines = [];
const subs = new Set();
let count = 0;

function stamp() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

export const logs = {
  lines,
  push(text, lvl = 'info', src = 'game') {
    const entry = { n: ++count, t: stamp(), text, lvl, src };
    lines.push(entry);
    if (lines.length > 3000) lines.shift();
    subs.forEach((fn) => fn(entry));
    return entry;
  },
  clear() {
    lines.length = 0;
    subs.forEach((fn) => fn(null));
  },
  on(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};

export function guessLevel(text) {
  if (/\/(ERROR|FATAL)\]|exception|failed/i.test(text)) return 'error';
  if (/\/WARN\]/.test(text)) return 'warn';
  return 'info';
}

[
  'nelya 0.1.0 starting on windows 11 x64',
  'webview runtime ready',
  'found 3 java installs: temurin 21.0.4, temurin 17.0.12, zulu 8.0.422',
  'loaded 9 instances from ~/.nelya/instances',
  'version manifest is up to date (cached 4 minutes ago)',
  'signed in as alex (microsoft)',
].forEach((t) => logs.push(t, 'info', 'launcher'));
logs.push('mod index for survival is 2 days old, refreshing in the background', 'warn', 'launcher');
