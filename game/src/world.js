// The game's rules and state, with no drawing and no browser in it: the player
// ship, the waves of rocks, drones and weavers, the wave-10 boss, bullets,
// pickups, particles, combo scoring and the between-wave upgrade draft.
// step() advances one fixed step and returns what happened as bit flags, so the
// caller can react (sound, announcements) without the world knowing about
// screens or sound. Nothing here allocates after createWorld returns.

import { BULLET, COMBO, ENEMY, FIELD, ORB, PICKUP, PLAYER, POOL, TOTAL_WAVES } from './config.js';

export const KIND_ROCK = 0;
export const KIND_SHARD = 1;
export const KIND_DRONE = 2;
export const KIND_WEAVER = 3;
export const KIND_BOSS = 4;

export const EVENT_HIT = 1;
export const EVENT_PICKUP = 2;
export const EVENT_OVER = 4;
export const EVENT_WAVE_CLEAR = 8;
export const EVENT_VICTORY = 16;
export const EVENT_SHOOT = 32;
export const EVENT_EXPLODE = 64;
export const EVENT_DASH = 128;

export const UPGRADES = [
  { id: 'rapid', name: 'Rapid Cycler', desc: '+25% fire rate', tip: 'Stacks: hold fire and melt rocks.', apply(u) { u.fireRate *= 0.8; } },
  { id: 'heavy', name: 'Heavy Rounds', desc: '+35% bullet damage', tip: 'Two-shot drones, faster boss kills.', apply(u) { u.damage *= 1.35; } },
  { id: 'twin', name: 'Twin Mount', desc: '+1 bullet per shot', tip: 'A second barrel, same trigger.', apply(u) { u.multishot += 1; } },
  { id: 'magnet', name: 'Tractor Coil', desc: 'Salvage flies to you from farther away', tip: 'Salvage scores — vacuum it up.', apply(u) { u.magnet += 90; } },
  { id: 'plating', name: 'Ablative Plating', desc: '+25 max shield, repair 25 hull', tip: 'Patch the ship after a rough wave.', apply(u) { u.shieldMax += 25; } },
  { id: 'thrusters', name: 'Ion Thrusters', desc: '+18% speed, faster dash', tip: 'Outrun the swarm, dash more often.', apply(u) { u.speed *= 1.18; u.dashCooldown *= 0.7; } },
];

function dist2(ax, ay, bx, by) { const dx = ax - bx; const dy = ay - by; return dx * dx + dy * dy; }

export function createWorld(random) {
  const stars = [];
  for (let i = 0; i < POOL.star; i += 1) {
    stars.push({ x: random() * FIELD.width, y: random() * FIELD.height, r: 0.5 + random() * 1.6, tw: random() * Math.PI * 2, sp: 0.3 + random() * 0.9 });
  }
  const enemies = [];
  for (let i = 0; i < POOL.enemy; i += 1) enemies.push({ active: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, radius: 0, hp: 0, maxHp: 0, rot: 0, rotSpeed: 0, fireTimer: 0, spawnTimer: 0, wobble: 0 });
  const bullets = [];
  for (let i = 0; i < POOL.bullet; i += 1) bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  const orbs = [];
  for (let i = 0; i < POOL.orb; i += 1) orbs.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  const pickups = [];
  for (let i = 0; i < POOL.pickup; i += 1) pickups.push({ active: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  const particles = [];
  for (let i = 0; i < POOL.particle; i += 1) particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff' });

  const player = { x: 0, y: 0, vx: 0, vy: 0, angle: -Math.PI / 2, hull: PLAYER.hull, shield: PLAYER.shield, shieldTimer: 0, fireTimer: 0, dashTimer: 0, dashCooldown: 0, dashX: 0, dashY: 1, invulnerable: 0 };
  const upgrades = { fireRate: PLAYER.fireInterval, damage: PLAYER.bulletDamage, multishot: 1, magnet: PICKUP.magnetRadius, shieldMax: PLAYER.shield, speed: PLAYER.maxSpeed, dashCooldown: PLAYER.dashCooldown };
  const state = {
    player, upgrades, stars, enemies, bullets, orbs, pickups, particles,
    score: 0, best: 0, salvage: 0, combo: 1, comboTimer: 0,
    wave: 0, waveState: 'title', bannerTimer: 0, spawnQueue: [], spawnTimer: 0,
    choices: [], kills: 0, shotsFired: 0, shotsHit: 0, elapsed: 0, boss: null,
  };

  function free(pool) { for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i]; return null; }

  function spawnParticle(x, y, vx, vy, life, size, color) {
    const p = free(particles);
    if (!p) return;
    p.active = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.maxLife = life; p.size = size; p.color = color;
  }

  function explosion(x, y, color, count, power) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const sp = (0.3 + random() * 0.7) * power;
      spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.35 + random() * 0.45, 2 + random() * 3, color);
    }
  }

  function edgePoint() {
    const side = Math.floor(random() * 4);
    const m = 40;
    if (side === 0) return { x: random() * FIELD.width, y: -m };
    if (side === 1) return { x: random() * FIELD.width, y: FIELD.height + m };
    if (side === 2) return { x: -m, y: random() * FIELD.height };
    return { x: FIELD.width + m, y: random() * FIELD.height };
  }

  function spawnEnemy(kind) {
    const e = free(enemies);
    if (!e) return null;
    const spec = kind === KIND_ROCK ? ENEMY.rock : kind === KIND_SHARD ? ENEMY.shard : kind === KIND_DRONE ? ENEMY.drone : kind === KIND_WEAVER ? ENEMY.weaver : ENEMY.boss;
    const hpScale = 1 + (state.wave - 1) * 0.12;
    const p = edgePoint();
    e.active = true; e.kind = kind; e.x = p.x; e.y = p.y;
    e.radius = spec.radius; e.hp = spec.hp * hpScale; e.maxHp = e.hp;
    e.rot = random() * Math.PI * 2; e.rotSpeed = (random() - 0.5) * 2; e.fireTimer = 1.5 + random(); e.spawnTimer = 6 + random() * 3; e.wobble = random() * Math.PI * 2;
    const a = Math.atan2(FIELD.height / 2 - p.y, FIELD.width / 2 - p.x) + (random() - 0.5) * 0.9;
    const sp = spec.speed * (0.8 + random() * 0.4);
    e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
    if (kind === KIND_BOSS) { e.x = FIELD.width / 2; e.y = -80; e.vx = 0; e.vy = 30; state.boss = e; }
    return e;
  }

  function buildWave(n) {
    const q = [];
    if (n === TOTAL_WAVES) {
      q.push(KIND_BOSS);
      for (let i = 0; i < 6; i += 1) q.push(KIND_DRONE);
      for (let i = 0; i < 6; i += 1) q.push(KIND_ROCK);
    } else {
      const rocks = 6 + n * 2;
      const drones = n >= 2 ? 2 + n : 0;
      const weavers = n >= 4 ? 1 + Math.floor((n - 2) / 2) : 0;
      for (let i = 0; i < rocks; i += 1) q.push(KIND_ROCK);
      for (let i = 0; i < drones; i += 1) q.push(KIND_DRONE);
      for (let i = 0; i < weavers; i += 1) q.push(KIND_WEAVER);
      for (let i = q.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); const t = q[i]; q[i] = q[j]; q[j] = t; }
    }
    return q;
  }

  function startWave(n) {
    state.wave = n;
    state.spawnQueue = buildWave(n);
    state.spawnTimer = 0.6;
    state.waveState = 'fight';
    state.bannerTimer = 2.2;
  }

  function offerChoices() {
    const pool = UPGRADES.slice();
    const picks = [];
    for (let i = 0; i < 3; i += 1) {
      const idx = Math.floor(random() * pool.length);
      picks.push(pool.splice(idx, 1)[0]);
    }
    state.choices = picks;
    state.waveState = 'upgrade';
  }

  function applyChoice(index) {
    const choice = state.choices[index];
    if (!choice) return;
    choice.apply(state.upgrades);
    if (choice.id === 'plating') { player.hull = Math.min(PLAYER.hull, player.hull + 25); player.shield = Math.min(state.upgrades.shieldMax, player.shield + 25); }
    state.choices = [];
    startWave(state.wave + 1);
  }

  function dropPickup(x, y, kind) {
    const p = free(pickups);
    if (!p) return;
    const a = random() * Math.PI * 2;
    p.active = true; p.kind = kind; p.x = x; p.y = y;
    p.vx = Math.cos(a) * 60; p.vy = Math.sin(a) * 60; p.life = PICKUP.life;
  }

  function killEnemy(e) {
    const spec = e.kind === KIND_ROCK ? ENEMY.rock : e.kind === KIND_SHARD ? ENEMY.shard : e.kind === KIND_DRONE ? ENEMY.drone : e.kind === KIND_WEAVER ? ENEMY.weaver : ENEMY.boss;
    e.active = false;
    state.kills += 1;
    if (state.comboTimer > 0) state.combo = Math.min(COMBO.max, state.combo + 1);
    else state.combo = 1;
    state.comboTimer = COMBO.window;
    state.score += spec.score * state.combo;
    const color = e.kind === KIND_ROCK || e.kind === KIND_SHARD ? '#c9b8dd' : e.kind === KIND_DRONE ? '#ff5d73' : e.kind === KIND_WEAVER ? '#c084fc' : '#ff3d81';
    explosion(e.x, e.y, color, e.kind === KIND_BOSS ? 60 : 16, e.kind === KIND_BOSS ? 420 : 260);
    for (let i = 0; i < spec.salvage; i += 1) dropPickup(e.x + (random() - 0.5) * 30, e.y + (random() - 0.5) * 30, 0);
    if (random() < 0.12) dropPickup(e.x, e.y, 1);
    if (e.kind === KIND_ROCK) { spawnEnemyAt(KIND_SHARD, e.x - 14, e.y); spawnEnemyAt(KIND_SHARD, e.x + 14, e.y); }
    if (e.kind === KIND_BOSS) state.boss = null;
  }

  function spawnEnemyAt(kind, x, y) {
    const e = free(enemies);
    if (!e) return;
    const spec = kind === KIND_SHARD ? ENEMY.shard : ENEMY.rock;
    e.active = true; e.kind = kind; e.x = x; e.y = y;
    e.radius = spec.radius; e.hp = spec.hp; e.maxHp = e.hp;
    e.rot = random() * Math.PI * 2; e.rotSpeed = (random() - 0.5) * 3; e.fireTimer = 0; e.spawnTimer = 0; e.wobble = 0;
    const a = random() * Math.PI * 2;
    e.vx = Math.cos(a) * spec.speed; e.vy = Math.sin(a) * spec.speed;
  }

  function damagePlayer(amount) {
    if (player.invulnerable > 0 || state.waveState !== 'fight') return 0;
    let rest = amount;
    if (player.shield > 0) { const absorbed = Math.min(player.shield, rest); player.shield -= absorbed; rest -= absorbed; }
    if (rest > 0) player.hull -= rest;
    player.shieldTimer = 0;
    player.invulnerable = PLAYER.invulnerable;
    explosion(player.x, player.y, '#5ee6ff', 10, 200);
    if (player.hull <= 0) { player.hull = 0; return EVENT_OVER; }
    return EVENT_HIT;
  }

  function fireBullets() {
    const n = state.upgrades.multishot;
    const spread = 0.14;
    for (let i = 0; i < n; i += 1) {
      const b = free(bullets);
      if (!b) return;
      const off = (i - (n - 1) / 2) * spread;
      const a = player.angle + off;
      const nose = PLAYER.radius + 6;
      b.active = true;
      b.x = player.x + Math.cos(a) * nose;
      b.y = player.y + Math.sin(a) * nose;
      b.vx = Math.cos(a) * PLAYER.bulletSpeed + player.vx * 0.4;
      b.vy = Math.sin(a) * PLAYER.bulletSpeed + player.vy * 0.4;
      b.life = BULLET.life;
    }
    state.shotsFired += n;
  }

  function fireOrb(x, y, angle) {
    const o = free(orbs);
    if (!o) return;
    o.active = true; o.x = x; o.y = y;
    o.vx = Math.cos(angle) * ORB.speed; o.vy = Math.sin(angle) * ORB.speed;
    o.life = ORB.life;
  }

  function reset() {
    player.x = FIELD.width / 2; player.y = FIELD.height / 2 + 80;
    player.vx = 0; player.vy = 0; player.angle = -Math.PI / 2;
    player.hull = PLAYER.hull; player.shield = PLAYER.shield; player.shieldTimer = 0;
    player.fireTimer = 0; player.dashTimer = 0; player.dashCooldown = 0; player.invulnerable = 0;
    upgrades.fireRate = PLAYER.fireInterval; upgrades.damage = PLAYER.bulletDamage;
    upgrades.multishot = 1; upgrades.magnet = PICKUP.magnetRadius;
    upgrades.shieldMax = PLAYER.shield; upgrades.speed = PLAYER.maxSpeed; upgrades.dashCooldown = PLAYER.dashCooldown;
    for (const e of enemies) e.active = false;
    for (const b of bullets) b.active = false;
    for (const o of orbs) o.active = false;
    for (const p of pickups) p.active = false;
    for (const p of particles) p.active = false;
    state.score = 0; state.salvage = 0; state.combo = 1; state.comboTimer = 0;
    state.wave = 0; state.waveState = 'title'; state.bannerTimer = 0;
    state.spawnQueue = []; state.spawnTimer = 0; state.choices = [];
    state.kills = 0; state.shotsFired = 0; state.shotsHit = 0; state.elapsed = 0; state.boss = null;
  }

  /**
   * One fixed step. `input` is {mx, my, aimX, aimY, firing, dash} in field
   * coordinates; with `harmless` set (the title screen's backdrop) rocks drift
   * but nothing touches the player and nothing scores.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.comboTimer > 0) { state.comboTimer -= dt; if (state.comboTimer <= 0) state.combo = 1; }
    for (const s of stars) { s.tw += dt * s.sp; }

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.98; p.vy *= 0.98;
    }

    if (harmless) {
      if (state.spawnQueue.length === 0) { state.spawnQueue = [KIND_ROCK, KIND_ROCK, KIND_ROCK, KIND_SHARD, KIND_ROCK]; }
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && state.spawnQueue.length > 0) { spawnEnemy(state.spawnQueue.shift()); state.spawnTimer = 1.2; }
      moveEnemies(dt, false);
      return 0;
    }

    if (state.waveState === 'upgrade') return 0;

    // --- player ---
    player.shieldTimer += dt;
    if (player.shieldTimer > 4 && player.shield < state.upgrades.shieldMax) {
      player.shield = Math.min(state.upgrades.shieldMax, player.shield + PLAYER.shieldRegen * dt);
    }
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (player.dashCooldown > 0) player.dashCooldown -= dt;

    const dx = input.aimX - player.x;
    const dy = input.aimY - player.y;
    if (dx * dx + dy * dy > 4) player.angle = Math.atan2(dy, dx);

    if (input.dash && player.dashCooldown <= 0 && player.dashTimer <= 0) {
      player.dashTimer = PLAYER.dashTime;
      player.dashCooldown = state.upgrades.dashCooldown;
      const ma = Math.hypot(input.mx, input.my) > 0.1 ? Math.atan2(input.my, input.mx) : player.angle;
      player.dashX = Math.cos(ma); player.dashY = Math.sin(ma);
      player.invulnerable = Math.max(player.invulnerable, PLAYER.dashTime + 0.05);
      events |= EVENT_DASH;
    }
    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      player.vx = player.dashX * PLAYER.dashSpeed;
      player.vy = player.dashY * PLAYER.dashSpeed;
      spawnParticle(player.x, player.y, -player.dashX * 60, -player.dashY * 60, 0.3, 3, '#5ee6ff');
    } else {
      player.vx += input.mx * PLAYER.accel * dt;
      player.vy += input.my * PLAYER.accel * dt;
      const sp = Math.hypot(player.vx, player.vy);
      const max = state.upgrades.speed;
      if (sp > max) { player.vx = (player.vx / sp) * max; player.vy = (player.vy / sp) * max; }
      player.vx *= Math.pow(PLAYER.drag, dt * 60);
      player.vy *= Math.pow(PLAYER.drag, dt * 60);
    }
    player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + player.vy * dt));

    player.fireTimer -= dt;
    if (input.firing && player.fireTimer <= 0) {
      fireBullets();
      player.fireTimer = state.upgrades.fireRate;
      events |= EVENT_SHOOT;
    }

    // --- spawning ---
    if (state.waveState === 'fight') {
      if (state.bannerTimer > 0) state.bannerTimer -= dt;
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          spawnEnemy(state.spawnQueue.shift());
          state.spawnTimer = state.wave === TOTAL_WAVES ? 1.2 : Math.max(0.22, 0.8 - state.wave * 0.05);
        }
      }
    }

    events |= moveEnemies(dt, true);
    if (events & EVENT_OVER) return events;

    // --- bullets ---
    for (let i = 0; i < bullets.length; i += 1) {
      const b = bullets[i];
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) { b.active = false; continue; }
      for (let j = 0; j < enemies.length; j += 1) {
        const e = enemies[j];
        if (!e.active) continue;
        const rr = e.radius + BULLET.radius;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          b.active = false;
          state.shotsHit += 1;
          e.hp -= state.upgrades.damage;
          spawnParticle(b.x, b.y, -b.vx * 0.08, -b.vy * 0.08, 0.2, 2, '#ffe066');
          if (e.hp <= 0) { killEnemy(e); events |= EVENT_EXPLODE; }
          break;
        }
      }
    }

    // --- enemy orbs ---
    for (let i = 0; i < orbs.length; i += 1) {
      const o = orbs[i];
      if (!o.active) continue;
      o.life -= dt;
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.life <= 0 || o.x < -20 || o.x > FIELD.width + 20 || o.y < -20 || o.y > FIELD.height + 20) { o.active = false; continue; }
      const rr = PLAYER.radius + ORB.radius;
      if (dist2(o.x, o.y, player.x, player.y) < rr * rr) {
        o.active = false;
        const ev = damagePlayer(ORB.damage);
        events |= ev;
        if (ev & EVENT_OVER) return events | EVENT_OVER;
      }
    }

    // --- pickups ---
    for (let i = 0; i < pickups.length; i += 1) {
      const p = pickups[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      const d2 = dist2(p.x, p.y, player.x, player.y);
      const magnet = state.upgrades.magnet;
      if (d2 < magnet * magnet) {
        const d = Math.sqrt(d2) || 1;
        const pull = 520 * (1 - d / magnet) + 120;
        p.vx += ((player.x - p.x) / d) * pull * dt;
        p.vy += ((player.y - p.y) / d) * pull * dt;
      }
      p.vx *= 0.96; p.vy *= 0.96;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const rr = PLAYER.radius + PICKUP.radius + 4;
      if (d2 < rr * rr) {
        p.active = false;
        if (p.kind === 0) { state.salvage += 1; state.score += 5 * state.combo; }
        else { player.hull = Math.min(PLAYER.hull, player.hull + 20); state.score += 10; }
        events |= EVENT_PICKUP;
      }
    }

    // --- wave cleared? ---
    if (state.waveState === 'fight' && state.spawnQueue.length === 0) {
      let anyAlive = false;
      for (const e of enemies) if (e.active) { anyAlive = true; break; }
      if (!anyAlive) {
        if (state.wave >= TOTAL_WAVES) { state.waveState = 'done'; return events | EVENT_VICTORY; }
        state.score += 100 * state.wave;
        offerChoices();
        return events | EVENT_WAVE_CLEAR;
      }
    }
    return events;
  }

  function moveEnemies(dt, collide) {
    let events = 0;
    for (let i = 0; i < enemies.length; i += 1) {
      const e = enemies[i];
      if (!e.active) continue;
      e.rot += e.rotSpeed * dt;
      e.wobble += dt;
      if (e.kind === KIND_ROCK || e.kind === KIND_SHARD) {
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.x < -60 || e.x > FIELD.width + 60 || e.y < -60 || e.y > FIELD.height + 60) { e.active = false; continue; }
      } else if (e.kind === KIND_DRONE) {
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        const sp = ENEMY.drone.speed * (1 + (state.wave - 1) * 0.03);
        e.vx += (Math.cos(a) * sp - e.vx) * dt * 1.6;
        e.vy += (Math.sin(a) * sp - e.vy) * dt * 1.6;
        e.x += e.vx * dt; e.y += e.vy * dt;
      } else if (e.kind === KIND_WEAVER) {
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        const sp = ENEMY.weaver.speed;
        const perp = a + Math.PI / 2;
        const wob = Math.sin(e.wobble * 2.2) * 90;
        e.vx += (Math.cos(a) * sp + Math.cos(perp) * wob - e.vx) * dt * 1.4;
        e.vy += (Math.sin(a) * sp + Math.sin(perp) * wob - e.vy) * dt * 1.4;
        e.x += e.vx * dt; e.y += e.vy * dt;
        e.fireTimer -= dt;
        if (collide && e.fireTimer <= 0 && dist2(e.x, e.y, player.x, player.y) < 420 * 420) {
          fireOrb(e.x, e.y, Math.atan2(player.y - e.y, player.x - e.x));
          e.fireTimer = 2.2;
        }
      } else if (e.kind === KIND_BOSS) {
        if (e.y < 130) { e.y += e.vy * dt; }
        else {
          const a = Math.atan2(player.y - e.y, player.x - e.x);
          e.vx += (Math.cos(a) * ENEMY.boss.speed - e.vx) * dt * 0.8;
          e.vy += (Math.sin(a) * ENEMY.boss.speed * 0.6 - e.vy) * dt * 0.8;
          e.x += e.vx * dt; e.y += e.vy * dt;
          e.x = Math.min(FIELD.width - 90, Math.max(90, e.x));
          e.y = Math.min(420, Math.max(90, e.y));
          e.fireTimer -= dt;
          if (collide && e.fireTimer <= 0) {
            for (let k = 0; k < 10; k += 1) fireOrb(e.x, e.y, (k / 10) * Math.PI * 2 + e.rot);
            e.fireTimer = 2.6;
          }
          e.spawnTimer -= dt;
          if (collide && e.spawnTimer <= 0) {
            const p1 = edgePoint(); spawnEnemyAt(KIND_DRONE, p1.x, p1.y);
            e.spawnTimer = 8;
          }
        }
      }
      if (collide && state.waveState === 'fight') {
        const rr = e.radius + PLAYER.radius;
        if (dist2(e.x, e.y, player.x, player.y) < rr * rr) {
          // Ramming hurts: the player takes the hit, the rock shatters, and
          // a live ship bounces off instead of sticking to the hull.
          const spec = e.kind === KIND_ROCK ? ENEMY.rock : e.kind === KIND_SHARD ? ENEMY.shard : e.kind === KIND_DRONE ? ENEMY.drone : e.kind === KIND_WEAVER ? ENEMY.weaver : ENEMY.boss;
          events |= damagePlayer(spec.damage);
          if (e.kind === KIND_ROCK || e.kind === KIND_SHARD) killEnemy(e);
          else {
            e.hp -= 30;
            const a = Math.atan2(e.y - player.y, e.x - player.x);
            e.vx = Math.cos(a) * 260; e.vy = Math.sin(a) * 260;
            if (e.hp <= 0) killEnemy(e);
          }
          if (player.hull <= 0) return events | EVENT_OVER;
        }
      }
    }
    return events;
  }

  reset();
  return { state, reset, step, startWave, applyChoice };
}
