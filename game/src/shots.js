// The screenshot scenes behind ?shot=start|play|upgrade|end. Each one plays the
// real rules forward from a fresh world, steered by a simple autopilot (keep
// moving away from the nearest threat, aim at the nearest enemy, fire), so the
// frame is what a real game looks like and the same seed always gives the same
// frame. The end scene's pilot is deliberately timid, so it is caught out once
// the waves speed up, as a hurried player is.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_VICTORY, EVENT_WAVE_CLEAR } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 42;
const END_LIMIT_SECONDS = 600;
const UPGRADE_LIMIT_SECONDS = 300;

function nearestEnemy(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return { enemy: best, dist: Math.sqrt(bestD) };
}

function nearestPickup(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const k of state.pickups) {
    if (!k.active) continue;
    const d = (k.x - p.x) * (k.x - p.x) + (k.y - p.y) * (k.y - p.y);
    if (d < bestD) { bestD = d; best = k; }
  }
  return { pickup: best, dist: Math.sqrt(bestD) };
}

function autopilotInput(state, cautious) {
  const p = state.player;
  const { enemy, dist } = nearestEnemy(state);
  let mx = 0; let my = 0;
  // Scoop salvage when nothing is close enough to threaten.
  const { pickup, dist: pdist } = nearestPickup(state);
  if (pickup && pdist < 320 && (!enemy || dist > 220)) {
    const d = Math.max(1, pdist);
    mx = (pickup.x - p.x) / d;
    my = (pickup.y - p.y) / d;
    return { mx, my, aimX: enemy ? enemy.x : pickup.x, aimY: enemy ? enemy.y : pickup.y, firing: Boolean(enemy), dash: false };
  }
  if (enemy) {
    // Flee when something is close, drift toward the centre otherwise.
    const danger = cautious ? 220 : 150;
    if (dist < danger) {
      const d = Math.max(1, dist);
      mx = (p.x - enemy.x) / d;
      my = (p.y - enemy.y) / d;
    } else {
      const cx = FIELD.width / 2 - p.x;
      const cy = FIELD.height / 2 - p.y;
      const d = Math.hypot(cx, cy) || 1;
      if (d > 120) { mx = cx / d * 0.5; my = cy / d * 0.5; }
    }
    // Keep off the walls.
    if (p.x < 90) mx += 0.8;
    if (p.x > FIELD.width - 90) mx -= 0.8;
    if (p.y < 90) my += 0.8;
    if (p.y > FIELD.height - 90) my -= 0.8;
    const m = Math.hypot(mx, my) || 1;
    return { mx: mx / m, my: my / m, aimX: enemy.x, aimY: enemy.y, firing: true, dash: dist < 90 };
  }
  return { mx: 0, my: 0, aimX: p.x, aimY: p.y - 100, firing: false, dash: false };
}

function playUntil(world, seconds, cautious, stopOn) {
  let events = 0;
  for (let i = 0; i < seconds / STEP; i += 1) {
    events = world.step(STEP, autopilotInput(world.state, cautious), false);
    if (events & EVENT_OVER) return 'over';
    if (events & EVENT_VICTORY) return 'victory';
    if (stopOn && (events & stopOn)) return 'stop';
  }
  return 'time';
}

/**
 * Set `world` to the named scene (start, play, upgrade or end; any other name
 * is start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'upgrade' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { mx: 0, my: 0, aimX: 640, aimY: 300, firing: false, dash: false }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  world.startWave(1);
  if (name === 'play') {
    // Clear wave 1, take an upgrade, then catch wave 2 mid-fight: a frame
    // with enemies, bullets and salvage on screen, not the empty lull after
    // a wave is cleared.
    playUntil(world, UPGRADE_LIMIT_SECONDS, true, EVENT_WAVE_CLEAR);
    if (world.state.waveState === 'upgrade') world.applyChoice(1);
    playUntil(world, 8, true, 0);
    const over = world.state.player.hull <= 0;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'upgrade') {
    playUntil(world, UPGRADE_LIMIT_SECONDS, true, EVENT_WAVE_CLEAR);
    return { screen: world.state.waveState === 'upgrade' ? SCREEN_UPGRADE : SCREEN_PLAY, best: world.state.score };
  }
  // end: timid pilot, runs until the ship is destroyed.
  playUntil(world, END_LIMIT_SECONDS, false, 0);
  return { screen: SCREEN_OVER, best: world.state.score };
}
