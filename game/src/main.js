// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play,
// upgrade (the between-wave draft), paused, game over and victory.
//
// ?seed=N fixes the wave pattern. ?shot=start|play|upgrade|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_HIT, EVENT_OVER, EVENT_PICKUP, EVENT_VICTORY, EVENT_WAVE_CLEAR } from './world.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_MUTE, ACTION_PAUSE, ACTION_PICK_1, ACTION_PICK_2, ACTION_PICK_3, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_VICTORY } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    world.startWave(1);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Wave 1 of 10. Survive them all.');
  }

  function endGame(victory) {
    screen = victory ? SCREEN_VICTORY : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (victory) { audio.victory(); announce(`Victory. Score ${world.state.score}. Best ${best}.`); }
    else announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  // Actions are taken exactly once per frame and shared by the screen handler
  // and the simulation, so a dash press is never eaten by the other.
  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_VICTORY) {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_PICK_1) { audio.upgrade(); world.applyChoice(0); screen = SCREEN_PLAY; announce(`Wave ${world.state.wave} of 10.`); }
      else if (actions & ACTION_PICK_2) { audio.upgrade(); world.applyChoice(1); screen = SCREEN_PLAY; announce(`Wave ${world.state.wave} of 10.`); }
      else if (actions & ACTION_PICK_3) { audio.upgrade(); world.applyChoice(2); screen = SCREEN_PLAY; announce(`Wave ${world.state.wave} of 10.`); }
      else if (actions & ACTION_CONFIRM) { audio.upgrade(); world.applyChoice(0); screen = SCREEN_PLAY; announce(`Wave ${world.state.wave} of 10.`); }
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, aimX: 640, aimY: 300, firing: false, dash: false }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const move = input.move();
    const aim = input.aim();
    const fieldAim = renderer.toFieldPoint(aim.x, aim.y);
    const events = world.step(STEP, {
      mx: move.x, my: move.y,
      aimX: Number.isFinite(fieldAim.x) ? fieldAim.x : world.state.player.x,
      aimY: Number.isFinite(fieldAim.y) ? fieldAim.y : world.state.player.y - 100,
      firing: input.firing,
      dash: Boolean(actions & ACTION_DASH),
    }, false);
    if (events & EVENT_OVER) { audio.explode(); endGame(false); }
    else if (events & EVENT_VICTORY) endGame(true);
    else if (events & EVENT_WAVE_CLEAR) { audio.wave(); screen = SCREEN_UPGRADE; announce(`Wave cleared. Draft an upgrade.`); }
    else if (events & EVENT_HIT) { audio.hurt(); announce(world.state.player.hull <= 25 ? `Hull critical, ${world.state.player.hull} left.` : `Hit. Hull ${world.state.player.hull}.`); }
    else if (events & EVENT_PICKUP) audio.pickup();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting drones fire unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Voidlight, last beacon. Press Enter or click to launch.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
