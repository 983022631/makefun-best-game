// VOIDLIGHT — Last Beacon. Every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** Survive all of these waves and the beacon is saved: the win condition. */
export const TOTAL_WAVES = 10;

export const PLAYER = {
  radius: 16,
  accel: 1500,
  maxSpeed: 340,
  drag: 0.86,
  hull: 100,
  shield: 50,
  shieldRegen: 4, // per second, after 4 s without a hit
  fireInterval: 0.16,
  bulletSpeed: 720,
  bulletDamage: 12,
  dashSpeed: 900,
  dashTime: 0.16,
  dashCooldown: 1.6,
  invulnerable: 1.2,
};

export const ENEMY = {
  rock: { radius: 26, hp: 28, speed: 78, score: 20, salvage: 1, damage: 12 },
  shard: { radius: 12, hp: 8, speed: 155, score: 10, salvage: 1, damage: 8 },
  drone: { radius: 18, hp: 38, speed: 178, score: 40, salvage: 2, damage: 14 },
  weaver: { radius: 20, hp: 56, speed: 142, score: 70, salvage: 3, damage: 16 },
  boss: { radius: 64, hp: 900, speed: 42, score: 1000, salvage: 25, damage: 25 },
};

export const BULLET = { radius: 5, life: 0.9 };
export const ORB = { radius: 7, speed: 265, damage: 10, life: 4 };

export const PICKUP = { radius: 10, magnetRadius: 140, life: 12 };

/** Combo: kills chained inside this window raise the score multiplier. */
export const COMBO = { window: 3, max: 5 };

/** Pool sizes: everything is allocated once at boot, nothing after. */
export const POOL = { enemy: 48, bullet: 96, orb: 64, pickup: 64, particle: 256, star: 110 };

export const PALETTE = {
  backdrop: '#05070f',
  nebulaA: '#1b0f3a',
  nebulaB: '#062a33',
  nebulaC: '#3a0f2e',
  player: '#5ee6ff',
  playerCore: '#eafcff',
  bullet: '#ffe066',
  rock: '#8d7d9c',
  rockEdge: '#c9b8dd',
  drone: '#ff5d73',
  weaver: '#c084fc',
  boss: '#ff3d81',
  crystal: '#7CFFB2',
  cell: '#ff9f43',
  star: '#a78bfa',
  panel: '#0d1322',
  panelEdge: '#2b3a55',
  text: '#eef4ff',
  muted: '#8b98b3',
  danger: '#ff5d73',
  gold: '#ffd166',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'voidlight.best';
