// Sound, synthesised with WebAudio: no audio files, nothing to download.
// The synth is created on the first user gesture (browsers block audio before
// one); every call before that is a no-op. M toggles mute.
export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = 0.16;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (muted || !ensure() || context.state === 'suspended') return;
    try {
      const t0 = context.currentTime;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  function noise(dur, vol, low) {
    if (muted || !ensure() || context.state === 'suspended') return;
    try {
      const t0 = context.currentTime;
      const len = Math.max(1, Math.floor(context.sampleRate * dur));
      const buffer = context.createBuffer(1, len, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = context.createBufferSource();
      src.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = low || 1200;
      const gain = context.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
    } catch {
      // Audio is decoration.
    }
  }

  return {
    unlock() { ensure(); },
    toggleMute() { muted = !muted; return muted; },
    get muted() { return muted; },
    shoot() { tone(720, 0.07, 'square', 0.12, 320); },
    hit() { tone(190, 0.1, 'sawtooth', 0.16, 90); },
    explode() { noise(0.35, 0.35, 900); tone(120, 0.3, 'sine', 0.25, 40); },
    pickup() { tone(880, 0.09, 'sine', 0.18, 1320); },
    hurt() { tone(140, 0.22, 'sawtooth', 0.25, 60); noise(0.12, 0.2, 600); },
    dash() { noise(0.14, 0.14, 2400); },
    wave() { tone(392, 0.12, 'triangle', 0.2); tone(587, 0.18, 'triangle', 0.2); },
    upgrade() { tone(523, 0.1, 'triangle', 0.2); tone(659, 0.1, 'triangle', 0.2); tone(784, 0.16, 'triangle', 0.2); },
    victory() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.22), i * 130)); },
  };
}
