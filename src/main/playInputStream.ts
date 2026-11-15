import {
  ConnectionEvent,
  ConnectionStatus,
  DolphinConnection,
  Ports,
  SlpStream,
  SlpStreamEvent,
  SlpStreamMode,
  type ConnectionEventMap,
} from "@slippi/slippi-js/node";
import { MAX_PLAY_INPUT_BATCH, type PlayInputSample, type PlayInputStatus } from "../playInput";
import { PlayInputTracker } from "../playInputTracker";
import type { SlippiSpectatorSettings } from "../slippiReplaySetup";

/** The part of slippi-js's DolphinConnection this module uses. */
export interface PlayInputConnection {
  on<K extends keyof ConnectionEventMap>(type: K, listener: (data: ConnectionEventMap[K]) => void): unknown;
  connect(ip: string, port: number): Promise<void>;
  disconnect(): void;
}

export interface PlayInputStreamDeps {
  /** The hosted Dolphin's spectator settings, read when a connection is attempted. */
  settings: () => SlippiSpectatorSettings;
  /** The user's connect code or tag, read at the start of each game. */
  target: () => string | null;
  publishSamples: (samples: PlayInputSample[]) => void;
  publishStatus: (status: PlayInputStatus) => void;
  createConnection?: () => PlayInputConnection;
  /** Delay before reconnecting after the stream drops or cannot be reached. */
  retryMs?: number;
  /** How long to stay connected after the display stops watching. */
  lingerMs?: number;
}

/**
 * Reads the user's live controller inputs from the hosted Dolphin's local
 * spectator stream (the same stream Slippi Launcher broadcasts from) and
 * forwards them to the renderer.
 *
 * It is connected only while Melee is running AND something is showing the
 * input display, so a player who never adds the module never opens the socket.
 */
export class PlayInputStream {
  private running = false;
  private watching = false;
  private status: PlayInputStatus = { phase: "off" };
  private connection: PlayInputConnection | null = null;
  /** Bumped whenever the current connection is abandoned; stale callbacks compare against it. */
  private generation = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lingerTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: PlayInputSample[] = [];
  private flushQueued = false;

  constructor(private readonly deps: PlayInputStreamDeps) {}

  getStatus(): PlayInputStatus {
    return this.status;
  }

  /** Melee started or stopped in Play Mode. */
  setRunning(running: boolean): void {
    this.running = running;
    this.sync();
  }

  /** The input display appeared or went away. */
  setWatching(watching: boolean): void {
    if (this.lingerTimer) clearTimeout(this.lingerTimer);
    this.lingerTimer = null;
    if (!watching && this.watching && this.connection) {
      // A sidebar that auto-hides remounts the display on every edge peek;
      // holding the connection briefly avoids a reconnect each time.
      this.lingerTimer = setTimeout(() => {
        this.lingerTimer = null;
        this.watching = false;
        this.sync();
      }, this.deps.lingerMs ?? 10_000);
      this.lingerTimer.unref?.();
      return;
    }
    this.watching = watching;
    this.sync();
  }

  dispose(): void {
    if (this.lingerTimer) clearTimeout(this.lingerTimer);
    this.lingerTimer = null;
    this.running = false;
    this.watching = false;
    this.sync();
  }

  private sync(): void {
    if (this.running && this.watching) {
      if (!this.connection && !this.retryTimer) this.connect();
      return;
    }
    this.drop();
    this.setStatus({ phase: "off" });
  }

  private setStatus(status: PlayInputStatus): void {
    const same =
      status.phase === this.status.phase &&
      (status.phase !== "live" || (this.status.phase === "live" && status.playerIndex === this.status.playerIndex));
    this.status = status;
    // A new game with the same player is still news: the display must clear.
    if (!same || status.phase === "live") this.deps.publishStatus(status);
  }

  private drop(): void {
    this.generation++;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.pending = [];
    const connection = this.connection;
    this.connection = null;
    try {
      connection?.disconnect();
    } catch (error) {
      console.warn("[play] Input stream disconnect failed:", error);
    }
  }

  private retry(): void {
    this.drop();
    if (!this.running || !this.watching) return;
    this.setStatus({ phase: "connecting" });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.sync();
    }, this.deps.retryMs ?? 2000);
    this.retryTimer.unref?.();
  }

  private connect(): void {
    const settings = this.deps.settings();
    if (settings.enabled === false) {
      this.setStatus({ phase: "disabled" });
      return;
    }
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    const connection = (this.deps.createConnection ?? ((): PlayInputConnection => new DolphinConnection()))();
    this.connection = connection;
    const stream = new SlpStream({ mode: SlpStreamMode.AUTO });
    const tracker = new PlayInputTracker(this.deps.target);

    stream.on(SlpStreamEvent.COMMAND, ({ command, payload }) => {
      if (!current()) return;
      const event = tracker.handle(command, payload);
      if (!event) return;
      if (event.type === "sample") {
        this.pending.push(event.sample);
        this.queueFlush();
        return;
      }
      // Samples of the game that just ended or was replaced are stale.
      this.pending = [];
      if (event.type === "end") this.setStatus({ phase: "waiting" });
      else
        this.setStatus(
          event.playerIndex === null ? { phase: "unidentified" } : { phase: "live", playerIndex: event.playerIndex },
        );
    });
    connection.on(ConnectionEvent.HANDSHAKE, () => {
      if (current()) this.setStatus({ phase: "waiting" });
    });
    connection.on(ConnectionEvent.DATA, (data) => {
      if (!current()) return;
      try {
        stream.process(data);
      } catch (error) {
        console.warn("[play] Input stream could not be parsed; reconnecting:", error);
        this.retry();
      }
    });
    connection.on(ConnectionEvent.STATUS_CHANGE, (status) => {
      if (current() && status === ConnectionStatus.DISCONNECTED) this.retry();
    });
    connection.on(ConnectionEvent.ERROR, (error) => {
      if (!current()) return;
      console.warn("[play] Input stream error:", error);
      this.retry();
    });

    this.setStatus({ phase: "connecting" });
    connection.connect("127.0.0.1", settings.port ?? Ports.DEFAULT).catch((error: unknown) => {
      if (!current()) return;
      console.warn("[play] Could not open the input stream:", error);
      this.retry();
    });
  }

  /** One message per turn of the event loop, however many frames arrived in it. */
  private queueFlush(): void {
    if (this.flushQueued) return;
    this.flushQueued = true;
    setImmediate(() => {
      this.flushQueued = false;
      if (!this.pending.length) return;
      const samples = this.pending.slice(-MAX_PLAY_INPUT_BATCH);
      this.pending = [];
      this.deps.publishSamples(samples);
    });
  }
}
