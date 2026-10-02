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
  ['probing java runtimes', 0.12, 300],
  ['found temurin 21.0.4 at ~/.nelya/runtime', 0.24, 220],
  ['reading ~/.nelya/instances', 0.4, 260],
  ['fetching version manifest', 0.57, 300],
  ['verifying asset index 26', 0.72, 260],
  ['loading accounts', 0.85, 200],
  ['warming up', 0.96, 240],
  ['ready', 1, 120],
];

let shown = 0;
let target = 0;
let bootSent = false;
let leaveRequested = false;
let finished = false;

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
  if (!finished || !leaveRequested) return;
  setTimeout(() => {
    root.classList.add('leaving');
    setTimeout(() => {
      cube.stop();
      if (host.native) host.send('splash:left');
      else location.href = 'index.html';
    }, 480);
  }, 220);
}

host.on('leave', () => {
  leaveRequested = true;
  maybeLeave();
});

if (!host.native) leaveRequested = true;

async function run() {
  await new Promise((r) => setTimeout(r, 450));
  requestAnimationFrame(animate);
  for (const [line, to, wait] of steps) {
    await type(line);
    target = to;
    await new Promise((r) => setTimeout(r, wait));
  }
}

run();
