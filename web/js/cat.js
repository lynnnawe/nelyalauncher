import { h } from './ui.js';

const FUR = '#1e1c24';
const FUR_SHADE = '#141218';
const STRIPE = '#2e2b37';
const LINE = '#56506a';
const PINK = '#c9788c';
const EYE = '#f4c84a';

const SVG = `
<svg class="cat-svg" viewBox="0 0 120 96" aria-hidden="true">
  <g class="ct-tail" style="transform-origin:90px 63px">
    <path d="M88 62 C95 62 97.6 66 97.6 72" stroke="${FUR_SHADE}" stroke-width="6.4" stroke-linecap="round" fill="none"/>
    <path d="M88 62 C95 62 97.6 66 97.6 72" stroke="${FUR}" stroke-width="5" stroke-linecap="round" fill="none"/>
    <g class="ct-tip" style="transform-origin:97.6px 71px">
      <path d="M97.6 71 C97.6 79 97.2 85 99.4 89.4 C100.6 91.8 103.4 92 104.4 89.6" stroke="${FUR_SHADE}" stroke-width="6.4" stroke-linecap="round" fill="none"/>
      <path d="M97.6 71 C97.6 79 97.2 85 99.4 89.4 C100.6 91.8 103.4 92 104.4 89.6" stroke="${FUR}" stroke-width="5" stroke-linecap="round" fill="none"/>
      <path d="M95.6 76.6 l4 -0.6 M95.4 82 l4 -0.4 M96.4 87.2 l3.6 -1.2" stroke="${STRIPE}" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
    </g>
  </g>
  <g class="ct-body" style="transform-origin:60px 66px">
    <path d="M27 66 C25 50 36 38.4 58 37.4 C80 36.4 94 46 94 59.6 C94 63.6 93 66 89.6 66 Z" fill="${FUR}"/>
    <path d="M30 66 C31 61 36 58.6 44 58.4 L80 58 C86 58 91 61 92.6 66 Z" fill="${FUR_SHADE}" opacity="0.55"/>
    <path d="M64 40 C66 44 66 48 64.4 51 M72 40.4 C74.4 44.4 74.6 48.4 73 51.6 M80 43 C82.4 46.6 82.8 50.4 81.4 53.6" stroke="${STRIPE}" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.75"/>
    <path d="M70 66 C70 58.6 76 54.4 83 55.6 C88.4 56.6 91 61 90.4 66 Z" fill="${FUR}"/>
    <path d="M73 60.6 C75.6 58 80 57.6 83.6 59.2" stroke="${LINE}" stroke-width="0.8" stroke-linecap="round" fill="none" opacity="0.55"/>
    <path d="M30 66 C29.4 61.6 32 59.4 36.4 59.4 C40.8 59.4 43.4 61.6 42.8 66 Z" fill="${FUR}" stroke="${LINE}" stroke-width="0.6" stroke-opacity="0.5"/>
    <path d="M41.6 66 C41 61.6 43.6 59.4 48 59.4 C52.4 59.4 55 61.6 54.4 66 Z" fill="${FUR}" stroke="${LINE}" stroke-width="0.6" stroke-opacity="0.5"/>
    <path d="M34.4 66 v-2.2 M38.4 66 v-2.2 M46 66 v-2.2 M50 66 v-2.2" stroke="${LINE}" stroke-width="0.6" stroke-linecap="round" opacity="0.6"/>
  </g>
  <g class="ct-head-wrap">
   <g class="ct-pose">
    <g class="ct-head" style="transform-origin:38px 50px">
      <g class="ct-ear ct-ear-l" style="transform-origin:26px 26px">
        <path d="M21.6 31 C20.4 23 20.6 16.6 22.8 13.2 C24.2 12.4 30 17 33.4 22.4 Z" fill="${FUR}"/>
        <path d="M23.4 27.6 C23 22.6 23.4 18.4 24.4 16.6 C25.8 17.6 28.6 20.2 30.4 22.8 Z" fill="${PINK}"/>
      </g>
      <g class="ct-ear ct-ear-r" style="transform-origin:50px 26px">
        <path d="M54.4 31 C55.6 23 55.4 16.6 53.2 13.2 C51.8 12.4 46 17 42.6 22.4 Z" fill="${FUR}"/>
        <path d="M52.6 27.6 C53 22.6 52.6 18.4 51.6 16.6 C50.2 17.6 47.4 20.2 45.6 22.8 Z" fill="${PINK}"/>
      </g>
      <path d="M19 39 C19 27.4 27 20.6 38 20.6 C49 20.6 57 27.4 57 39 C57 44.4 54.6 48 51.6 50 L54.6 51.4 L49.4 52 C46 53.4 42 54 38 54 C34 54 30 53.4 26.6 52 L21.4 51.4 L24.4 50 C21.4 48 19 44.4 19 39 Z" fill="${FUR}"/>
      <path d="M33.6 23 C34 26.4 34.4 28.4 35.4 30 M38 22.2 L38 28.6 M42.4 23 C42 26.4 41.6 28.4 40.6 30" stroke="${STRIPE}" stroke-width="1.4" stroke-linecap="round" fill="none" opacity="0.8"/>
      <path d="M19.6 36 l4 0.8 M19.4 40 l3.8 0.2 M56.4 36 l-4 0.8 M56.6 40 l-3.8 0.2" stroke="${STRIPE}" stroke-width="1.1" stroke-linecap="round" opacity="0.7"/>
      <g class="ct-eyes">
        <g class="ct-eye" style="transform-origin:30.6px 39px">
          <g class="ct-open">
            <ellipse cx="30.6" cy="39" rx="3.9" ry="4.3" fill="${EYE}"/>
            <ellipse cx="30.6" cy="39" rx="3.9" ry="4.3" fill="none" stroke="#9a6a12" stroke-width="0.5"/>
            <g class="ct-look"><ellipse class="ct-pupil" cx="30.6" cy="39.2" rx="1.2" ry="3.4" fill="#1d1a22"/></g>
            <circle cx="29.2" cy="37.4" r="1.1" fill="#fff"/>
            <circle cx="32" cy="41" r="0.5" fill="#fff" opacity="0.8"/>
          </g>
          <path class="ct-shut" d="M26.8 39.6 Q30.6 42.6 34.4 39.6" stroke="#b6b0c6" stroke-width="1.3" stroke-linecap="round" fill="none"/>
          <path class="ct-happy" d="M27 40.6 Q30.6 36.6 34.2 40.6" stroke="#b6b0c6" stroke-width="1.3" stroke-linecap="round" fill="none"/>
        </g>
        <g class="ct-eye" style="transform-origin:45.4px 39px">
          <g class="ct-open">
            <ellipse cx="45.4" cy="39" rx="3.9" ry="4.3" fill="${EYE}"/>
            <ellipse cx="45.4" cy="39" rx="3.9" ry="4.3" fill="none" stroke="#9a6a12" stroke-width="0.5"/>
            <g class="ct-look"><ellipse class="ct-pupil" cx="45.4" cy="39.2" rx="1.2" ry="3.4" fill="#1d1a22"/></g>
            <circle cx="44" cy="37.4" r="1.1" fill="#fff"/>
            <circle cx="46.8" cy="41" r="0.5" fill="#fff" opacity="0.8"/>
          </g>
          <path class="ct-shut" d="M41.6 39.6 Q45.4 42.6 49.2 39.6" stroke="#b6b0c6" stroke-width="1.3" stroke-linecap="round" fill="none"/>
          <path class="ct-happy" d="M41.8 40.6 Q45.4 36.6 49 40.6" stroke="#b6b0c6" stroke-width="1.3" stroke-linecap="round" fill="none"/>
        </g>
      </g>
      
      
      <path d="M36.4 44 L39.6 44 L38 45.8 Z" fill="${PINK}" stroke="#a85c70" stroke-width="0.4" stroke-linejoin="round"/>
      <path d="M38 45.8 v1 M38 46.8 Q36.8 48.4 35.2 47.4 M38 46.8 Q39.2 48.4 40.8 47.4" stroke="${LINE}" stroke-width="0.7" stroke-linecap="round" fill="none"/>
      <path d="M25.6 44 L15 42.4 M25.4 46 L15.2 46.6 M50.4 44 L61 42.4 M50.6 46 L60.8 46.6" stroke="#ffffff" stroke-width="0.5" stroke-linecap="round" opacity="0.55"/>
    </g>
   </g>
  </g>
  <rect class="ct-hit" x="16" y="10" width="80" height="56" rx="18"/>
</svg>`;

const HEART = '<svg viewBox="0 0 12 11" width="11" height="10"><path d="M6 10.4 C2.6 7.8 0.6 6 0.6 3.6 C0.6 1.8 2 0.6 3.5 0.6 C4.6 0.6 5.4 1.2 6 2.1 C6.6 1.2 7.4 0.6 8.5 0.6 C10 0.6 11.4 1.8 11.4 3.6 C11.4 6 9.4 7.8 6 10.4 Z"/></svg>';

const rand = (a, b) => a + Math.random() * (b - a);

export function createCat(on = true) {
  const el = h('div', { class: 'cat', html: SVG });
  const q = (s) => el.querySelector(s);
  const parts = {
    svg: q('.cat-svg'),
    body: q('.ct-body'),
    head: q('.ct-head'),
    eyes: [...el.querySelectorAll('.ct-eye')],
    looks: [...el.querySelectorAll('.ct-look')],
    ears: [...el.querySelectorAll('.ct-ear')],
  };
  const timers = {};
  const gaze = { x: 0, y: 0, tx: 0, ty: 0, raf: 0 };
  let asleep = false;

  const later = (key, ms, fn) => {
    clearTimeout(timers[key]);
    timers[key] = setTimeout(fn, ms);
  };
  const flag = (name, ms) => {
    el.classList.add(name);
    later(name, ms, () => el.classList.remove(name));
  };
  const busy = () => document.hidden || el.hidden || !el.isConnected;

  const blink = () => {
    if (asleep || el.matches('.purr')) return;
    parts.eyes.forEach((e) => e.animate(
      [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.08)', offset: 0.35 }, { transform: 'scaleY(0.08)', offset: 0.6 }, { transform: 'scaleY(1)' }],
      { duration: Math.random() < 0.3 ? 900 : 260, easing: 'ease-in-out' },
    ));
  };

  const twitch = () => {
    const ear = parts.ears[Math.random() < 0.5 ? 0 : 1];
    const dir = ear.classList.contains('ct-ear-l') ? -1 : 1;
    ear.animate(
      [{ transform: 'rotate(0deg)' }, { transform: `rotate(${dir * 16}deg)`, offset: 0.25 }, { transform: `rotate(${dir * -4}deg)`, offset: 0.55 }, { transform: 'rotate(0deg)' }],
      { duration: 420, easing: 'ease-out', composite: 'add' },
    );
  };

  const zzz = () => {
    if (!asleep) return;
    if (!busy()) {
      const z = h('span', { class: 'ct-z', text: 'z' });
      z.style.left = rand(42, 52) + 'px';
      z.style.fontSize = rand(9, 12).toFixed(1) + 'px';
      el.appendChild(z);
      setTimeout(() => z.remove(), 2600);
    }
    later('z', rand(1100, 1700), zzz);
  };

  const sleep = () => {
    if (asleep || el.matches(':hover') || el.closest('.play-seat:hover')) return later('cycle', 4000, sleep);
    asleep = true;
    el.classList.add('asleep');
    gaze.tx = 0;
    gaze.ty = 0;
    track();
    later('z', 1400, zzz);
    later('cycle', rand(22000, 50000), () => wake(false));
  };

  const wake = (startled) => {
    if (!asleep) return;
    asleep = false;
    el.classList.remove('asleep');
    clearTimeout(timers.z);
    if (startled) {
      parts.svg.animate(
        [{ transform: 'scale(1, 1)' }, { transform: 'scale(1.08, 0.92)', offset: 0.3 }, { transform: 'scale(0.97, 1.04)', offset: 0.65 }, { transform: 'scale(1, 1)' }],
        { duration: 700, easing: 'ease-in-out' },
      );
      twitch();
    } else {
      later('yawn', 500, () => flag('yawn', 1300));
    }
    later('cycle', rand(25000, 45000), sleep);
  };

  const idle = () => {
    later('idle', rand(2600, 6200), () => {
      if (!busy()) {
        if (asleep) {
          if (Math.random() < 0.35) twitch();
        } else if (Math.random() < 0.6) blink();
        else twitch();
      }
      idle();
    });
  };

  function track() {
    gaze.x += (gaze.tx - gaze.x) * 0.1;
    gaze.y += (gaze.ty - gaze.y) * 0.1;
    parts.looks.forEach((l) => (l.style.transform = `translate(${(gaze.x * 1.6).toFixed(2)}px, ${(gaze.y * 1).toFixed(2)}px)`));
    q('.ct-head-wrap').style.transform = `rotate(${(gaze.x * 5).toFixed(2)}deg)`;
    gaze.raf = Math.abs(gaze.tx - gaze.x) + Math.abs(gaze.ty - gaze.y) > 0.004 ? requestAnimationFrame(track) : 0;
  }

  document.addEventListener('mousemove', (e) => {
    if (asleep || busy()) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    gaze.tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width * 0.32)) / 240));
    gaze.ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height * 0.4)) / 200));
    if (!gaze.raf) gaze.raf = requestAnimationFrame(track);
  }, { passive: true });

  el.addEventListener('click', (e) => {
    if (!e.target.closest('.ct-hit')) return;
    e.stopPropagation();
    if (asleep) {
      wake(true);
      return;
    }
    flag('purr', 1600);
    parts.head.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-7deg)', offset: 0.3 }, { transform: 'rotate(5deg)', offset: 0.65 }, { transform: 'rotate(0deg)' }],
      { duration: 900, easing: 'ease-in-out', composite: 'add' },
    );
    for (let i = 0; i < 3; i++) {
      const p = h('span', { class: 'ct-heart', html: HEART });
      p.style.left = rand(24, 48) + 'px';
      p.style.setProperty('--dx', rand(-12, 12).toFixed(1) + 'px');
      p.style.animationDelay = i * 160 + 'ms';
      el.appendChild(p);
      setTimeout(() => p.remove(), 1500 + i * 160);
    }
  });

  el.wake = () => wake(true);
  el.set = (v) => {
    el.hidden = !v;
  };

  el.set(on);
  idle();
  later('cycle', rand(15000, 30000), sleep);
  return el;
}
