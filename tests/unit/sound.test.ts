import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildChain, duckFor, isReady, noise, sub, teardown, tone } from "@/lib/sound/engine";
import { noteLoss, noteWin, play, setSoundEnabled } from "@/lib/sound";

/**
 * A minimal Web Audio stand-in.
 *
 * jsdom has no audio at all, so the alternative to a stub is no coverage on the
 * layer that was just rewritten from scratch. This does not prove anything
 * sounds good — nothing automated can — but it does prove the graph builds, the
 * nodes connect, every voice schedules and stops, and no envelope ever hands an
 * exponential ramp a zero, which is the failure that silently kills a Web Audio
 * mix in production and throws nothing.
 */

interface Recorded {
  readonly kind: string;
  connections: number;
}

class FakeParam {
  readonly events: { method: string; value: number; when: number }[] = [];
  value = 0;

  setValueAtTime(value: number, when: number) {
    this.record("setValueAtTime", value, when);
  }
  linearRampToValueAtTime(value: number, when: number) {
    this.record("linearRampToValueAtTime", value, when);
  }
  exponentialRampToValueAtTime(value: number, when: number) {
    this.record("exponentialRampToValueAtTime", value, when);
  }
  cancelScheduledValues(when: number) {
    this.record("cancelScheduledValues", 0, when);
  }

  private record(method: string, value: number, when: number) {
    if (!Number.isFinite(value) || !Number.isFinite(when)) {
      throw new Error(`${method} given a non-finite argument: ${value} at ${when}`);
    }
    if (method === "exponentialRampToValueAtTime" && value === 0) {
      // The real API throws on this; a stub that shrugs would hide the bug.
      throw new Error("exponentialRampToValueAtTime(0) is not allowed");
    }
    this.events.push({ method, value, when });
  }
}

class FakeNode {
  connections: FakeNode[] = [];
  constructor(readonly kind: string) {}
  connect(target: FakeNode) {
    this.connections.push(target);
    return target;
  }
  disconnect() {}
}

class FakeContext {
  currentTime = 0;
  sampleRate = 48_000;
  readonly created: Recorded[] = [];
  readonly nodes: FakeNode[] = [];
  readonly started: number[] = [];
  readonly stopped: number[] = [];
  destination = new FakeNode("destination");

  private track<T extends FakeNode>(node: T): T {
    this.created.push({ kind: node.kind, connections: 0 });
    this.nodes.push(node);
    return node;
  }

  createGain() {
    const node = this.track(new FakeNode("gain")) as FakeNode & { gain: FakeParam };
    node.gain = new FakeParam();
    return node;
  }

  createOscillator() {
    const node = this.track(new FakeNode("oscillator")) as FakeNode & {
      type: string;
      frequency: FakeParam;
      detune: FakeParam;
      start: (at: number) => void;
      stop: (at: number) => void;
    };
    node.type = "sine";
    node.frequency = new FakeParam();
    node.detune = new FakeParam();
    node.start = (at: number) => void this.started.push(at);
    node.stop = (at: number) => void this.stopped.push(at);
    return node;
  }

  createBiquadFilter() {
    const node = this.track(new FakeNode("filter")) as FakeNode & {
      type: string;
      frequency: FakeParam;
      Q: FakeParam;
      gain: FakeParam;
    };
    node.type = "lowpass";
    node.frequency = new FakeParam();
    node.Q = new FakeParam();
    node.gain = new FakeParam();
    return node;
  }

  createStereoPanner() {
    const node = this.track(new FakeNode("panner")) as FakeNode & { pan: FakeParam };
    node.pan = new FakeParam();
    return node;
  }

  createDynamicsCompressor() {
    const node = this.track(new FakeNode("compressor")) as FakeNode & Record<string, FakeParam>;
    for (const key of ["threshold", "knee", "ratio", "attack", "release"]) {
      node[key] = new FakeParam();
    }
    return node;
  }

  createConvolver() {
    return this.track(new FakeNode("convolver")) as FakeNode & { buffer: unknown };
  }

  createDelay() {
    const node = this.track(new FakeNode("delay")) as FakeNode & { delayTime: FakeParam };
    node.delayTime = new FakeParam();
    return node;
  }

  createBuffer(channels: number, frames: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(frames));
    return {
      length: frames,
      numberOfChannels: channels,
      getChannelData: (channel: number) => data[channel] as Float32Array,
    };
  }

  createBufferSource() {
    const node = this.track(new FakeNode("source")) as FakeNode & {
      buffer: unknown;
      start: (at: number) => void;
      stop: (at: number) => void;
    };
    node.start = (at: number) => void this.started.push(at);
    node.stop = (at: number) => void this.stopped.push(at);
    return node;
  }
}

function start(): FakeContext {
  const ctx = new FakeContext();
  buildChain(ctx as unknown as AudioContext, 0.9);
  return ctx;
}

beforeEach(() => {
  // The module remembers whether sound is on; the tests need it on.
  setSoundEnabled(true);
  noteLoss();
});

afterEach(() => {
  teardown();
});

describe("the audio chain", () => {
  it("is not ready until it is built", () => {
    expect(isReady()).toBe(false);
    start();
    expect(isReady()).toBe(true);
  });

  it("builds the whole signal path", () => {
    const ctx = start();
    const kinds = ctx.created.map((node) => node.kind);

    // Glue and a limiter, not one compressor doing both jobs.
    expect(kinds.filter((kind) => kind === "compressor")).toHaveLength(2);
    // A room, and a ping-pong delay is two delays.
    expect(kinds).toContain("convolver");
    expect(kinds.filter((kind) => kind === "delay")).toHaveLength(2);
  });

  it("reaches the speakers, and a voice reaches the chain", () => {
    const ctx = start();
    // Exactly one thing may touch the output: the master gain.
    expect(inboundTo(ctx, ctx.destination)).toHaveLength(1);

    const before = ctx.nodes.length;
    tone({ freq: 440, duration: 0.2, sends: { reverb: 0.4, delay: 0.2 } });
    // A voice with both sends must connect onward, not dangle.
    const added = ctx.nodes.slice(before);
    expect(added.some((node) => node.connections.length > 0)).toBe(true);
  });
});

describe("voices", () => {
  it("schedules a tone and stops it again", () => {
    const ctx = start();
    tone({ freq: 440, duration: 0.3, gain: 0.2 });

    expect(ctx.started).toHaveLength(1);
    expect(ctx.stopped).toHaveLength(1);
    // Every voice must be released, or the graph grows without bound.
    expect(ctx.stopped[0]).toBeGreaterThan(ctx.started[0] ?? 0);
  });

  it("stacks a supersaw into one oscillator per voice", () => {
    const ctx = start();
    tone({ freq: 220, duration: 0.4, voices: 7, spread: 24 });
    expect(ctx.started).toHaveLength(7);
    expect(ctx.created.filter((node) => node.kind === "panner").length).toBeGreaterThanOrEqual(7);
  });

  it("never asks for an exponential ramp to zero", () => {
    // The whole envelope is exponential ramps, and the real API throws on a
    // target of zero. A gain of zero, a duration of zero and a silent voice all
    // have to survive it.
    const ctx = start();
    expect(() => {
      tone({ freq: 440, duration: 0.001, gain: 0 });
      tone({ freq: 440, duration: 0, gain: 0.2 });
      noise({ duration: 0.001, gain: 0 });
      sub({ freq: 40, duration: 0.001, gain: 0 });
    }).not.toThrow();
    expect(ctx.started.length).toBeGreaterThan(0);
  });

  it("survives a filter sweep to nothing", () => {
    start();
    expect(() =>
      tone({ freq: 300, duration: 0.2, filter: { freq: 4000, to: 0 } }),
    ).not.toThrow();
    expect(() => noise({ duration: 0.2, filter: { freq: 4000, to: 0 } })).not.toThrow();
  });

  it("does nothing at all before the chain exists", () => {
    // Every game calls these on the first tap, which may land before the audio
    // context has been unlocked. They must be silent no-ops, not exceptions.
    expect(isReady()).toBe(false);
    expect(() => {
      tone({ freq: 440, duration: 0.2 });
      noise({ duration: 0.2 });
      duckFor(0.5, 0.3);
    }).not.toThrow();
  });
});

/** Every node that connects into `target`. */
function inboundTo(ctx: FakeContext, target: FakeNode): FakeNode[] {
  return ctx.nodes.filter((node) => node.connections.includes(target));
}

describe("the win streak", () => {
  it("climbs on consecutive wins and caps", () => {
    // A streak is a real thing that is really happening, so reflecting it in
    // the pitch is honest. It has to stop climbing somewhere.
    expect(noteWin()).toBe(1);
    expect(noteWin()).toBe(2);
    for (let i = 0; i < 20; i += 1) noteWin();
    expect(noteWin()).toBe(6);
  });

  it("resets on a loss", () => {
    noteWin();
    noteWin();
    noteLoss();
    expect(noteWin()).toBe(1);
  });

  it("resets when a losing sound plays, from wherever it was played", () => {
    // The guard that matters: a streak surviving a bust would be the audio
    // telling the player something untrue about their own session.
    start();
    noteWin();
    noteWin();
    play("lose");
    expect(noteWin()).toBe(1);

    noteWin();
    play("break");
    expect(noteWin()).toBe(1);
  });

  it("never sounds a loss like a win", () => {
    // The gambling literature on losses disguised as wins is unambiguous:
    // celebratory audio over a losing outcome makes players overestimate how
    // often they won. A loss must schedule strictly less than a win does.
    const losing = new FakeContext();
    buildChain(losing as unknown as AudioContext, 0.9);
    play("lose");
    const lossVoices = losing.started.length;
    teardown();

    const winning = new FakeContext();
    buildChain(winning as unknown as AudioContext, 0.9);
    play("win", 1);
    const winVoices = winning.started.length;

    expect(lossVoices).toBeGreaterThan(0);
    expect(winVoices).toBeGreaterThan(lossVoices * 3);
  });
});
