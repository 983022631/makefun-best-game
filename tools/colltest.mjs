import { createRandom } from '../game/src/random.js';
import { createWorld, EVENT_OVER } from '../game/src/world.js';
import { STEP } from '../game/src/config.js';
const world = createWorld(createRandom(1));
world.startWave(1);
const s = world.state;
// force an enemy onto the player
const e = s.enemies.find(x => !x.active);
e.active = true; e.kind = 0; e.x = s.player.x; e.y = s.player.y; e.radius = 26; e.hp = 100; e.maxHp = 100; e.vx = 0; e.vy = 0; e.rot = 0; e.rotSpeed = 0; e.fireTimer = 9; e.spawnTimer = 9; e.wobble = 0;
console.log('before hull', s.player.hull, 'shield', s.player.shield, 'waveState', s.waveState);
const ev = world.step(STEP, {mx:0,my:0,aimX:640,aimY:300,firing:false,dash:false}, false);
console.log('events', ev, 'after hull', s.player.hull, 'shield', s.player.shield, 'enemy active', e.active);
