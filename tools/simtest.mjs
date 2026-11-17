// Headless balance check: run the real world sim with the shots autopilot.
import { createRandom } from '../game/src/random.js';
import { createWorld, EVENT_OVER, EVENT_VICTORY, EVENT_WAVE_CLEAR } from '../game/src/world.js';
import { FIELD, STEP } from '../game/src/config.js';

const world = createWorld(createRandom(7));
function nearest(state, pool) {
  const p = state.player; let best = null, bd = Infinity;
  for (const e of pool) { if (!e.active) continue; const d = (e.x-p.x)**2 + (e.y-p.y)**2; if (d < bd) { bd = d; best = e; } }
  return { e: best, d: Math.sqrt(bd) };
}
function input(state) {
  const p = state.player;
  const { e, d } = nearest(state, state.enemies);
  let mx = 0, my = 0;
  if (e) {
    if (d < 180) { mx = (p.x - e.x)/d; my = (p.y - e.y)/d; }
    else { const cx = FIELD.width/2 - p.x, cy = FIELD.height/2 - p.y, dd = Math.hypot(cx,cy)||1; if (dd > 120) { mx = cx/dd*0.5; my = cy/dd*0.5; } }
    if (p.x < 90) mx += 0.8; if (p.x > FIELD.width-90) mx -= 0.8;
    if (p.y < 90) my += 0.8; if (p.y > FIELD.height-90) my -= 0.8;
    const m = Math.hypot(mx,my)||1;
    return { mx: mx/m, my: my/m, aimX: e.x, aimY: e.y, firing: true, dash: d < 90 };
  }
  return { mx:0, my:0, aimX: p.x, aimY: p.y-100, firing:false, dash:false };
}
world.startWave(1);
let t = 0, result = 'timeout';
for (let i = 0; i < 60*60*20; i++) {  // max 20 min sim
  t += STEP;
  const ev = world.step(STEP, input(world.state), false);
  if (ev & EVENT_OVER) { result = `died wave ${world.state.wave} score ${world.state.score} kills ${world.state.kills} t=${Math.round(t)}s`; break; }
  if (ev & EVENT_VICTORY) { result = `VICTORY score ${world.state.score} kills ${world.state.kills} t=${Math.round(t)}s`; break; }
  if (ev & EVENT_WAVE_CLEAR) { world.applyChoice(0); console.log(`wave ${world.state.wave-1} cleared score=${world.state.score} hull=${Math.round(world.state.player.hull)} salvage=${world.state.salvage}`); }
}
console.log('RESULT:', result);
