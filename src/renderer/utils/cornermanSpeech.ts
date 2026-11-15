import type { CornermanLiveEvent } from "../../cornermanLiveEvents";
import { DEFAULT_CORNERMAN_VOICE_SETTINGS, type CornermanVoiceSettings } from "../../cornermanVoiceSettings";
import { buildCornermanVoiceTip, extractCornermanSpokenAdjustment } from "../../cornermanVoiceText";
import type { CornermanVoiceBackend, ProviderSpeechEvent, ProviderSpeechRequest } from "../../providerVoice";

export interface CornermanSpeechOptions {
  backend: CornermanVoiceBackend;
  rate: number;
  volume: number;
  voiceURI: string | null;
  model: string;
  providerVoice: string;
  instructions: string;
}

export interface CornermanSpeechAdapter {
  speak: (text: string, options: CornermanSpeechOptions, onDone: () => void) => void;
  cancel: () => void;
  dispose?: () => void;
}

interface PendingSpeech {
  id: string;
  text: string;
  priority: number;
}

interface CornermanSpeechClock {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
}

const DEFAULT_CLOCK: CornermanSpeechClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer),
};

/**
 * A one-slot, priority-aware speech queue. High-impact events replace queued
 * informational chatter, and a global cooldown prevents audio spam.
 */
export class CornermanSpeechCoach {
  private settings = DEFAULT_CORNERMAN_VOICE_SETTINGS;
  private pending: PendingSpeech | null = null;
  private active = false;
  private activeSequence = 0;
  private lastStartedAt = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly seenIds = new Map<string, number>();

  constructor(
    private readonly adapter: CornermanSpeechAdapter,
    private readonly clock: CornermanSpeechClock = DEFAULT_CLOCK,
  ) {}

  configure(settings: CornermanVoiceSettings): void {
    this.settings = settings;
    if (settings.enabled) {
      this.drain();
      return;
    }
    this.stopAll();
  }

  enqueueLiveEvent(event: CornermanLiveEvent): void {
    if (!this.settings.enabled || this.settings.liveAlerts === "off") return;
    if (this.settings.liveAlerts === "high" && event.importance !== "high") return;

    const now = this.clock.now();
    this.pruneSeen(now);
    if (this.seenIds.has(event.id)) return;
    this.seenIds.set(event.id, now);

    this.enqueue({
      id: `live:${event.id}`,
      text: buildCornermanVoiceTip(event),
      priority: event.importance === "high" ? 1 : 0,
    });
  }

  speakBetweenGameAdjustment(markdown: string): void {
    if (!this.settings.enabled || !this.settings.betweenGameAdjustments) return;
    const text = extractCornermanSpokenAdjustment(markdown);
    if (!text) return;

    // The game is over: the completed adjustment is more useful than any stale
    // live callout, so it speaks immediately and resets the normal cooldown.
    this.pending = null;
    this.clearTimer();
    if (this.active) {
      this.activeSequence++;
      this.active = false;
      this.adapter.cancel();
    }
    this.start({ id: `card:${text}`, text, priority: 2 }, true);
  }

  dispose(): void {
    this.stopAll();
    this.seenIds.clear();
    this.adapter.dispose?.();
  }

  private enqueue(item: PendingSpeech): void {
    if (!this.active && this.cooldownRemaining() <= 0) {
      this.start(item);
      return;
    }

    if (!this.pending || item.priority >= this.pending.priority) this.pending = item;
    this.drain();
  }

  private start(item: PendingSpeech, bypassCooldown = false): void {
    if (!this.settings.enabled) return;
    if (!bypassCooldown && this.cooldownRemaining() > 0) {
      this.pending = item;
      this.drain();
      return;
    }

    this.active = true;
    this.lastStartedAt = this.clock.now();
    const sequence = ++this.activeSequence;
    const finish = () => {
      if (sequence !== this.activeSequence) return;
      this.active = false;
      this.drain();
    };

    try {
      this.adapter.speak(
        item.text,
        {
          backend: this.settings.backend,
          rate: this.settings.rate,
          volume: this.settings.volume,
          voiceURI: this.settings.voiceURI,
          model: this.settings.model,
          providerVoice: this.settings.providerVoice,
          instructions: this.settings.instructions,
        },
        finish,
      );
    } catch {
      finish();
    }
  }

  private drain(): void {
    if (!this.settings.enabled || this.active || !this.pending) return;
    const remaining = this.cooldownRemaining();
    if (remaining > 0) {
      if (this.timer === null) {
        this.timer = this.clock.setTimeout(() => {
          this.timer = null;
          this.drain();
        }, remaining);
      }
      return;
    }

    this.clearTimer();
    const next = this.pending;
    this.pending = null;
    this.start(next);
  }

  private cooldownRemaining(): number {
    return Math.max(0, this.settings.cooldownSeconds * 1000 - (this.clock.now() - this.lastStartedAt));
  }

  private pruneSeen(now: number): void {
    for (const [id, seenAt] of this.seenIds) {
      if (now - seenAt > 60_000) this.seenIds.delete(id);
    }
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private stopAll(): void {
    this.pending = null;
    this.clearTimer();
    this.activeSequence++;
    if (this.active) this.adapter.cancel();
    this.active = false;
  }
}

export function createBrowserSpeechAdapter(): CornermanSpeechAdapter | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  if (typeof SpeechSynthesisUtterance === "undefined") return null;

  const synth = window.speechSynthesis;
  return {
    cancel: () => synth.cancel(),
    speak: (text, options, onDone) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options.rate;
      utterance.volume = options.volume;
      const selectedVoice = options.voiceURI
        ? synth.getVoices().find((voice) => voice.voiceURI === options.voiceURI)
        : null;
      if (selectedVoice) utterance.voice = selectedVoice;

      let finished = false;
      const finishOnce = () => {
        if (finished) return;
        finished = true;
        onDone();
      };
      utterance.onend = finishOnce;
      utterance.onerror = finishOnce;
      synth.speak(utterance);
    },
  };
}

const PROVIDER_PCM_SAMPLE_RATE = 24_000;

class StreamingPcmPlayer {
  private readonly context: AudioContext;
  private readonly gain: GainNode;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private nextStartAt = 0;
  private trailingByte: number | null = null;
  private finishTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(volume: number) {
    this.context = new AudioContext();
    this.gain = this.context.createGain();
    this.gain.gain.value = volume;
    this.gain.connect(this.context.destination);
    void this.context.resume();
  }

  push(chunk: Uint8Array): void {
    if (this.stopped || chunk.byteLength === 0) return;
    let bytes = chunk;
    if (this.trailingByte !== null) {
      const joined = new Uint8Array(chunk.byteLength + 1);
      joined[0] = this.trailingByte;
      joined.set(chunk, 1);
      bytes = joined;
      this.trailingByte = null;
    }
    if (bytes.byteLength % 2 === 1) {
      this.trailingByte = bytes[bytes.byteLength - 1]!;
      bytes = bytes.subarray(0, bytes.byteLength - 1);
    }
    if (bytes.byteLength === 0) return;

    const sampleCount = bytes.byteLength / 2;
    const audioBuffer = this.context.createBuffer(1, sampleCount, PROVIDER_PCM_SAMPLE_RATE);
    const samples = audioBuffer.getChannelData(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < sampleCount; i++) samples[i] = view.getInt16(i * 2, true) / 32768;

    const source = this.context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gain);
    source.onended = () => this.sources.delete(source);
    this.sources.add(source);
    const startAt = Math.max(this.nextStartAt, this.context.currentTime + 0.025);
    source.start(startAt);
    this.nextStartAt = startAt + audioBuffer.duration;
  }

  finish(onDone: () => void): void {
    if (this.stopped) return;
    const delayMs = Math.max(0, (this.nextStartAt - this.context.currentTime) * 1000) + 40;
    this.finishTimer = setTimeout(() => {
      this.finishTimer = null;
      this.stop();
      onDone();
    }, delayMs);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.finishTimer = null;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.sources.clear();
    void this.context.close();
  }
}

interface HybridAdapterOptions {
  purpose?: "live" | "preview";
  onError?: (message: string) => void;
}

interface ProviderVoiceBridge {
  startProviderSpeech: (request: ProviderSpeechRequest) => Promise<boolean>;
  cancelProviderSpeech: (requestId: string) => Promise<boolean>;
  onProviderSpeechEvent: (callback: (event: ProviderSpeechEvent) => void) => () => void;
}

interface ActiveProviderSpeech {
  requestId: string;
  player: StreamingPcmPlayer;
  onDone: () => void;
}

export function createHybridCornermanSpeechAdapter(
  factoryOptions: HybridAdapterOptions = {},
): CornermanSpeechAdapter | null {
  if (typeof window === "undefined") return null;
  const systemAdapter = createBrowserSpeechAdapter();
  const providerBridge = (window as unknown as { clippi?: ProviderVoiceBridge }).clippi;
  const providerAvailable =
    typeof providerBridge?.startProviderSpeech === "function" &&
    typeof providerBridge.cancelProviderSpeech === "function" &&
    typeof providerBridge.onProviderSpeechEvent === "function" &&
    typeof AudioContext !== "undefined";
  if (!systemAdapter && !providerAvailable) return null;

  let active: ActiveProviderSpeech | null = null;
  let requestSequence = 0;
  const finishActive = (requestId: string) => {
    if (active?.requestId !== requestId) return;
    const completed = active;
    completed.player.finish(() => {
      if (active?.requestId === requestId) active = null;
      completed.onDone();
    });
  };
  const failActive = (requestId: string, message: string) => {
    if (active?.requestId !== requestId) return;
    const failed = active;
    active = null;
    failed.player.stop();
    factoryOptions.onError?.(message);
    failed.onDone();
  };
  const onProviderEvent = (event: ProviderSpeechEvent) => {
    if (active?.requestId !== event.requestId) return;
    if (event.type === "chunk") active.player.push(event.chunk);
    else if (event.type === "done") finishActive(event.requestId);
    else if (event.type === "error") failActive(event.requestId, event.message);
    else if (event.type === "cancelled") failActive(event.requestId, "Provider voice request was cancelled.");
  };
  const unsubscribe = providerAvailable ? providerBridge.onProviderSpeechEvent(onProviderEvent) : () => {};

  const adapter: CornermanSpeechAdapter = {
    cancel: () => {
      systemAdapter?.cancel();
      if (!active) return;
      const cancelled = active;
      active = null;
      cancelled.player.stop();
      providerBridge?.cancelProviderSpeech(cancelled.requestId).catch(() => {});
    },
    speak: (text, options, onDone) => {
      adapter.cancel();
      if (options.backend === "system") {
        if (systemAdapter) systemAdapter.speak(text, options, onDone);
        else onDone();
        return;
      }
      if (!providerAvailable) {
        factoryOptions.onError?.("Provider voice playback is unavailable in this window.");
        onDone();
        return;
      }

      let player: StreamingPcmPlayer;
      try {
        player = new StreamingPcmPlayer(options.volume);
      } catch (error) {
        factoryOptions.onError?.(error instanceof Error ? error.message : String(error));
        onDone();
        return;
      }
      const requestId = `cornerman-voice-${Date.now()}-${++requestSequence}`;
      active = { requestId, player, onDone };
      providerBridge
        .startProviderSpeech({
          requestId,
          purpose: factoryOptions.purpose ?? "live",
          provider: options.backend,
          model: options.model,
          voice: options.providerVoice,
          text,
          instructions: options.instructions || null,
          speed: options.rate,
        })
        .catch((error: unknown) => {
          failActive(requestId, error instanceof Error ? error.message : String(error));
        });
    },
    dispose: () => {
      adapter.cancel();
      unsubscribe();
    },
  };
  return adapter;
}

export function createHybridCornermanSpeechCoach(onError?: (message: string) => void): CornermanSpeechCoach | null {
  const adapter = createHybridCornermanSpeechAdapter({ purpose: "live", ...(onError ? { onError } : {}) });
  return adapter ? new CornermanSpeechCoach(adapter) : null;
}
