import { AsciiMoon } from './ascii.js';
import { Starfield } from './stars.js';

const wv = window.chrome && window.chrome.webview;
const send = (...parts) => wv && wv.postMessage(parts.join('|'));
const $ = (s) => document.querySelector(s);

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'install';
const version = params.get('version') || '0.0.0';
const installed = params.get('installed') || '';
let dir = params.get('dir') || '';

const root = $('.setup');
root.classList.add('first');
setTimeout(() => root.classList.remove('first'), 1600);

new Starfield($('.stars'), { density: 0.00024, drift: 3 }).start();
const moon = new AsciiMoon($('.moon'));
moon.render();
moon.start();

$('#corner').textContent = 'nelya ' + version;

const pretty = (p) => p.replace(/^[a-z]:\\users\\[^\\]+\\appdata\\local\\/i, '%localappdata%\\').replace(/^[a-z]:\\users\\[^\\]+\\/i, '~\\');

function show(step) {
  document.querySelectorAll('.step').forEach((s) => s.classList.toggle('on', s.dataset.step === step));
}

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || e.target.closest('button, label, input, .path')) return;
  send('drag');
});
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => send(b.dataset.act)));

const fill = $('.fill');
const text = $('.status .text');
const pct = $('.pct');
let shown = 0;
let target = 0;
let typing = null;

function type(line) {
  clearTimeout(typing);
  let i = 0;
  const tick = () => {
    i += 2 + Math.floor(Math.random() * 2);
    text.textContent = line.slice(0, i);
    if (i < line.length) typing = setTimeout(tick, 9 + Math.random() * 9);
  };
  tick();
}

function animate() {
  shown += (target - shown) * 0.1;
  if (Math.abs(target - shown) < 0.001) shown = target;
  fill.style.transform = `scaleX(${shown})`;
  pct.textContent = Math.round(shown * 100);
  requestAnimationFrame(animate);
}
animate();

function work(title, sub) {
  shown = 0;
  target = 0.01;
  $('#work-title').textContent = title;
  $('#work-sub').textContent = sub;
  $('#work-actions').innerHTML = '';
  root.classList.remove('done', 'failed', 'removed');
  moon.speed = 2.4;
  show('work');
}

function actions(...buttons) {
  const box = $('#work-actions');
  box.innerHTML = '';
  buttons.forEach(([label, cls, fn]) => {
    const b = document.createElement('button');
    b.className = 'btn ' + cls;
    b.textContent = label;
    b.addEventListener('click', fn);
    box.appendChild(b);
  });
}

let lastInstall = null;

if (mode === 'uninstall') {
  $('#uninstall-sub').textContent = `removes nelya ${installed || version}. your worlds and instances stay unless you tick the box below.`;
  $('#uninstall-where').textContent = pretty(dir);
  $('#uninstall-where').title = dir;
  show('uninstall');
  $('#go-uninstall').addEventListener('click', () => {
    work('uninstalling', 'putting everything away');
    send('uninstall', $('#opt-wipe').checked ? '1' : '0');
  });
} else {
  const sub = $('#install-sub');
  if (installed && installed === version) sub.textContent = `nelya ${version} is already installed, this reinstalls it`;
  else if (installed) sub.textContent = `updates nelya ${installed} to ${version}, your instances stay put`;
  else sub.textContent = `a minecraft launcher, version ${version}`;
  $('#go-install').textContent = installed && installed !== version ? 'update' : installed ? 'reinstall' : 'install';
  const drawDir = () => ($('#dir').textContent = pretty(dir));
  drawDir();
  $('#browse').addEventListener('click', () => send('browse', dir));
  const start = () => {
    lastInstall = [dir, $('#opt-desktop').checked ? '1' : '0', $('#opt-start').checked ? '1' : '0', $('#opt-launch').checked ? '1' : '0'];
    work(installed ? 'updating' : 'installing', pretty(dir));
    send('install', ...lastInstall);
  };
  $('#go-install').addEventListener('click', start);
  show('install');
  if (wv) wv.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'dir') {
      dir = e.data.text;
      drawDir();
    }
  });
}

if (wv) wv.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'progress') {
    if (typeof m.pct === 'number') target = Math.max(target, m.pct);
    if (m.text && m.text !== 'done') type(m.text + '...');
  }
  if (m.type === 'done') {
    target = 1;
    moon.speed = 1;
    if (mode === 'uninstall') {
      root.classList.add('removed');
      type('nelya was removed, see you around');
      $('#work-title').textContent = 'all gone';
      $('#work-sub').textContent = $('#opt-wipe').checked ? 'your instances and settings were deleted too' : 'your instances are still in %appdata%\\nelya';
      actions(['close', 'ghost', () => send('close')]);
    } else {
      root.classList.add('done');
      type('nelya is ready');
      $('#work-title').textContent = 'all set';
      const launching = lastInstall && lastInstall[3] === '1';
      actions(['open nelya', 'primary', () => send('open')], ['close', 'ghost', () => send('close')]);
      $('#work-sub').textContent = launching ? 'opening nelya for you' : 'it lives in ' + pretty(lastInstall ? lastInstall[0] : dir);
    }
  }
  if (m.type === 'error') {
    root.classList.add('failed');
    moon.speed = 0.4;
    type(m.text || 'something went wrong');
    $('#work-title').textContent = 'that did not work';
    actions(
      ['try again', 'primary', () => {
        if (mode === 'uninstall') {
          work('uninstalling', 'putting everything away');
          send('uninstall', $('#opt-wipe').checked ? '1' : '0');
        } else if (lastInstall) {
          work('installing', pretty(lastInstall[0]));
          send('install', ...lastInstall);
        }
      }],
      ['close', 'ghost', () => send('close')],
    );
  }
});
