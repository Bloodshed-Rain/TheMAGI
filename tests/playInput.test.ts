import fs from "fs";
import path from "path";
import {
  Command,
  ConnectionEvent,
  ConnectionStatus,
  SlippiGame,
  SlpStream,
  SlpStreamEvent,
  type GameStartType,
} from "@slippi/slippi-js/node";
import { matchTargetPlayerIndex } from "../src/cornermanLiveMonitor";
import { PlayInputStream, type PlayInputConnection } from "../src/main/playInputStream";
import {
  MAX_PLAY_INPUT_BATCH,
  mergePlayInputSamples,
  nextPlayInputPaint,
  playInputStatusText,
  queuePlayInputSamples,
  type PlayInputSample,
  type PlayInputStatus,
} from "../src/playInput";
import { PlayInputTracker, identifyPlayInputPlayer, type PlayInputEvent } from "../src/playInputTracker";
import { parseSlippiSpectatorSettings } from "../src/slippiReplaySetup";

const FIXTURE = path.join(__dirname, "fixtures", "game1.slp");
const FIXTURE_2 = path.join(__dirname, "fixtures", "game2.slp");
// game1/game2: port 1 is SLOP#790, port 2 is INRI#666 (playerIndex 0 and 1).
const INPUT_FIELDS = [
  "physicalButtons",
  "joystickX",
  "joystickY",
  "cStickX",
  "cStickY",
  "physicalLTrigger",
  "physicalRTrigger",
] as const;

/** The event bytes of a .slp file: exactly what Dolphin sends over its spectator stream. */
function rawEvents(file: string): Buffer {
  const buffer = fs.readFileSync(file);
  expect(buffer.subarray(0, 11).toString("latin1")).toBe("{U\u0003raw[$U#l");
  return buffer.subarray(15, 15 + buffer.readUInt32BE(11));
}
function replay(file: string, target: string | null, chunk = 997): PlayInputEvent[] {
  const tracker = new PlayInputTracker(() => target);
  const stream = new SlpStream();
  const events: PlayInputEvent[] = [];
  stream.on(SlpStreamEvent.COMMAND, ({ command, payload }) => {
    const event = tracker.handle(command, payload);
    if (event) events.push(event);
  });
  const raw = rawEvents(file);
  for (let i = 0; i < raw.length; i += chunk) stream.process(raw.subarray(i, Math.min(raw.length, i + chunk)));
  return events;
}
const samplesOf = (events: PlayInputEvent[]) =>
  events.flatMap((event) => (event.type === "sample" ? [event.sample] : []));
const sample = (frame: number, physicalButtons: number, extra: Partial<PlayInputSample> = {}): PlayInputSample => ({
  frame,
  playerIndex: 0,
  physicalButtons,
  joystickX: 0,
  joystickY: 0,
  cStickX: 0,
  cStickY: 0,
  physicalLTrigger: 0,
  physicalRTrigger: 0,
  ...extra,
});
const settings = (players: Array<Partial<GameStartType["players"][number]>>) =>
  ({
    players: players.map((player, playerIndex) => ({
      playerIndex,
      type: 0,
      connectCode: "",
      displayName: "",
      nametag: "",
      characterId: 0,
      ...player,
    })),
  }) as unknown as GameStartType;
const pre = (playerIndex: number, frame: number, physicalButtons = 0, isFollower = false) => ({
  frame,
  playerIndex,
  isFollower,
  physicalButtons,
  joystickX: 0,
  joystickY: 0,
  cStickX: 0,
  cStickY: 0,
  physicalLTrigger: 0,
  physicalRTrigger: 0,
});

describe("identifying the user's player", () => {
  const game = new SlippiGame(FIXTURE).getSettings()!;
  it("finds the player a connect code names, whatever its case", () => {
    expect(matchTargetPlayerIndex(game, "SLOP#790")).toBe(0);
    expect(matchTargetPlayerIndex(game, "inri#666")).toBe(1);
    expect(identifyPlayInputPlayer(game, " INRI#666 ")).toBe(1);
  });
  it("returns nobody rather than the first player when the code matches no one", () => {
    expect(matchTargetPlayerIndex(game, "ZZZZ#123")).toBeNull();
    expect(matchTargetPlayerIndex(game, "   ")).toBeNull();
    expect(identifyPlayInputPlayer(game, "ZZZZ#123")).toBeNull();
    expect(identifyPlayInputPlayer(game, null)).toBeNull();
  });
  it("takes the only human in an offline game against a CPU", () => {
    const offline = settings([{ type: 1 }, { type: 0 }, { type: 3 }, { type: 3 }]);
    expect(identifyPlayInputPlayer(offline, null)).toBe(1);
    expect(identifyPlayInputPlayer(offline, "ZZZZ#123")).toBe(1);
  });
  it("does not guess between two unnamed humans, or pick a CPU", () => {
    expect(identifyPlayInputPlayer(settings([{ type: 0 }, { type: 0 }]), null)).toBeNull();
    expect(identifyPlayInputPlayer(settings([{ type: 1 }, { type: 1 }]), null)).toBeNull();
  });
  it("never matches an empty slot", () => {
    expect(
      matchTargetPlayerIndex(settings([{ type: 3, connectCode: "SLOP#790" }, { type: 0 }]), "SLOP#790"),
    ).toBeNull();
  });
});

describe("PlayInputTracker on a real game stream", () => {
  it.each([
    [FIXTURE, "SLOP#790", 0],
    [FIXTURE, "INRI#666", 1],
    [FIXTURE_2, "SLOP#790", 0],
  ])("emits exactly the pre-frame pad of the user's port for every frame (%s, %s)", (file, target, playerIndex) => {
    const events = replay(file, target);
    expect(events[0]).toEqual({ type: "game", playerIndex });
    expect(events[events.length - 1]).toEqual({ type: "end" });
    const frames = new SlippiGame(file).getFrames();
    const samples = samplesOf(events);
    expect(samples.map((item) => item.frame)).toEqual(
      Object.keys(frames)
        .map(Number)
        .sort((a, b) => a - b),
    );
    for (const item of samples) {
      expect(item.playerIndex).toBe(playerIndex);
      const parsed = frames[item.frame]!.players[playerIndex]!.pre;
      for (const field of INPUT_FIELDS) expect(item[field], `${field} @ ${item.frame}`).toBe(parsed[field]);
    }
  });
  it("gives the same samples however the bytes are split", () => {
    expect(replay(FIXTURE_2, "SLOP#790", 61)).toEqual(replay(FIXTURE_2, "SLOP#790", 1 << 20));
  });
  it("stays dark for a whole game when the user is not in it", () => {
    const events = replay(FIXTURE_2, "ZZZZ#123");
    expect(events).toEqual([{ type: "game", playerIndex: null }, { type: "end" }]);
  });
});

describe("PlayInputTracker rules", () => {
  const start = (tracker: PlayInputTracker) =>
    tracker.handle(Command.GAME_START, settings([{ connectCode: "ME#1" }, { connectCode: "YOU#2" }]));
  it("ignores the opponent, and Nana on the user's own port", () => {
    const tracker = new PlayInputTracker(() => "ME#1");
    expect(start(tracker)).toEqual({ type: "game", playerIndex: 0 });
    expect(tracker.handle(Command.PRE_FRAME_UPDATE, pre(1, -123, 0x100))).toBeNull();
    expect(tracker.handle(Command.PRE_FRAME_UPDATE, pre(0, -123, 0x200, true))).toBeNull();
    expect(tracker.handle(Command.PRE_FRAME_UPDATE, pre(0, -123, 0x100))).toMatchObject({
      type: "sample",
      sample: { frame: -123, playerIndex: 0, physicalButtons: 0x100 },
    });
  });
  it("shows each frame once when a rollback re-sends it", () => {
    const tracker = new PlayInputTracker(() => "ME#1");
    start(tracker);
    const frames = [10, 11, 12, 10, 11, 12, 13].map((frame) => tracker.handle(Command.PRE_FRAME_UPDATE, pre(0, frame)));
    expect(frames.map((event) => (event?.type === "sample" ? event.sample.frame : null))).toEqual([
      10,
      11,
      12,
      null,
      null,
      null,
      13,
    ]);
  });
  it("emits nothing before a game starts or after it ends", () => {
    const tracker = new PlayInputTracker(() => "ME#1");
    expect(tracker.handle(Command.PRE_FRAME_UPDATE, pre(0, 5))).toBeNull();
    expect(tracker.handle(Command.GAME_END, {})).toBeNull();
    start(tracker);
    expect(tracker.handle(Command.GAME_END, {})).toEqual({ type: "end" });
    expect(tracker.handle(Command.PRE_FRAME_UPDATE, pre(0, 6))).toBeNull();
  });
  it("starts the next game's frames from the beginning", () => {
    const tracker = new PlayInputTracker(() => "ME#1");
    start(tracker);
    tracker.handle(Command.PRE_FRAME_UPDATE, pre(0, 4000));
    tracker.handle(Command.GAME_END, {});
    start(tracker);
    expect(tracker.handle(Command.PRE_FRAME_UPDATE, pre(0, -123))).toMatchObject({ type: "sample" });
  });
  it("re-reads who the user is at each game start", () => {
    let target = "ME#1";
    const tracker = new PlayInputTracker(() => target);
    expect(start(tracker)).toEqual({ type: "game", playerIndex: 0 });
    target = "YOU#2";
    expect(start(tracker)).toEqual({ type: "game", playerIndex: 1 });
  });
  it("drops a pre-frame update with no frame number", () => {
    const tracker = new PlayInputTracker(() => "ME#1");
    start(tracker);
    expect(tracker.handle(Command.PRE_FRAME_UPDATE, { ...pre(0, 1), frame: undefined })).toBeNull();
  });
});

describe("mergePlayInputSamples", () => {
  it("returns nothing for no samples and the sample itself for one", () => {
    expect(mergePlayInputSamples([])).toBeNull();
    expect(mergePlayInputSamples([sample(3, 0x100)])).toEqual(sample(3, 0x100));
  });
  it("keeps a press that began and ended between two paints", () => {
    const merged = mergePlayInputSamples([sample(1, 0), sample(2, 0x100), sample(3, 0)]);
    expect(merged?.frame).toBe(3);
    expect(merged?.physicalButtons).toBe(0x100);
  });
  it("takes sticks and triggers from the newest sample only", () => {
    const merged = mergePlayInputSamples([
      sample(1, 0x200, { joystickX: 1, physicalLTrigger: 1 }),
      sample(2, 0x010, { joystickX: -0.5, physicalLTrigger: 0 }),
    ]);
    expect(merged).toMatchObject({ joystickX: -0.5, physicalLTrigger: 0, physicalButtons: 0x210 });
  });
  it("does not invent a button reading the stream never carried", () => {
    const blank = { ...sample(1, 0), physicalButtons: undefined };
    expect(mergePlayInputSamples([blank, blank])?.physicalButtons).toBeUndefined();
    expect(mergePlayInputSamples([blank, sample(2, 0x400)])?.physicalButtons).toBe(0x400);
  });
});

describe("painting queued samples", () => {
  it("draws a lone sample as it is and leaves nothing for the next paint", () => {
    expect(nextPlayInputPaint([sample(5, 0x100)])).toEqual({ draw: sample(5, 0x100), carry: [] });
    expect(nextPlayInputPaint([])).toEqual({ draw: null, carry: [] });
  });
  it("shows a one-frame press on this paint and the true current state on the next", () => {
    const first = nextPlayInputPaint([sample(11, 0), sample(12, 0x200), sample(13, 0)]);
    expect(first.draw).toMatchObject({ frame: 13, physicalButtons: 0x200 });
    expect(first.carry).toEqual([sample(13, 0)]);
    const second = nextPlayInputPaint(first.carry);
    expect(second).toEqual({ draw: sample(13, 0), carry: [] });
  });
  it("keeps samples that arrive between the two paints", () => {
    const first = nextPlayInputPaint([sample(1, 0x100), sample(2, 0)]);
    const queued = queuePlayInputSamples(first.carry, [sample(3, 0x400)]);
    expect(nextPlayInputPaint(queued).draw).toMatchObject({ frame: 3, physicalButtons: 0x400 });
  });
  it("keeps only the newest samples when nothing paints for a long time", () => {
    let queue: PlayInputSample[] = [];
    for (let frame = 0; frame < 5000; frame++) queue = queuePlayInputSamples(queue, [sample(frame, 0)]);
    expect(queue).toHaveLength(MAX_PLAY_INPUT_BATCH);
    expect(queue[queue.length - 1]!.frame).toBe(4999);
    expect(queue[0]!.frame).toBe(5000 - MAX_PLAY_INPUT_BATCH);
  });
});

describe("spectator settings in Dolphin.ini", () => {
  it("reads the switch and the port from [Core]", () => {
    expect(
      parseSlippiSpectatorSettings("[Core]\nSlippiEnableSpectator = True\nSlippiSpectatorLocalPort = 51441\n"),
    ).toEqual({ enabled: true, port: 51441 });
    expect(
      parseSlippiSpectatorSettings("﻿[core]\r\nslippienablespectator=0\r\nSlippiSpectatorLocalPort=4000\r\n"),
    ).toEqual({ enabled: false, port: 4000 });
  });
  it("reports unknown rather than a default when the INI does not say", () => {
    expect(parseSlippiSpectatorSettings("[Core]\nSlippiSaveReplays = True\n")).toEqual({ enabled: null, port: null });
    expect(parseSlippiSpectatorSettings("")).toEqual({ enabled: null, port: null });
  });
  it("ignores the keys outside [Core], comments, and values that are not ports", () => {
    expect(
      parseSlippiSpectatorSettings(
        "[Display]\nSlippiEnableSpectator = False\nSlippiSpectatorLocalPort = 1\n[Core]\n; SlippiEnableSpectator = False\nSlippiSpectatorLocalPort = 99999\nSlippiEnableSpectator = maybe\n",
      ),
    ).toEqual({ enabled: null, port: null });
    for (const value of ["0", "-5", "51441.5", "port", ""])
      expect(parseSlippiSpectatorSettings(`[Core]\nSlippiSpectatorLocalPort = ${value}\n`).port).toBeNull();
  });
});

describe("playInputStatusText", () => {
  it("names the port one-based and says something for every phase", () => {
    expect(playInputStatusText({ phase: "live", playerIndex: 0 })).toContain("Port 1");
    expect(playInputStatusText({ phase: "live", playerIndex: 3 })).toContain("Port 4");
    const phases: PlayInputStatus[] = [
      { phase: "off" },
      { phase: "disabled" },
      { phase: "connecting" },
      { phase: "waiting" },
      { phase: "unidentified" },
    ];
    const texts = phases.map(playInputStatusText);
    expect(new Set(texts).size).toBe(phases.length);
    for (const text of texts) expect(text.length).toBeGreaterThan(10);
  });
});

class FakeConnection implements PlayInputConnection {
  listeners = new Map<string, Array<(value: unknown) => void>>();
  connects: Array<[string, number]> = [];
  disconnects = 0;
  fail: Error | null = null;
  on(type: string, listener: (value: never) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener as (value: unknown) => void]);
    return undefined;
  }
  connect(ip: string, port: number) {
    this.connects.push([ip, port]);
    return this.fail ? Promise.reject(this.fail) : Promise.resolve();
  }
  disconnect() {
    this.disconnects++;
  }
  emit(type: string, value?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(value);
  }
}

describe("PlayInputStream", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const setup = (options: { enabled?: boolean | null; port?: number | null; target?: string | null } = {}) => {
    const connections: FakeConnection[] = [];
    const statuses: PlayInputStatus[] = [];
    const batches: PlayInputSample[][] = [];
    const stream = new PlayInputStream({
      settings: () => ({ enabled: options.enabled ?? true, port: options.port === undefined ? 51441 : options.port }),
      target: () => (options.target === undefined ? "SLOP#790" : options.target),
      publishSamples: (samples) => batches.push(samples),
      publishStatus: (status) => statuses.push(status),
      createConnection: () => {
        const connection = new FakeConnection();
        connections.push(connection);
        return connection;
      },
      retryMs: 2000,
      lingerMs: 10_000,
    });
    return { stream, connections, statuses, batches };
  };
  const send = (connection: FakeConnection, raw: Buffer, chunk = 4096) => {
    for (let i = 0; i < raw.length; i += chunk)
      connection.emit(ConnectionEvent.DATA, raw.subarray(i, Math.min(raw.length, i + chunk)));
  };

  it("opens no connection until Melee is running and the display is showing", () => {
    const { stream, connections, statuses } = setup();
    stream.setWatching(true);
    expect(connections).toHaveLength(0);
    stream.setWatching(false);
    stream.setRunning(true);
    expect(connections).toHaveLength(0);
    expect(stream.getStatus()).toEqual({ phase: "off" });
    expect(statuses).toEqual([]);
    stream.setWatching(true);
    expect(connections).toHaveLength(1);
    expect(connections[0]!.connects).toEqual([["127.0.0.1", 51441]]);
    expect(stream.getStatus()).toEqual({ phase: "connecting" });
  });
  it("uses the port Dolphin is configured for, or Slippi's default when the INI does not say", () => {
    const custom = setup({ port: 4000 });
    custom.stream.setRunning(true);
    custom.stream.setWatching(true);
    expect(custom.connections[0]!.connects).toEqual([["127.0.0.1", 4000]]);
    const unknown = setup({ port: null });
    unknown.stream.setRunning(true);
    unknown.stream.setWatching(true);
    expect(unknown.connections[0]!.connects).toEqual([["127.0.0.1", 51441]]);
  });
  it("does not connect when Dolphin's spectator stream is turned off, and says so", () => {
    const { stream, connections } = setup({ enabled: false });
    stream.setRunning(true);
    stream.setWatching(true);
    expect(connections).toHaveLength(0);
    expect(stream.getStatus()).toEqual({ phase: "disabled" });
  });
  it("forwards a whole game: waiting, live on the user's port, every sample in order, waiting again", () => {
    const { stream, connections, statuses, batches } = setup();
    stream.setRunning(true);
    stream.setWatching(true);
    const connection = connections[0]!;
    connection.emit(ConnectionEvent.HANDSHAKE, {});
    expect(stream.getStatus()).toEqual({ phase: "waiting" });
    const raw = rawEvents(FIXTURE_2);
    // One frame's worth of bytes per event-loop turn, as a live game delivers them.
    for (let i = 0; i < raw.length; i += 420) {
      connection.emit(ConnectionEvent.DATA, raw.subarray(i, Math.min(raw.length, i + 420)));
      vi.runAllTimers();
    }
    expect(statuses).toEqual([
      { phase: "connecting" },
      { phase: "waiting" },
      { phase: "live", playerIndex: 0 },
      { phase: "waiting" },
    ]);
    const frames = new SlippiGame(FIXTURE_2).getFrames();
    const sent = batches.flat();
    expect(batches.every((batch) => batch.length >= 1 && batch.length <= MAX_PLAY_INPUT_BATCH)).toBe(true);
    expect(sent.map((item) => item.frame)).toEqual(
      Object.keys(frames)
        .map(Number)
        .sort((a, b) => a - b),
    );
    for (const item of sent)
      expect(item.physicalButtons, `frame ${item.frame}`).toBe(frames[item.frame]!.players[0]!.pre.physicalButtons);
  });
  it("sends only the tail of a backlog that arrives at once", () => {
    const { stream, connections, batches } = setup();
    stream.setRunning(true);
    stream.setWatching(true);
    const raw = rawEvents(FIXTURE_2);
    // Everything up to the middle of the game in one turn, as when joining a game in progress.
    send(connections[0]!, raw.subarray(0, Math.floor(raw.length / 2)));
    vi.runAllTimers();
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(MAX_PLAY_INPUT_BATCH);
    const frames = batches[0]!.map((item) => item.frame);
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
    expect(stream.getStatus()).toEqual({ phase: "live", playerIndex: 0 });
  });
  it("reports a game the user is not in and sends no inputs for it", () => {
    const { stream, connections, batches } = setup({ target: "ZZZZ#123" });
    stream.setRunning(true);
    stream.setWatching(true);
    send(connections[0]!, rawEvents(FIXTURE_2).subarray(0, 200_000));
    vi.runAllTimers();
    expect(stream.getStatus()).toEqual({ phase: "unidentified" });
    expect(batches).toEqual([]);
  });
  it("reconnects after the stream drops, and after a failed connect", async () => {
    const { stream, connections } = setup();
    stream.setRunning(true);
    stream.setWatching(true);
    connections[0]!.emit(ConnectionEvent.STATUS_CHANGE, ConnectionStatus.DISCONNECTED);
    expect(stream.getStatus()).toEqual({ phase: "connecting" });
    expect(connections).toHaveLength(1);
    vi.advanceTimersByTime(1999);
    expect(connections).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(connections).toHaveLength(2);

    const failing = setup();
    failing.stream.setRunning(true);
    failing.stream.setWatching(true);
    failing.connections[0]!.fail = new Error("no enet");
    failing.connections[0]!.emit(ConnectionEvent.ERROR, new Error("socket"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(failing.connections).toHaveLength(2);
  });
  it("does not treat connecting or connected status changes as a drop", () => {
    const { stream, connections } = setup();
    stream.setRunning(true);
    stream.setWatching(true);
    connections[0]!.emit(ConnectionEvent.STATUS_CHANGE, ConnectionStatus.CONNECTING);
    connections[0]!.emit(ConnectionEvent.STATUS_CHANGE, ConnectionStatus.CONNECTED);
    vi.advanceTimersByTime(10_000);
    expect(connections).toHaveLength(1);
  });
  it("disconnects when Melee stops and ignores anything the old connection says afterwards", () => {
    const { stream, connections, statuses, batches } = setup();
    stream.setRunning(true);
    stream.setWatching(true);
    const old = connections[0]!;
    stream.setRunning(false);
    expect(old.disconnects).toBe(1);
    expect(stream.getStatus()).toEqual({ phase: "off" });
    const count = statuses.length;
    old.emit(ConnectionEvent.HANDSHAKE, {});
    old.emit(ConnectionEvent.STATUS_CHANGE, ConnectionStatus.DISCONNECTED);
    send(old, rawEvents(FIXTURE_2).subarray(0, 100_000));
    vi.advanceTimersByTime(60_000);
    expect(statuses).toHaveLength(count);
    expect(batches).toEqual([]);
    expect(connections).toHaveLength(1);
  });
  it("holds the connection briefly when the display hides, and keeps it if the display returns", () => {
    const { stream, connections } = setup();
    stream.setRunning(true);
    stream.setWatching(true);
    stream.setWatching(false);
    vi.advanceTimersByTime(9000);
    expect(connections[0]!.disconnects).toBe(0);
    stream.setWatching(true);
    vi.advanceTimersByTime(60_000);
    expect(connections[0]!.disconnects).toBe(0);
    expect(connections).toHaveLength(1);
    stream.setWatching(false);
    vi.advanceTimersByTime(10_000);
    expect(connections[0]!.disconnects).toBe(1);
    expect(stream.getStatus()).toEqual({ phase: "off" });
  });
  it("tells the display again when a new game starts on the same port, so it can clear", () => {
    const { stream, connections, statuses } = setup();
    stream.setRunning(true);
    stream.setWatching(true);
    const raw = rawEvents(FIXTURE_2);
    send(connections[0]!, raw.subarray(0, 50_000));
    // The stream drops mid-game and the same game is picked up again on reconnect.
    connections[0]!.emit(ConnectionEvent.STATUS_CHANGE, ConnectionStatus.DISCONNECTED);
    vi.advanceTimersByTime(2000);
    send(connections[1]!, raw.subarray(0, 50_000));
    expect(statuses.filter((status) => status.phase === "live")).toHaveLength(2);
  });
  it("closes everything on dispose", () => {
    const { stream, connections } = setup();
    stream.setRunning(true);
    stream.setWatching(true);
    stream.dispose();
    expect(connections[0]!.disconnects).toBe(1);
    vi.advanceTimersByTime(60_000);
    expect(connections).toHaveLength(1);
    expect(stream.getStatus()).toEqual({ phase: "off" });
  });
});
