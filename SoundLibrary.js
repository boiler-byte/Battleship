/**
 * SoundLibrary – prozedurale Sound-Effekte für "Schiffe versenken"
 * Nutzt die Web Audio API, keine externen Dateien nötig.
 *
 * Verwendung:
 *   const sfx = new SoundLibrary();
 *   document.body.addEventListener('click', () => sfx.unlock(), { once: true });
 *   sfx.hit();
 */
class SoundLibrary {
  constructor({ volume = 0.4, muted = false } = {}) {
    this.ctx = null;
    this.masterGain = null;
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
  }

  // ---------- Setup ----------

  _ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null; // Browser unterstützt Web Audio nicht
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    // Browser-Autoplay-Policy: Context ggf. entsperren
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /**
   * Sollte einmalig bei der ersten User-Interaktion aufgerufen werden
   * (Klick / Touch), damit der Browser Audio erlaubt.
   */
  unlock() {
    this._ensureContext();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && !this.muted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01);
    }
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.01);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  destroy() {
    if (this.ctx) this.ctx.close();
    this.ctx = null;
    this.masterGain = null;
  }

  // ---------- Interne Helfer ----------

  /** Spielt einen Ton (mit optionalem Frequenz-Sweep). */
  _tone({
    freq = 440,
    freqEnd = null,
    duration = 0.2,
    type = 'sine',
    gain = 0.3,
    when = 0,
    attack = 0.005,
  }) {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 0.01), t0 + duration);
    }

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0001), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(g).connect(this.masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  /** Spielt gefiltertes Rauschen (Splash, Explosion, …). */
  _noise({
    duration = 0.3,
    gain = 0.4,
    when = 0,
    filterFreq = 1000,
    filterEnd = null,
    filterType = 'lowpass',
    q = 1,
  }) {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const t0 = ctx.currentTime + when;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(filterFreq, t0);
    if (filterEnd !== null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(filterEnd, 20), t0 + duration);
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0001), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    src.connect(filter).connect(g).connect(this.masterGain);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
  }

  // ---------- Spiel-Sounds ----------

  /** Neutraler Klick (UI, Buttons). */
  click() {
    this._tone({ freq: 700, freqEnd: 500, duration: 0.06, type: 'square', gain: 0.15 });
  }

  /** Schiff platziert. */
  placeShip() {
    this._tone({ freq: 300, freqEnd: 520, duration: 0.14, type: 'triangle', gain: 0.3 });
  }

  /** Ungültige Platzierung / Fehleingabe. */
  invalid() {
    this._tone({ freq: 220, freqEnd: 150, duration: 0.22, type: 'square', gain: 0.2 });
  }

  /** Fehlschuss – Wasser platscht. */
  miss() {
    this._noise({
      duration: 0.6, gain: 0.25,
      filterFreq: 2500, filterEnd: 400,
      filterType: 'bandpass', q: 0.8,
    });
    this._tone({ freq: 600, freqEnd: 200, duration: 0.25, type: 'sine', gain: 0.12 });
  }

  /** Treffer – Explosion. */
  hit() {
    this._noise({
      duration: 1, gain: 0.5,
      filterFreq: 1200, filterEnd: 80,
      filterType: 'lowpass', q: 1,
    });
    this._tone({ freq: 120, freqEnd: 40, duration: 0.45, type: 'sawtooth', gain: 0.35 });
  }

  /** Schiff versenkt – größere Explosion + Nachbeben. */
  sunk() {
    this.hit();
    this._noise({
      duration: 0.9, gain: 0.4, when: 0.1,
      filterFreq: 800, filterEnd: 40,
      filterType: 'lowpass',
    });
    this._tone({ freq: 80, freqEnd: 25, duration: 0.9, type: 'sine', gain: 0.4, when: 0.1 });
    this._tone({ freq: 200, freqEnd: 60, duration: 0.6, type: 'triangle', gain: 0.2, when: 0.25 });
  }

  /** Nächster Zug / Rundenwechsel. */
  turnChange() {
    this._tone({ freq: 880, duration: 0.12, type: 'sine', gain: 0.2 });
    this._tone({ freq: 660, duration: 0.15, type: 'sine', gain: 0.2, when: 0.1 });
  }

  /** Sieg – aufsteigendes Arpeggio (C-Dur). */
  victory() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this._tone({ freq: f, duration: 0.35, type: 'triangle', gain: 0.3, when: i * 0.12 })
    );
  }

  /** Niederlage – absteigende Melodie. */
  defeat() {
    [392, 349.23, 293.66, 196].forEach((f, i) =>
      this._tone({ freq: f, duration: 0.45, type: 'sine', gain: 0.3, when: i * 0.18 })
    );
  }

  // ---------- Bequemer Dispatcher ----------

  /** Ruft einen Sound per Name auf: sfx.play('hit') */
  play(name) {
    const fn = this[name];
    if (typeof fn === 'function' && !name.startsWith('_') &&
        !['play', 'setVolume', 'setMuted', 'toggleMute', 'destroy', 'unlock'].includes(name)) {
      fn.call(this);
    } else {
      console.warn(`[SoundLibrary] Unbekannter Sound: ${name}`);
    }
  }
}