import { host, bindChrome } from './host.js';
import { AsciiMoon } from './ascii.js';
import { Starfield } from './stars.js';

const root = document.querySelector('.splash');
const fill = document.querySelector('.fill');
const text = document.querySelector('.status .text');
const pct = document.querySelector('.pct');

bindChrome();

new Starfield(document.querySelector('.stars'), { density: 0.00022, drift: 3 }).start();
const cube = new AsciiMoon(document.querySelector('.cube'));
cube.render();
cube.start();

const steps = [
  ['starting up', 0.14, 260],
  ['checking for updates', 0.3, 320],
  ['reading your instances', 0.48, 260],
  ['loading accounts', 0.66, 240],
  ['waking up the cat', 0.84, 260],
  ['warming up', 0.96, 220],
  ['ready', 1, 120],
];

let shown = 0;
let target = 0;
let bootSent = false;
let leaveRequested = false;
let finished = false;
let updating = false;
let creep = null;

function type(line) {
  return new Promise((resolve) => {
    let i = 0;
    text.textContent = '';
    const full = line === 'ready' ? line : line + '...';
    const tick = () => {
      i += 2 + Math.floor(Math.random() * 2);
      text.textContent = full.slice(0, i);
      if (i < full.length) setTimeout(tick, 8 + Math.random() * 8);
      else resolve();
    };
    tick();
  });
}

function animate() {
  shown += (target - shown) * 0.12;
  if (Math.abs(target - shown) < 0.001) shown = target;
  fill.style.transform = `scaleX(${shown})`;
  pct.textContent = Math.round(shown * 100);
  if (!bootSent && shown > 0.35) {
    bootSent = true;
    host.send('boot:done');
  }
  if (shown >= 1 && !finished) {
    finished = true;
    root.classList.add('done');
    maybeLeave();
  }
  requestAnimationFrame(animate);
}

function maybeLeave() {
  if (!finished || !leaveRequested || updating) return;
  setTimeout(() => {
    root.classList.add('leaving');
    setTimeout(() => {
      cube.stop();
      if (host.native) host.send('splash:left');
      else location.href = 'index.html';
    }, 480);
  }, 220);
}

host.on('update', (m) => {
  updating = true;
  type(`updating nelya to ${m.value}...`);
  target = Math.max(0.2, Math.min(target, 0.6));
  clearInterval(creep);
  creep = setInterval(() => { target = Math.min(0.94, target + (0.94 - target) * 0.06); }, 200);
});

host.on('update:done', (m) => {
  clearInterval(creep);
  type(`restarting into ${m.value}`);
  target = 1;
});

host.on('update:failed', () => {
  clearInterval(creep);
  updating = false;
  type('update can wait, starting nelya...');
  target = 1;
});

host.on('leave', () => {
  leaveRequested = true;
  maybeLeave();
});

if (!host.native) leaveRequested = true;

async function run() {
  await new Promise((r) => setTimeout(r, 450));
  requestAnimationFrame(animate);
  for (const [line, to, wait] of steps) {
    if (updating) return;
    await type(line);
    if (updating) return;
    target = to;
    await new Promise((r) => setTimeout(r, wait));
  }
}

run();
