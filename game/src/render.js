// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. Neon glow comes from additive ('lighter') passes
// over a dark starfield; the HUD, panels and banners are flat canvas text.

import { FIELD, FONT, PALETTE, TOTAL_WAVES } from './config.js';
import { KIND_BOSS, KIND_DRONE, KIND_ROCK, KIND_SHARD, KIND_WEAVER } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

const TWO_PI = Math.PI * 2;

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, width: 0, height: 0 };
  let nebula = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
    view.width = width;
    view.height = height;
    nebula = null;
  }

  function buildNebula() {
    const g = context.createRadialGradient(300, 180, 40, 300, 180, 520);
    g.addColorStop(0, PALETTE.nebulaA);
    g.addColorStop(1, 'rgba(5,7,15,0)');
    const h = context.createRadialGradient(1050, 560, 40, 1050, 560, 480);
    h.addColorStop(0, PALETTE.nebulaB);
    h.addColorStop(1, 'rgba(5,7,15,0)');
    const k = context.createRadialGradient(900, 120, 20, 900, 120, 380);
    k.addColorStop(0, PALETTE.nebulaC);
    k.addColorStop(1, 'rgba(5,7,15,0)');
    nebula = [g, h, k];
  }

  const fonts = new Map();
  function font(size, weight) {
    const key = `${weight || 400}:${size}`;
    let f = fonts.get(key);
    if (!f) { f = `${weight || 400} ${size}px ${FONT}`; fonts.set(key, f); }
    return f;
  }

  function text(value, x, y, size, color, align, weight) {
    context.font = font(size, weight);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function bar(x, y, w, h, frac, fill, bg) {
    context.fillStyle = bg || 'rgba(255,255,255,0.12)';
    context.fillRect(x, y, w, h);
    context.fillStyle = fill;
    context.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
  }

  function drawBackground(state, time) {
    if (!nebula) buildNebula();
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, view.width, view.height);
    context.save();
    context.translate(view.x, view.y);
    context.scale(view.scale, view.scale);
    for (const g of nebula) { context.fillStyle = g; context.fillRect(0, 0, FIELD.width, FIELD.height); }
    for (const s of state.stars) {
      const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(s.tw + time));
      context.globalAlpha = a;
      context.fillStyle = '#cdd8ff';
      context.beginPath();
      context.arc(s.x, s.y, s.r, 0, TWO_PI);
      context.fill();
    }
    context.globalAlpha = 1;
    context.restore();
  }

  function toFieldX(cx) { return (cx - view.x) / view.scale; }
  function toFieldY(cy) { return (cy - view.y) / view.scale; }

  /** CSS pixels (relative to the canvas) in, field coordinates out. */
  function toFieldPoint(cssX, cssY) {
    const ratio = window.devicePixelRatio || 1;
    return { x: (cssX * ratio - view.x) / view.scale, y: (cssY * ratio - view.y) / view.scale };
  }

  function drawShip(state) {
    const p = state.player;
    const blink = p.invulnerable > 0 && Math.floor(state.elapsed * 14) % 2 === 0;
    context.save();
    context.translate(p.x, p.y);
    context.rotate(p.angle);
    context.globalCompositeOperation = 'lighter';
    const glow = context.createRadialGradient(0, 0, 2, 0, 0, 44);
    glow.addColorStop(0, 'rgba(94,230,255,0.55)');
    glow.addColorStop(1, 'rgba(94,230,255,0)');
    context.fillStyle = glow;
    context.beginPath(); context.arc(0, 0, 44, 0, TWO_PI); context.fill();
    context.globalCompositeOperation = 'source-over';
    if (!blink) {
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.moveTo(22, 0); context.lineTo(-14, -13); context.lineTo(-8, 0); context.lineTo(-14, 13);
      context.closePath(); context.fill();
      context.fillStyle = PALETTE.playerCore;
      context.beginPath(); context.moveTo(12, 0); context.lineTo(-6, -6); context.lineTo(-3, 0); context.lineTo(-6, 6); context.closePath(); context.fill();
    }
    if (p.dashTimer > 0) {
      context.fillStyle = 'rgba(94,230,255,0.5)';
      context.beginPath(); context.moveTo(-14, -10); context.lineTo(-44, 0); context.lineTo(-14, 10); context.closePath(); context.fill();
    }
    context.restore();
    if (p.shield > 0) {
      context.save();
      context.globalAlpha = 0.25 + 0.15 * Math.sin(state.elapsed * 5);
      context.strokeStyle = PALETTE.player;
      context.lineWidth = 2;
      context.beginPath(); context.arc(p.x, p.y, 26, 0, TWO_PI); context.stroke();
      context.restore();
    }
  }

  function drawEnemy(e, time) {
    context.save();
    context.translate(e.x, e.y);
    if (e.kind === KIND_ROCK || e.kind === KIND_SHARD) {
      context.rotate(e.rot);
      context.fillStyle = PALETTE.rock;
      context.strokeStyle = PALETTE.rockEdge;
      context.lineWidth = 2;
      context.beginPath();
      const n = 9;
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * TWO_PI;
        const r = e.radius * (0.82 + 0.18 * Math.sin(i * 2.7 + e.rot));
        if (i === 0) context.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else context.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      context.closePath(); context.fill(); context.stroke();
      context.fillStyle = 'rgba(255,255,255,0.14)';
      context.beginPath(); context.arc(-e.radius * 0.3, -e.radius * 0.3, e.radius * 0.28, 0, TWO_PI); context.fill();
    } else if (e.kind === KIND_DRONE) {
      context.rotate(Math.atan2(e.vy, e.vx));
      context.globalCompositeOperation = 'lighter';
      const glow = context.createRadialGradient(0, 0, 2, 0, 0, e.radius + 16);
      glow.addColorStop(0, 'rgba(255,93,115,0.5)'); glow.addColorStop(1, 'rgba(255,93,115,0)');
      context.fillStyle = glow;
      context.beginPath(); context.arc(0, 0, e.radius + 16, 0, TWO_PI); context.fill();
      context.globalCompositeOperation = 'source-over';
      context.fillStyle = PALETTE.drone;
      context.beginPath();
      context.moveTo(e.radius + 4, 0); context.lineTo(-e.radius, -e.radius * 0.8); context.lineTo(-e.radius * 0.4, 0); context.lineTo(-e.radius, e.radius * 0.8);
      context.closePath(); context.fill();
      context.fillStyle = '#fff';
      context.beginPath(); context.arc(2, 0, 4, 0, TWO_PI); context.fill();
    } else if (e.kind === KIND_WEAVER) {
      context.rotate(e.wobble * 0.8);
      context.globalCompositeOperation = 'lighter';
      const glow = context.createRadialGradient(0, 0, 2, 0, 0, e.radius + 18);
      glow.addColorStop(0, 'rgba(192,132,252,0.5)'); glow.addColorStop(1, 'rgba(192,132,252,0)');
      context.fillStyle = glow;
      context.beginPath(); context.arc(0, 0, e.radius + 18, 0, TWO_PI); context.fill();
      context.globalCompositeOperation = 'source-over';
      context.strokeStyle = PALETTE.weaver;
      context.lineWidth = 3;
      for (let i = 0; i < 3; i += 1) {
        context.beginPath();
        context.arc(0, 0, e.radius * (0.4 + i * 0.3), i * 1.1, i * 1.1 + Math.PI * 1.2);
        context.stroke();
      }
      context.fillStyle = '#f3e8ff';
      context.beginPath(); context.arc(0, 0, 5, 0, TWO_PI); context.fill();
    } else if (e.kind === KIND_BOSS) {
      context.rotate(Math.sin(time * 0.7) * 0.15);
      context.globalCompositeOperation = 'lighter';
      const glow = context.createRadialGradient(0, 0, 10, 0, 0, e.radius + 46);
      glow.addColorStop(0, 'rgba(255,61,129,0.55)'); glow.addColorStop(1, 'rgba(255,61,129,0)');
      context.fillStyle = glow;
      context.beginPath(); context.arc(0, 0, e.radius + 46, 0, TWO_PI); context.fill();
      context.globalCompositeOperation = 'source-over';
      context.fillStyle = '#3a0a1e';
      context.strokeStyle = PALETTE.boss;
      context.lineWidth = 3;
      context.beginPath();
      const n = 8;
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * TWO_PI;
        const r = e.radius * (i % 2 === 0 ? 1 : 0.78);
        if (i === 0) context.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else context.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      context.closePath(); context.fill(); context.stroke();
      context.fillStyle = PALETTE.boss;
      context.beginPath(); context.arc(0, 0, 16, 0, TWO_PI); context.fill();
      context.fillStyle = '#fff';
      context.beginPath(); context.arc(0, 0, 7, 0, TWO_PI); context.fill();
    }
    context.restore();
    if ((e.kind === KIND_BOSS || e.kind === KIND_WEAVER) && e.hp < e.maxHp) {
      bar(e.x - e.radius, e.y - e.radius - 12, e.radius * 2, 5, e.hp / e.maxHp, e.kind === KIND_BOSS ? PALETTE.boss : PALETTE.weaver);
    }
  }

  function drawWorld(state) {
    context.save();
    context.translate(view.x, view.y);
    context.scale(view.scale, view.scale);
    context.save();
    context.beginPath();
    context.rect(0, 0, FIELD.width, FIELD.height);
    context.clip();
    // pickups
    for (const p of state.pickups) {
      if (!p.active) continue;
      const pulse = 1 + 0.15 * Math.sin(state.elapsed * 6 + p.x);
      context.save();
      context.translate(p.x, p.y);
      context.globalCompositeOperation = 'lighter';
      const col = p.kind === 0 ? '124,255,178' : '255,159,67';
      const glow = context.createRadialGradient(0, 0, 1, 0, 0, 26);
      glow.addColorStop(0, `rgba(${col},0.6)`); glow.addColorStop(1, `rgba(${col},0)`);
      context.fillStyle = glow;
      context.beginPath(); context.arc(0, 0, 26, 0, TWO_PI); context.fill();
      context.globalCompositeOperation = 'source-over';
      context.rotate(Math.PI / 4);
      context.fillStyle = p.kind === 0 ? PALETTE.crystal : PALETTE.cell;
      const s = 8 * pulse;
      context.fillRect(-s, -s, s * 2, s * 2);
      context.restore();
    }
    // bullets
    context.globalCompositeOperation = 'lighter';
    for (const b of state.bullets) {
      if (!b.active) continue;
      context.strokeStyle = PALETTE.bullet;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    for (const o of state.orbs) {
      if (!o.active) continue;
      context.fillStyle = '#ff7ab8';
      context.beginPath(); context.arc(o.x, o.y, 7, 0, TWO_PI); context.fill();
      context.fillStyle = '#fff';
      context.beginPath(); context.arc(o.x, o.y, 3, 0, TWO_PI); context.fill();
    }
    context.globalCompositeOperation = 'source-over';
    // enemies, player, particles
    for (const e of state.enemies) if (e.active) drawEnemy(e, state.elapsed);
    drawShip(state);
    context.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath(); context.arc(p.x, p.y, p.size, 0, TWO_PI); context.fill();
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.restore();
    context.restore();
  }

  function drawHud(state, screen) {
    const p = state.player;
    context.save();
    context.translate(view.x, view.y);
    context.scale(view.scale, view.scale);
    // top-left: score + wave
    text(`SCORE ${state.score}`, 24, 40, 26, PALETTE.text, 'left', 700);
    text(`WAVE ${Math.max(1, state.wave)} / ${TOTAL_WAVES}`, 24, 68, 17, PALETTE.muted, 'left', 600);
    if (state.combo > 1) text(`COMBO x${state.combo}`, 24, 94, 17, PALETTE.gold, 'left', 700);
    // top-right: salvage + best
    text(`◆ SALVAGE ${state.salvage}`, FIELD.width - 24, 40, 20, PALETTE.crystal, 'right', 700);
    text(`BEST ${Math.max(state.best, state.score)}`, FIELD.width - 24, 66, 15, PALETTE.muted, 'right', 600);
    // bottom-left: hull + shield
    text('HULL', 24, FIELD.height - 52, 14, PALETTE.muted, 'left', 700);
    bar(24, FIELD.height - 46, 220, 12, p.hull / 100, p.hull > 30 ? '#5ee6ff' : PALETTE.danger);
    text('SHIELD', 24, FIELD.height - 20, 14, PALETTE.muted, 'left', 700);
    bar(24, FIELD.height - 14, 220, 12, p.shield / state.upgrades.shieldMax, '#8b7bff');
    // bottom-right: dash
    const dashReady = p.dashCooldown <= 0;
    text(dashReady ? 'DASH READY [SHIFT]' : 'DASH …', FIELD.width - 24, FIELD.height - 20, 14, dashReady ? PALETTE.player : PALETTE.muted, 'right', 700);
    // wave banner
    if (screen === SCREEN_PLAY && state.bannerTimer > 0 && state.waveState === 'fight') {
      const a = Math.min(1, state.bannerTimer);
      context.globalAlpha = a;
      text(state.wave === TOTAL_WAVES ? 'FINAL WAVE — THE DREADNOUGHT' : `WAVE ${state.wave}`, FIELD.width / 2, 150, 44, PALETTE.text, 'center', 800);
      if (state.wave === TOTAL_WAVES) text('Destroy the Dreadnought to save the beacon', FIELD.width / 2, 186, 18, PALETTE.muted, 'center', 600);
      context.globalAlpha = 1;
    }
    // boss bar
    if (state.boss && state.boss.active) {
      text('DREADNOUGHT', FIELD.width / 2, 44, 16, PALETTE.boss, 'center', 800);
      bar(FIELD.width / 2 - 220, 54, 440, 10, state.boss.hp / state.boss.maxHp, PALETTE.boss);
    }
    context.restore();
  }

  function panel(x, y, w, h) {
    context.fillStyle = 'rgba(5,8,16,0.82)';
    context.fillRect(x, y, w, h);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, w, h);
  }

  function drawTitle(state, best) {
    drawWorld(state);
    context.save();
    context.translate(view.x, view.y);
    context.scale(view.scale, view.scale);
    context.fillStyle = 'rgba(5,7,15,0.45)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('VOIDLIGHT', FIELD.width / 2, 210, 92, PALETTE.text, 'center', 800);
    text('— LAST BEACON —', FIELD.width / 2, 252, 22, PALETTE.player, 'center', 700);
    text('The beacon is dying. Hold the line through 10 waves', FIELD.width / 2, 300, 20, PALETTE.muted, 'center', 600);
    text('and destroy the Dreadnought.', FIELD.width / 2, 328, 20, PALETTE.muted, 'center', 600);
    panel(FIELD.width / 2 - 300, 380, 600, 132);
    text('WASD / ARROWS — fly      MOUSE — aim      CLICK / HOLD — fire', FIELD.width / 2, 420, 17, PALETTE.text, 'center', 600);
    text('SHIFT — dash      P — pause      M — mute', FIELD.width / 2, 452, 17, PALETTE.text, 'center', 600);
    text('Clear a wave, draft an upgrade, survive all ten.', FIELD.width / 2, 484, 17, PALETTE.gold, 'center', 600);
    const pulse = 0.65 + 0.35 * Math.sin(state.elapsed * 3);
    context.globalAlpha = pulse;
    text('CLICK OR PRESS ENTER TO LAUNCH', FIELD.width / 2, 580, 22, PALETTE.player, 'center', 800);
    context.globalAlpha = 1;
    if (best > 0) text(`BEST SCORE ${best}`, FIELD.width / 2, 624, 17, PALETTE.muted, 'center', 700);
    context.restore();
  }

  function drawUpgrade(state) {
    drawWorld(state);
    context.save();
    context.translate(view.x, view.y);
    context.scale(view.scale, view.scale);
    context.fillStyle = 'rgba(5,7,15,0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text(`WAVE ${state.wave} CLEARED`, FIELD.width / 2, 150, 40, PALETTE.gold, 'center', 800);
    text(`Score ${state.score}   •   Salvage ${state.salvage}   •   Next: wave ${state.wave + 1}`, FIELD.width / 2, 190, 18, PALETTE.muted, 'center', 600);
    text('DRAFT AN UPGRADE — click a card or press 1 / 2 / 3', FIELD.width / 2, 240, 19, PALETTE.text, 'center', 700);
    const cw = 300; const ch = 190; const gap = 30;
    const total = cw * 3 + gap * 2;
    let x = (FIELD.width - total) / 2;
    const y = 290;
    state.choices.forEach((c, i) => {
      panel(x, y, cw, ch);
      text(`${i + 1}`, x + 20, y + 40, 20, PALETTE.muted, 'left', 800);
      text(c.name, x + 20, y + 86, 24, PALETTE.text, 'left', 800);
      text(c.desc, x + 20, y + 122, 17, PALETTE.player, 'left', 600);
      text(c.tip, x + 20, y + 152, 14, PALETTE.muted, 'left', 400);
      text('Upgrades stack across waves.', x + 20, y + 172, 13, PALETTE.muted, 'left', 400);
      x += cw + gap;
    });
    context.restore();
  }

  function drawPaused(state) {
    drawWorld(state);
    drawHud(state, SCREEN_PAUSED);
    context.save();
    context.translate(view.x, view.y);
    context.scale(view.scale, view.scale);
    context.fillStyle = 'rgba(5,7,15,0.6)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('PAUSED', FIELD.width / 2, 330, 56, PALETTE.text, 'center', 800);
    text('P or Esc to resume', FIELD.width / 2, 380, 19, PALETTE.muted, 'center', 600);
    context.restore();
  }

  function drawOver(state, best, victory) {
    drawWorld(state);
    context.save();
    context.translate(view.x, view.y);
    context.scale(view.scale, view.scale);
    context.fillStyle = 'rgba(5,7,15,0.62)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    if (victory) {
      text('★ BEACON SAVED ★', FIELD.width / 2, 210, 56, PALETTE.gold, 'center', 800);
      text('The Dreadnought is scrap. The light holds.', FIELD.width / 2, 258, 20, PALETTE.text, 'center', 600);
    } else {
      text('SIGNAL LOST', FIELD.width / 2, 210, 56, PALETTE.danger, 'center', 800);
      text('The beacon went dark on wave ' + Math.max(1, state.wave) + '.', FIELD.width / 2, 258, 20, PALETTE.text, 'center', 600);
    }
    panel(FIELD.width / 2 - 260, 300, 520, 168);
    const acc = state.shotsFired > 0 ? Math.round((state.shotsHit / state.shotsFired) * 100) : 0;
    text(`FINAL SCORE   ${state.score}`, FIELD.width / 2, 346, 24, PALETTE.text, 'center', 700);
    text(`BEST   ${best}`, FIELD.width / 2, 382, 20, PALETTE.muted, 'center', 600);
    text(`Waves cleared ${victory ? TOTAL_WAVES : Math.max(0, state.wave - 1)}   •   Kills ${state.kills}   •   Accuracy ${acc}%`, FIELD.width / 2, 420, 17, PALETTE.muted, 'center', 600);
    text(`Salvage ${state.salvage}`, FIELD.width / 2, 448, 17, PALETTE.muted, 'center', 600);
    const pulse = 0.65 + 0.35 * Math.sin(state.elapsed * 3);
    context.globalAlpha = pulse;
    text('CLICK OR PRESS ENTER TO FLY AGAIN', FIELD.width / 2, 540, 22, PALETTE.player, 'center', 800);
    context.globalAlpha = 1;
    context.restore();
  }

  function draw(state, screen, best) {
    resize();
    drawBackground(state, state.elapsed);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_UPGRADE) drawUpgrade(state);
    else if (screen === SCREEN_PAUSED) drawPaused(state);
    else if (screen === SCREEN_OVER || screen === SCREEN_VICTORY) drawOver(state, best, screen === SCREEN_VICTORY);
    else { drawWorld(state); drawHud(state, screen); }
  }

  return { draw, resize, view, toFieldX, toFieldY, toFieldPoint };
}
