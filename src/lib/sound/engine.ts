/**
 * The synthesis engine.
 *
 * A note on why there is no library here. Howler plays files, which would mean
 * shipping megabytes of audio for sounds that have to be parameterised by the
 * round anyway; Tone.js is a fine framework and about 130kb for scheduling this
 * already does. What actually separates cheap game audio from expensive game
 * audio is not the library, it is the signal chain — and that is what this file
 * is: a master bus with glue compression and a limiter, two effect sends, and a
 * ducking stage that makes everything else get out of the way when something
 * big lands.
 *
 * The four ideas doing the heavy lifting:
 *
 *   **Layering.** No sound here is one oscillator. A win is a sub, a chord, a
 *   transient and a shimmer, each with its own envelope and its own place in
 *   the stereo field. One sine wave is a test tone; four layered voices are an
 *   instrument.
 *
 *   **Supersaw.** Seven detuned sawtooths through a moving filter. It is the
 *   sound of every big electronic record of the last thirty years, and it costs
 *   seven oscillators.
 *
 *   **Ducking.** A real sidechain: the moment an impact lands, everything else
 *   drops to half and breathes back over a quarter of a second. This is the
 *   single biggest reason a drop feels like it hits rather than like it was
 *   added to the mix.
 *
 *   **A limiter.** Ten voices firing at once would clip, and clipping is the
 *   thing that makes synthesis sound amateur. The last stage is a fast
 *   brickwall so the mix can be loud without ever crunching.
 */

export interface Sends {
  /** 0–1 into the room. */
  readonly reverb?: number;
  /** 0–1 into the ping-pong delay. */
  readonly delay?: number;
}

export interface Envelope {
  readonly attack?: number;
  readonly decay?: number;
  readonly sustain?: number;
  readonly release?: number;
}

export interface ToneOptions extends Envelope {
  readonly freq: number;
  readonly type?: OscillatorType;
  readonly gain?: number;
  readonly duration: number;
  readonly delay?: number;
  readonly pan?: number;
  readonly glideTo?: number;
  /** Detune spread in cents. Non-zero stacks voices into a supersaw. */
  readonly spread?: number;
  /** How many detuned copies. 1 is a plain oscillator. */
  readonly voices?: number;
  readonly filter?: {
    readonly type?: BiquadFilterType;
    readonly freq: number;
    readonly q?: number;
    /** Where the cutoff travels to over the note. */
    readonly to?: number;
  };
  readonly sends?: Sends;
}

export interface NoiseOptions extends Envelope {
  readonly duration: number;
  readonly gain?: number;
  readonly delay?: number;
  readonly pan?: number;
  readonly filter?: {
    readonly type?: BiquadFilterType;
    readonly freq: number;
    readonly q?: number;
    readonly to?: number;
  };
  readonly sends?: Sends;
}

interface Chain {
  ctx: AudioContext;
  /** User volume. */
  master: GainNode;
  /** Everything musical passes through here so impacts can duck it. */
  duck: GainNode;
  glue: DynamicsCompressorNode;
  reverbSend: GainNode;
  delaySend: GainNode;
}

let chain: Chain | undefined;

export function audioChain(): Chain | undefined {
  return chain;
}

export function isReady(): boolean {
  return chain !== undefined;
}

/**
 * Deterministic noise.
 *
 * `Math.random` is banned repo-wide so nothing anywhere near an outcome reaches
 * for it out of habit, and the determinism is worth having in its own right:
 * the same impact sounds the same twice, which is what lets a player learn what
 * a sound means.
 */
function fill(data: Float32Array, seed: number): void {
  let state = seed >>> 0;
  for (let i = 0; i < data.length; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    data[i] = (state / 0x80000000 - 1) * 0.9;
  }
}

/**
 * A room, synthesised.
 *
 * Two decorrelated channels of decaying noise, rolled off in the treble. Under
 * a second, because a long bright tail smears a board where twelve pins ring in
 * two seconds into a wash, and knowing exactly *when* something struck is worth
 * more than the size of the space it struck in.
 */
function buildRoom(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const frames = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, frames, ctx.sampleRate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    fill(data, 0x9e3779b9 + channel * 0x1234567);
    for (let i = 0; i < frames; i += 1) {
      const t = i / frames;
      // Exponential decay with a short fade-in, so the onset is a room rather
      // than a click.
      data[i] = (data[i] ?? 0) * Math.pow(1 - t, decay) * Math.min(1, t * 120);
    }
  }
  return buffer;
}

export function buildChain(ctx: AudioContext, volume: number): Chain {
  // ── Master ──────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);

  // A fast brickwall. Ratio 20 with a millisecond attack is a limiter in all
  // but name, and it is what lets the mix sit loud without ever crunching.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.06;
  limiter.connect(master);

  // Gentle bus glue underneath it: slower, softer, holding the layers together
  // rather than catching peaks.
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -18;
  glue.knee.value = 24;
  glue.ratio.value = 3;
  glue.attack.value = 0.008;
  glue.release.value = 0.18;
  glue.connect(limiter);

  // Top end pulled *down*, not up.
  //
  // This shelf started at +3dB, on the theory that synthesis without air sounds
  // like it is happening behind a curtain. It does — and the cost was that
  // eighty pin strikes in three seconds became genuinely unpleasant, because
  // the frequencies that read as "crisp" on one hit are the same ones that read
  // as "shrill" on the fiftieth. Listener fatigue lives between 2 and 6kHz, and
  // a game that is played in long sessions has to give that band up.
  const air = ctx.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 5200;
  air.gain.value = -3.5;
  air.connect(glue);

  // A gentle scoop where the ear is most sensitive, for the same reason.
  const tame = ctx.createBiquadFilter();
  tame.type = "peaking";
  tame.frequency.value = 3100;
  tame.Q.value = 0.9;
  tame.gain.value = -3;
  tame.connect(air);

  const duck = ctx.createGain();
  duck.gain.value = 1;
  duck.connect(tame);

  // ── Reverb send ─────────────────────────────────────────────────────
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 1;
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 2400;
  const convolver = ctx.createConvolver();
  convolver.buffer = buildRoom(ctx, 0.9, 3.0);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.32;
  reverbSend.connect(damp);
  damp.connect(convolver);
  convolver.connect(reverbReturn);
  reverbReturn.connect(duck);

  // ── Ping-pong delay ─────────────────────────────────────────────────
  // Dotted-eighth at 128bpm, the interval every electronic record uses,
  // because it fills the space between hits without ever landing on one.
  const delaySend = ctx.createGain();
  delaySend.gain.value = 1;
  const left = ctx.createDelay(1);
  const right = ctx.createDelay(1);
  left.delayTime.value = 0.351;
  right.delayTime.value = 0.351 * 2;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.24;
  const echoDamp = ctx.createBiquadFilter();
  echoDamp.type = "lowpass";
  echoDamp.frequency.value = 2200;
  const delayReturn = ctx.createGain();
  delayReturn.gain.value = 0.26;
  const spreadLeft = ctx.createStereoPanner();
  const spreadRight = ctx.createStereoPanner();
  spreadLeft.pan.value = -0.8;
  spreadRight.pan.value = 0.8;

  delaySend.connect(left);
  left.connect(spreadLeft);
  spreadLeft.connect(delayReturn);
  left.connect(right);
  right.connect(spreadRight);
  spreadRight.connect(delayReturn);
  right.connect(echoDamp);
  echoDamp.connect(feedback);
  feedback.connect(left);
  delayReturn.connect(duck);

  chain = { ctx, master, duck, glue, reverbSend, delaySend };
  return chain;
}

export function teardown(): void {
  chain = undefined;
}

/* ── Routing ────────────────────────────────────────────────────────────── */

function route(node: AudioNode, pan: number | undefined, sends: Sends | undefined): void {
  if (!chain) return;
  const { ctx, duck, reverbSend, delaySend } = chain;

  let out = node;
  if (pan !== undefined && pan !== 0 && typeof ctx.createStereoPanner === "function") {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(panner);
    out = panner;
  }

  out.connect(duck);

  if (sends?.reverb) {
    const tap = ctx.createGain();
    tap.gain.value = sends.reverb;
    out.connect(tap);
    tap.connect(reverbSend);
  }
  if (sends?.delay) {
    const tap = ctx.createGain();
    tap.gain.value = sends.delay;
    out.connect(tap);
    tap.connect(delaySend);
  }
}

/**
 * A proper ADSR, rather than the ramp-up-ramp-down most game audio settles for.
 *
 * The attack shape is what carries the character: a millisecond attack is a
 * click, ten is a pluck, two hundred is a pad. Getting this one number right
 * per sound does more than any amount of effects.
 */
function envelope(
  param: AudioParam,
  start: number,
  peak: number,
  duration: number,
  env: Envelope,
): void {
  const attack = Math.max(0.001, env.attack ?? 0.006);
  const decay = env.decay ?? Math.min(0.18, duration * 0.3);
  const sustain = env.sustain ?? 0.55;
  const release = env.release ?? Math.max(0.03, duration * 0.4);
  const hold = Math.max(0.001, duration - attack - decay);

  param.setValueAtTime(0.0001, start);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
  param.exponentialRampToValueAtTime(
    Math.max(0.0002, peak * sustain),
    start + attack + decay,
  );
  param.setValueAtTime(Math.max(0.0002, peak * sustain), start + attack + decay + hold);
  param.exponentialRampToValueAtTime(0.0001, start + attack + decay + hold + release);
}

/**
 * A pitched voice, optionally stacked into a supersaw.
 *
 * `voices: 7, spread: 22` is the classic wide lead. Each copy is detuned a
 * little and panned a little, and the beating between them is the entire
 * effect — a single sawtooth is thin, seven slightly-out-of-tune ones are
 * enormous, and nothing else in the chain has to change.
 */
export function tone(options: ToneOptions): void {
  if (!chain) return;
  const { ctx } = chain;
  const start = ctx.currentTime + (options.delay ?? 0);
  const duration = options.duration;
  const count = Math.max(1, Math.min(9, options.voices ?? 1));
  const spread = options.spread ?? 0;

  const bus = ctx.createGain();
  bus.gain.value = 1;

  let node: AudioNode = bus;
  if (options.filter) {
    const filter = ctx.createBiquadFilter();
    filter.type = options.filter.type ?? "lowpass";
    filter.Q.value = options.filter.q ?? 0.9;
    filter.frequency.setValueAtTime(options.filter.freq, start);
    if (options.filter.to !== undefined) {
      // A moving cutoff is what makes a note sound like it is being played
      // rather than triggered.
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(60, options.filter.to),
        start + duration,
      );
    }
    bus.connect(filter);
    node = filter;
  }

  const amp = ctx.createGain();
  envelope(amp.gain, start, options.gain ?? 0.2, duration, options);
  node.connect(amp);
  route(amp, options.pan, options.sends);

  for (let i = 0; i < count; i += 1) {
    const osc = ctx.createOscillator();
    osc.type = options.type ?? "sine";
    osc.frequency.setValueAtTime(options.freq, start);
    if (options.glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(8, options.glideTo),
        start + duration,
      );
    }
    if (count > 1) {
      const offset = (i / (count - 1)) * 2 - 1;
      osc.detune.setValueAtTime(offset * spread, start);
    }

    if (count > 1 && typeof ctx.createStereoPanner === "function") {
      // Spread the stack across the field. A supersaw panned to a point is a
      // waste of six of its seven oscillators.
      const panner = ctx.createStereoPanner();
      panner.pan.value = ((i / (count - 1)) * 2 - 1) * 0.7;
      const trim = ctx.createGain();
      trim.gain.value = 1 / Math.sqrt(count);
      osc.connect(panner);
      panner.connect(trim);
      trim.connect(bus);
    } else {
      const trim = ctx.createGain();
      trim.gain.value = 1 / Math.sqrt(count);
      osc.connect(trim);
      trim.connect(bus);
    }

    osc.start(start);
    osc.stop(start + duration + 0.4);
  }
}

/** Filtered noise: the body of every thud, click, sweep and explosion. */
export function noise(options: NoiseOptions): void {
  if (!chain) return;
  const { ctx } = chain;
  const start = ctx.currentTime + (options.delay ?? 0);
  const frames = Math.max(64, Math.floor(ctx.sampleRate * options.duration));

  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  fill(buffer.getChannelData(0), 0x2545f491 + frames);

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  let node: AudioNode = source;
  if (options.filter) {
    const filter = ctx.createBiquadFilter();
    filter.type = options.filter.type ?? "lowpass";
    filter.Q.value = options.filter.q ?? 0.8;
    filter.frequency.setValueAtTime(options.filter.freq, start);
    if (options.filter.to !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(40, options.filter.to),
        start + options.duration,
      );
    }
    source.connect(filter);
    node = filter;
  }

  const amp = ctx.createGain();
  envelope(amp.gain, start, options.gain ?? 0.1, options.duration, options);
  node.connect(amp);
  route(amp, options.pan, options.sends);

  source.start(start);
  source.stop(start + options.duration + 0.05);
}

/**
 * Sub-bass.
 *
 * Its own function because it must never go through the reverb — low frequency
 * in a room is mud, and the one thing a sub has to do is be felt rather than
 * heard. Barely audible on a laptop, unmistakable on anything with a woofer,
 * and the difference between a win that is noticed and one that lands.
 */
export function sub(options: {
  readonly freq: number;
  readonly glideTo?: number;
  readonly duration: number;
  readonly gain?: number;
  readonly delay?: number;
}): void {
  tone({
    freq: options.freq,
    glideTo: options.glideTo,
    duration: options.duration,
    gain: options.gain ?? 0.34,
    delay: options.delay,
    type: "sine",
    attack: 0.004,
    decay: options.duration * 0.35,
    sustain: 0.4,
    release: options.duration * 0.5,
  });
}

/**
 * Ducks everything for a moment.
 *
 * The sidechain pump. On its own it is inaudible; under a drop it is most of
 * why the drop feels like it arrives rather than like it was mixed in.
 */
export function duckFor(amount: number, seconds: number): void {
  if (!chain) return;
  const { ctx, duck } = chain;
  const now = ctx.currentTime;
  const floor = Math.max(0.2, 1 - amount);

  duck.gain.cancelScheduledValues(now);
  duck.gain.setValueAtTime(duck.gain.value, now);
  duck.gain.linearRampToValueAtTime(floor, now + 0.012);
  duck.gain.linearRampToValueAtTime(1, now + seconds);
}

/** Everything stops. For a page leaving, or the sound being switched off. */
export function silence(): void {
  if (!chain) return;
  const { ctx, duck } = chain;
  duck.gain.cancelScheduledValues(ctx.currentTime);
  duck.gain.setValueAtTime(1, ctx.currentTime);
}
