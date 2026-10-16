/**
 * SoundEffects - Web Audio API Synthesizer
 * Zero external audio files required. Completely synthesized in-browser.
 */
class SoundEffects {
  constructor() {
    this.audioCtx = null;
    this.enabled = true;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenInterval = null;
    this.isSirenPlaying = false;
  }

  init() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled && this.isSirenPlaying) {
      this.stopSiren();
    }
    return this.enabled;
  }

  // Play a soft high-tech UI beep
  playClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, this.audioCtx.currentTime + 0.05);

      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.05);
    } catch (e) {
      console.warn('Audio click error:', e);
    }
  }

  // Signal change chime (dual tone chime when light turns green)
  playSignalChime() {
    if (!this.enabled) return;
    this.init();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc1 = this.audioCtx.createOscillator();
      const osc2 = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc1.type = 'triangle';
      osc2.type = 'sine';

      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.setValueAtTime(659.25, now + 0.08); // E5

      osc2.frequency.setValueAtTime(783.99, now); // G5
      osc2.frequency.setValueAtTime(1046.50, now + 0.08); // C6

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.3);
      osc2.stop(now + 0.3);
    } catch (e) {
      console.warn('Signal chime error:', e);
    }
  }

  // Realistic vehicle horn (short double honk)
  playHorn() {
    if (!this.enabled) return;
    this.init();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc1 = this.audioCtx.createOscillator();
      const osc2 = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';

      osc1.frequency.setValueAtTime(415, now);
      osc2.frequency.setValueAtTime(455, now);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.setValueAtTime(0.04, now + 0.12);
      gain.gain.setValueAtTime(0.001, now + 0.14);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.15);
      osc2.stop(now + 0.15);
    } catch (e) {
      console.warn('Horn error:', e);
    }
  }

  // Ambulance Hi-Lo Siren
  startSiren() {
    if (!this.enabled || this.isSirenPlaying) return;
    this.init();
    if (!this.audioCtx) return;

    try {
      this.isSirenPlaying = true;
      this.sirenOsc = this.audioCtx.createOscillator();
      this.sirenGain = this.audioCtx.createGain();

      this.sirenOsc.type = 'sine';
      this.sirenGain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);

      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.audioCtx.destination);
      this.sirenOsc.start();

      let toggle = false;
      const step = () => {
        if (!this.isSirenPlaying || !this.audioCtx) return;
        const now = this.audioCtx.currentTime;
        const freq = toggle ? 960 : 770; // Hi-Lo ambulance frequencies
        this.sirenOsc.frequency.cancelScheduledValues(now);
        this.sirenOsc.frequency.setValueAtTime(freq, now);
        toggle = !toggle;
      };

      step();
      this.sirenInterval = setInterval(step, 450);
    } catch (e) {
      console.warn('Siren start error:', e);
    }
  }

  stopSiren() {
    if (!this.isSirenPlaying) return;
    this.isSirenPlaying = false;
    if (this.sirenInterval) {
      clearInterval(this.sirenInterval);
      this.sirenInterval = null;
    }
    if (this.sirenOsc) {
      try {
        const now = this.audioCtx.currentTime;
        this.sirenGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        this.sirenOsc.stop(now + 0.2);
      } catch (e) {}
      this.sirenOsc = null;
    }
  }

  // Camera snapshot sound for red-light violation detection
  playCameraShutter() {
    if (!this.enabled) return;
    this.init();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {}
  }
}

// Global sound manager instance
window.soundFX = new SoundEffects();
