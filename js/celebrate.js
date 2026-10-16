// celebrate.js: the "goal reached" screen with fullscreen confetti.
// After every change, Lamplight checks your three goals (today's minutes, this
// month's books, this year's books). The first time one is met in its period,
// a full-screen celebration appears. Each goal celebrates once per day / month /
// year, remembered in store.data.settings.celebrated.
import { store, todayKey, yearlyGoal } from './store.js';
import { minutesOn, finishedIn } from './stats.js';
import { hasSamples } from './sample.js';
import { esc, plural, fmtMinutes } from './ui.js';

function periods(now = new Date()) {
  return {
    daily: todayKey(),
    monthly: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    yearly: String(now.getFullYear()),
  };
}

function goalsMet() {
  const now = new Date();
  const g = store.data.goals;
  const min = minutesOn(todayKey());
  const month = finishedIn(now.getFullYear(), now.getMonth()).length;
  const year = finishedIn(now.getFullYear(), null).length;
  const monthName = now.toLocaleDateString(undefined, { month: 'long' });
  const yGoal = yearlyGoal();
  return [
    { id: 'daily', met: min >= g.dailyMinutes, title: 'Daily reading goal', text: `You read ${fmtMinutes(min)} today. Goal: ${g.dailyMinutes} min.`, color: 'var(--gold)' },
    { id: 'monthly', met: !!g.monthlyBooks && month >= g.monthlyBooks, title: `${monthName} goal`, text: `${plural(month, 'book')} finished this month. Goal: ${g.monthlyBooks}.`, color: 'var(--teal)' },
    { id: 'yearly', met: year >= yGoal, title: `${now.getFullYear()} goal`, text: `${plural(year, 'book')} finished this year. Goal: ${yGoal}.`, color: 'var(--sky)' },
  ];
}

/** Mark every goal that is already met as celebrated, without showing anything. */
export function primeCelebrations() {
  const p = periods();
  const c = { ...(store.data.settings.celebrated || {}) };
  goalsMet().forEach((g) => { if (g.met) c[g.id] = p[g.id]; });
  store.data.settings.celebrated = c;
}

let checkTimer = null;
/** Call after any change. Shows the celebration for newly met goals. */
export function checkGoals() {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => {
    if (hasSamples() || overlay) return;
    if (!store.data.settings.celebrated) { primeCelebrations(); store.save(); return; }
    const p = periods();
    const c = store.data.settings.celebrated;
    const fresh = goalsMet().filter((g) => g.met && c[g.id] !== p[g.id]);
    if (!fresh.length) return;
    fresh.forEach((g) => { c[g.id] = p[g.id]; });
    store.save();
    showCelebration(fresh, store.data.settings.name);
  }, 450);
}

// ---------------------------------------------------------------------------
// Fullscreen screen + confetti
// ---------------------------------------------------------------------------
let overlay = null;

export function showCelebration(items, name = '') {
  if (overlay) return;
  const heading = items.length > 1 ? 'Goals reached!' : 'Goal reached!';
  overlay = document.createElement('div');
  overlay.className = 'celebrate';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', heading);
  overlay.innerHTML = `<canvas class="confetti" aria-hidden="true"></canvas>
    <div class="celebrate-card">
      <div class="celebrate-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 4.5h8v4.2a4 4 0 0 1-8 0zM16 6h2.6a.9.9 0 0 1 .9 1c-.2 2-1.5 3.3-3.6 3.6M8 6H5.4a.9.9 0 0 0-.9 1c.2 2 1.5 3.3 3.6 3.6M12 12.7V16M8.5 19.5h7M10 16h4l.6 3.5H9.4z"/></svg></div>
      <h2>${heading}</h2>
      <p class="celebrate-sub">${name ? `Wonderful work, ${esc(name)}.` : 'Wonderful work.'}</p>
      <div class="celebrate-list">${items.map((g) => `<div class="celebrate-item" style="--c:${g.color}"><span class="dot"></span><div><b>${esc(g.title)}</b><span>${esc(g.text)}</span></div></div>`).join('')}</div>
      <button class="btn primary block" data-celebrate-close>Keep reading</button>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay && overlay.classList.add('show'));
  if (navigator.vibrate) { try { navigator.vibrate([30, 40, 30]); } catch (e) { /* ignore */ } }
  const btn = overlay.querySelector('[data-celebrate-close]');
  btn.addEventListener('click', closeCelebration);
  setTimeout(() => btn.focus({ preventScroll: true }), 400);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) runConfetti(overlay.querySelector('canvas'));
}

function closeCelebration() {
  if (!overlay) return;
  const el = overlay;
  overlay = null;
  stopConfetti();
  el.classList.remove('show');
  setTimeout(() => el.remove(), 320);
  checkGoals(); // in case another goal was met meanwhile
}

let raf = 0;
function stopConfetti() { cancelAnimationFrame(raf); raf = 0; }

function runConfetti(canvas) {
  const ctx = canvas.getContext('2d');
  const colors = ['#f6c065', '#62d6c4', '#7fb8ff', '#b3a6ff', '#ff8f78', '#eaf0ff'];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0; let H = 0;
  const size = () => {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  window.addEventListener('resize', size);

  const parts = [];
  const rand = (a, b) => a + Math.random() * (b - a);
  const spawn = (x, y, n, spreadUp) => {
    for (let i = 0; i < n; i++) {
      const ang = spreadUp ? rand(-Math.PI * 0.85, -Math.PI * 0.15) : rand(0, Math.PI * 2);
      const sp = spreadUp ? rand(7, 15) : rand(1, 4);
      parts.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        w: rand(7, 12), h: rand(10, 16), r: rand(0, Math.PI * 2), vr: rand(-0.2, 0.2),
        flip: rand(0, Math.PI * 2), vf: rand(0.08, 0.2), color: colors[(Math.random() * colors.length) | 0],
        shape: Math.random() < 0.3 ? 'dot' : 'chip', life: 0,
      });
    }
  };
  // opening bursts from both bottom corners, then a gentle rain from the top
  spawn(W * 0.1, H, 90, true);
  spawn(W * 0.9, H, 90, true);
  const start = performance.now();
  let lastRain = start;

  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  };

  const frame = (t) => {
    const elapsed = t - start;
    if (elapsed < 900) { spawn(W * 0.5, H * 0.35, 4, false); }
    if (elapsed < 4500 && t - lastRain > 60) {
      lastRain = t;
      for (let i = 0; i < 3; i++) {
        parts.push({ x: rand(0, W), y: -20, vx: rand(-1, 1), vy: rand(2, 4), w: rand(7, 12), h: rand(10, 16), r: rand(0, 6.3), vr: rand(-0.15, 0.15), flip: rand(0, 6.3), vf: rand(0.08, 0.2), color: colors[(Math.random() * colors.length) | 0], shape: Math.random() < 0.3 ? 'dot' : 'chip', life: 0 });
      }
    }
    ctx.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.22;
      p.vx += Math.sin((t / 600) + i) * 0.02;
      p.x += p.vx; p.y += p.vy; p.r += p.vr; p.flip += p.vf; p.life += 1;
      if (p.y > H + 30 || p.x < -40 || p.x > W + 40) { parts.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.color;
      if (p.shape === 'dot') {
        ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill();
      } else {
        const sy = Math.abs(Math.cos(p.flip)) * 0.85 + 0.15; // tumbling
        ctx.scale(1, sy);
        roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 3.5);
      }
      ctx.restore();
    }
    if (parts.length || elapsed < 4500) raf = requestAnimationFrame(frame);
    else { raf = 0; window.removeEventListener('resize', size); }
  };
  raf = requestAnimationFrame(frame);
}
