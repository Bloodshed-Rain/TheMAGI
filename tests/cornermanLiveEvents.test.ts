import { describe, expect, it } from "vitest";
import type { ConversionType, FramesType } from "@slippi/slippi-js/node";

import {
  detectLiveConversionEvents,
  detectLiveFrameEvents,
  detectLiveItemEvents,
  markObservedItemInstances,
  type CornermanLivePlayer,
} from "../src/cornermanLiveEvents";
import {
  MOVE_BAIR,
  MOVE_DAIR,
  MOVE_DSMASH,
  MOVE_FAIR,
  MOVE_NEUTRAL_B,
  MOVE_PUMMEL,
  MOVE_SHINE,
  MOVE_USMASH,
  MOVE_UTHROW,
} from "../src/pipeline/signatureStats";

const players: CornermanLivePlayer[] = [
  {
    playerIndex: 0,
    tag: "TARGET",
    connectCode: "TGT#1",
    character: "Marth",
    isTarget: true,
  },
  {
    playerIndex: 1,
    tag: "OPP",
    connectCode: "OPP#2",
    character: "Fox",
    isTarget: false,
  },
];

function conversion(overrides: Partial<ConversionType>): ConversionType {
  return {
    playerIndex: 1,
    startFrame: 120,
    endFrame: 180,
    startPercent: 30,
    currentPercent: 72,
    endPercent: 72,
    moves: [],
    didKill: false,
    openingType: "neutral-win",
    lastHitBy: 0,
    ...overrides,
  } as ConversionType;
}

function framesWithPosts(
  entries: Record<
    number,
    Record<number, { stocksRemaining?: number; actionStateId?: number; positionX?: number; positionY?: number }>
  >,
): FramesType {
  const frames: FramesType = {};
  for (const [frameKey, playersForFrame] of Object.entries(entries)) {
    const frame = Number(frameKey);
    frames[frame] = {
      frame,
      start: undefined,
      players: Object.fromEntries(
        Object.entries(playersForFrame).map(([playerIndex, post]) => [
          Number(playerIndex),
          {
            pre: {} as never,
            post: {
              frame,
              playerIndex: Number(playerIndex),
              ...post,
            },
          },
        ]),
      ),
      followers: {},
      items: undefined,
      stageEvents: undefined,
    };
  }
  return frames;
}

describe("detectLiveConversionEvents", () => {
  it("alerts on Marth Ken combos", () => {
    const events = detectLiveConversionEvents({
      conversions: [
        conversion({
          moves: [
            { playerIndex: 0, frame: 130, moveId: MOVE_FAIR, hitCount: 1, damage: 12 },
            { playerIndex: 0, frame: 150, moveId: MOVE_FAIR, hitCount: 1, damage: 12 },
            { playerIndex: 0, frame: 170, moveId: MOVE_DAIR, hitCount: 1, damage: 15 },
          ],
          didKill: true,
        }),
      ],
      players,
      seenKeys: new Set(),
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("ken-combo");
    expect(events[0].title).toBe("Ken Combo");
    expect(events[0].body).toContain("You hit OPP");
  });

  it("alerts on Fox waveshine upsmashes", () => {
    const seenKeys = new Set<string>();
    const events = detectLiveConversionEvents({
      conversions: [
        conversion({
          playerIndex: 0,
          moves: [
            { playerIndex: 1, frame: 130, moveId: MOVE_SHINE, hitCount: 1, damage: 3 },
            { playerIndex: 1, frame: 150, moveId: MOVE_SHINE, hitCount: 1, damage: 3 },
            { playerIndex: 1, frame: 170, moveId: MOVE_USMASH, hitCount: 1, damage: 18 },
          ],
          didKill: true,
        }),
      ],
      players,
      seenKeys,
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("waveshine");
    expect(events[0].title).toBe("Shine → Up Smash kill");

    const duplicate = detectLiveConversionEvents({
      conversions: [
        conversion({
          playerIndex: 0,
          moves: [
            { playerIndex: 1, frame: 130, moveId: MOVE_SHINE, hitCount: 1, damage: 3 },
            { playerIndex: 1, frame: 150, moveId: MOVE_SHINE, hitCount: 1, damage: 3 },
            { playerIndex: 1, frame: 170, moveId: MOVE_USMASH, hitCount: 1, damage: 18 },
          ],
          didKill: true,
        }),
      ],
      players,
      seenKeys,
    });
    expect(duplicate).toHaveLength(0);
  });

  it("alerts on high-damage combo kills", () => {
    const events = detectLiveConversionEvents({
      conversions: [
        conversion({
          moves: [
            { playerIndex: 0, frame: 130, moveId: 13, hitCount: 1, damage: 12 },
            { playerIndex: 0, frame: 150, moveId: 16, hitCount: 1, damage: 12 },
            { playerIndex: 0, frame: 170, moveId: 10, hitCount: 1, damage: 32 },
          ],
          endPercent: 92,
          currentPercent: 92,
          didKill: true,
        }),
      ],
      players: [{ ...players[0], character: "Falcon" }, players[1]],
      seenKeys: new Set(),
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("high-combo-kill");
    expect(events[0].body).toContain("62%");
  });

  it("alerts on universal huge non-kill conversions", () => {
    const events = detectLiveConversionEvents({
      conversions: [
        conversion({
          moves: [
            { playerIndex: 0, frame: 130, moveId: 13, hitCount: 1, damage: 20 },
            { playerIndex: 0, frame: 150, moveId: 16, hitCount: 1, damage: 24 },
            { playerIndex: 0, frame: 170, moveId: 10, hitCount: 1, damage: 26 },
          ],
          startPercent: 10,
          endPercent: 80,
          currentPercent: 80,
        }),
      ],
      players: [{ ...players[0], character: "Falcon" }, players[1]],
      seenKeys: new Set(),
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("huge-conversion");
    expect(events[0].title).toBe("Huge Conversion");
  });

  it("prioritizes Fox shine spikes over generic offstage kills", () => {
    const events = detectLiveConversionEvents({
      conversions: [
        conversion({
          playerIndex: 0,
          startPercent: 18,
          endFrame: 180,
          moves: [{ playerIndex: 1, frame: 170, moveId: MOVE_SHINE, hitCount: 1, damage: 3 }],
          didKill: true,
        }),
      ],
      players,
      frames: framesWithPosts({
        180: {
          0: { positionX: 95, positionY: -20, stocksRemaining: 2 },
        },
      }),
      stageId: 31,
      seenKeys: new Set(),
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("shine-spike");
  });

  it("alerts on Falco pillar combos", () => {
    const events = detectLiveConversionEvents({
      conversions: [
        conversion({
          playerIndex: 0,
          moves: [
            { playerIndex: 1, frame: 130, moveId: MOVE_DAIR, hitCount: 1, damage: 12 },
            { playerIndex: 1, frame: 145, moveId: MOVE_SHINE, hitCount: 1, damage: 4 },
            { playerIndex: 1, frame: 165, moveId: MOVE_DAIR, hitCount: 1, damage: 12 },
          ],
        }),
      ],
      players: [players[0], { ...players[1], character: "Falco" }],
      seenKeys: new Set(),
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("pillar-combo");
  });

  it("alerts on Puff rest kills and bair strings", () => {
    const rest = detectLiveConversionEvents({
      conversions: [
        conversion({
          playerIndex: 0,
          moves: [
            { playerIndex: 1, frame: 130, moveId: MOVE_BAIR, hitCount: 1, damage: 12 },
            { playerIndex: 1, frame: 145, moveId: MOVE_SHINE, hitCount: 1, damage: 34 },
          ],
          didKill: true,
        }),
      ],
      players: [players[0], { ...players[1], character: "Puff" }],
      seenKeys: new Set(),
    });
    expect(rest[0].type).toBe("rest-kill");

    const bairString = detectLiveConversionEvents({
      conversions: [
        conversion({
          playerIndex: 0,
          moves: [
            { playerIndex: 1, frame: 130, moveId: MOVE_BAIR, hitCount: 1, damage: 10 },
            { playerIndex: 1, frame: 145, moveId: MOVE_BAIR, hitCount: 1, damage: 10 },
            { playerIndex: 1, frame: 165, moveId: MOVE_BAIR, hitCount: 1, damage: 10 },
          ],
        }),
      ],
      players: [players[0], { ...players[1], character: "Puff" }],
      seenKeys: new Set(),
    });
    expect(bairString[0].type).toBe("bair-string");
  });

  it("alerts on ICs wobbles and Peach downsmash kills", () => {
    const wobble = detectLiveConversionEvents({
      conversions: [
        conversion({
          moves: Array.from({ length: 8 }, (_, i) => ({
            playerIndex: 0,
            frame: 130 + i,
            moveId: MOVE_PUMMEL,
            hitCount: 1,
            damage: 3,
          })),
        }),
      ],
      players: [{ ...players[0], character: "ICs" }, players[1]],
      seenKeys: new Set(),
    });
    expect(wobble[0].type).toBe("wobble");

    const dsmash = detectLiveConversionEvents({
      conversions: [
        conversion({
          moves: [{ playerIndex: 0, frame: 130, moveId: MOVE_DSMASH, hitCount: 1, damage: 24 }],
          didKill: true,
        }),
      ],
      players: [{ ...players[0], character: "Peach" }, players[1]],
      seenKeys: new Set(),
    });
    expect(dsmash[0].type).toBe("dsmash-kill");
  });

  it("alerts on Samus charge shot and Pikachu thunder kills", () => {
    const chargeShot = detectLiveConversionEvents({
      conversions: [
        conversion({
          moves: [{ playerIndex: 0, frame: 130, moveId: MOVE_NEUTRAL_B, hitCount: 1, damage: 30 }],
          didKill: true,
        }),
      ],
      players: [{ ...players[0], character: "Samus" }, players[1]],
      seenKeys: new Set(),
    });
    expect(chargeShot[0].type).toBe("charge-shot");

    const thunder = detectLiveConversionEvents({
      conversions: [
        conversion({
          moves: [{ playerIndex: 0, frame: 130, moveId: MOVE_SHINE, hitCount: 1, damage: 28 }],
          didKill: true,
        }),
      ],
      players: [{ ...players[0], character: "Pikachu" }, players[1]],
      seenKeys: new Set(),
    });
    expect(thunder[0].type).toBe("thunder-kill");
  });

  it("alerts on throw-based kill confirms like Fox upthrow upair", () => {
    const events = detectLiveConversionEvents({
      conversions: [
        conversion({
          playerIndex: 0,
          startPercent: 92,
          moves: [
            { playerIndex: 1, frame: 130, moveId: MOVE_UTHROW, hitCount: 1, damage: 4 },
            { playerIndex: 1, frame: 160, moveId: 16, hitCount: 1, damage: 14 },
          ],
          didKill: true,
        }),
      ],
      players,
      seenKeys: new Set(),
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("upthrow-upair");
  });

  it("does not replay events before the requested frame", () => {
    const events = detectLiveConversionEvents({
      conversions: [
        conversion({
          endFrame: 180,
          moves: [
            { playerIndex: 0, frame: 130, moveId: MOVE_FAIR, hitCount: 1, damage: 12 },
            { playerIndex: 0, frame: 170, moveId: MOVE_DAIR, hitCount: 1, damage: 15 },
          ],
        }),
      ],
      players,
      seenKeys: new Set(),
      minEventFrame: 181,
    });

    expect(events).toHaveLength(0);
  });

  it("emits an in-progress conversion exactly once, after it closes", () => {
    // Live polling sees the same conversion twice: open (endFrame null) and
    // then closed. Keying on the mutable endFrame used to alert both times.
    const moves = [
      { playerIndex: 0, frame: 130, moveId: MOVE_DSMASH, hitCount: 1, damage: 14 },
      { playerIndex: 0, frame: 200, moveId: MOVE_DSMASH, hitCount: 1, damage: 13 },
      { playerIndex: 0, frame: 300, moveId: MOVE_DSMASH, hitCount: 1, damage: 14 },
    ];
    const seenKeys = new Set<string>();
    const peachPlayers: CornermanLivePlayer[] = [
      { ...players[0]!, character: "Peach" },
      { ...players[1]!, character: "Fox" },
    ];

    const whileOpen = detectLiveConversionEvents({
      conversions: [conversion({ endFrame: null, currentPercent: 60, endPercent: null as never, moves })],
      players: peachPlayers,
      seenKeys,
    });
    expect(whileOpen).toHaveLength(0);

    const afterClose = detectLiveConversionEvents({
      conversions: [conversion({ endFrame: 360, moves })],
      players: peachPlayers,
      seenKeys,
    });
    expect(afterClose).toHaveLength(1);

    const replayed = detectLiveConversionEvents({
      conversions: [conversion({ endFrame: 360, moves })],
      players: peachPlayers,
      seenKeys,
    });
    expect(replayed).toHaveLength(0);
  });

  it("emits open conversions when allowed (game ended, endFrame will never close)", () => {
    const seenKeys = new Set<string>();
    const openConversion = conversion({
      endFrame: null,
      moves: [
        { playerIndex: 0, frame: 130, moveId: 13, hitCount: 1, damage: 20 },
        { playerIndex: 0, frame: 150, moveId: 16, hitCount: 1, damage: 24 },
        { playerIndex: 0, frame: 170, moveId: 10, hitCount: 1, damage: 26 },
      ],
      startPercent: 10,
      endPercent: 80,
      currentPercent: 80,
    });
    const falconPlayers: CornermanLivePlayer[] = [{ ...players[0]!, character: "Falcon" }, players[1]!];

    // Not emitted while the game is live and the conversion could still close…
    const whileLive = detectLiveConversionEvents({
      conversions: [openConversion],
      players: falconPlayers,
      seenKeys,
    });
    expect(whileLive).toHaveLength(0);

    // …but after game end (allowOpenConversions) it must not be lost.
    const events = detectLiveConversionEvents({
      conversions: [openConversion],
      players: falconPlayers,
      seenKeys,
      allowOpenConversions: true,
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("huge-conversion");

    // Re-detection after game end must not duplicate: the key is stable now.
    const again = detectLiveConversionEvents({
      conversions: [openConversion],
      players: falconPlayers,
      seenKeys,
      allowOpenConversions: true,
    });
    expect(again).toHaveLength(0);
  });

  it("still emits a kill conversion even if its endFrame is unset", () => {
    const events = detectLiveConversionEvents({
      conversions: [
        conversion({
          endFrame: null,
          didKill: true,
          moves: [
            { playerIndex: 0, frame: 130, moveId: MOVE_FAIR, hitCount: 1, damage: 12 },
            { playerIndex: 0, frame: 170, moveId: MOVE_DAIR, hitCount: 1, damage: 55 },
          ],
        }),
      ],
      players,
      seenKeys: new Set(),
    });

    expect(events.length).toBeGreaterThan(0);
  });
});

describe("detectLiveItemEvents", () => {
  it("alerts on Peach stitch pulls", () => {
    const frames = {
      240: {
        frame: 240,
        start: undefined,
        players: {},
        followers: {},
        items: [{ frame: 240, typeId: 99, turnipFace: 7, owner: 0, spawnId: 42 }],
        stageEvents: undefined,
      },
    } as FramesType;

    const events = detectLiveItemEvents({
      frames,
      players: [{ ...players[0], character: "Peach" }, players[1]],
      seenKeys: new Set(),
      fromFrame: 200,
      toFrame: 260,
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("stitch-face");
    expect(events[0].body).toContain("You pulled a stitch face");
  });

  it("alerts on Peach rare item pulls", () => {
    const frames = {
      240: {
        frame: 240,
        start: undefined,
        players: {},
        followers: {},
        items: [{ frame: 240, typeId: 6, owner: 0, spawnId: 43 }],
        stageEvents: undefined,
      },
    } as FramesType;

    const events = detectLiveItemEvents({
      frames,
      players: [{ ...players[0], character: "Peach" }, players[1]],
      seenKeys: new Set(),
      fromFrame: 200,
      toFrame: 260,
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("rare-item");
    expect(events[0].title).toBe("Bob-omb");
  });

  it("does not call later Peach ownership a rare item pull", () => {
    const frames = {
      220: {
        frame: 220,
        start: undefined,
        players: {},
        followers: {},
        items: [{ frame: 220, typeId: 6, owner: -1, spawnId: 43 }],
        stageEvents: undefined,
      },
      240: {
        frame: 240,
        start: undefined,
        players: {},
        followers: {},
        items: [{ frame: 240, typeId: 6, owner: 0, spawnId: 43 }],
        stageEvents: undefined,
      },
    } as FramesType;

    const events = detectLiveItemEvents({
      frames,
      players: [{ ...players[0], character: "Peach" }, players[1]],
      seenKeys: new Set(),
      fromFrame: 200,
      toFrame: 260,
    });

    expect(events).toHaveLength(0);
  });

  it("does not alert on rare items observed before live monitoring starts", () => {
    const frames = {
      220: {
        frame: 220,
        start: undefined,
        players: {},
        followers: {},
        items: [{ frame: 220, typeId: 7, owner: 0, spawnId: 44 }],
        stageEvents: undefined,
      },
      240: {
        frame: 240,
        start: undefined,
        players: {},
        followers: {},
        items: [{ frame: 240, typeId: 7, owner: 0, spawnId: 44 }],
        stageEvents: undefined,
      },
    } as FramesType;
    const seenKeys = new Set<string>();
    markObservedItemInstances({ frames, seenKeys, fromFrame: 200, toFrame: 220 });

    const events = detectLiveItemEvents({
      frames,
      players: [{ ...players[0], character: "Peach" }, players[1]],
      seenKeys,
      fromFrame: 221,
      toFrame: 260,
    });

    expect(events).toHaveLength(0);
  });
});

describe("detectLiveFrameEvents", () => {
  it("alerts on shield breaks", () => {
    const events = detectLiveFrameEvents({
      frames: framesWithPosts({
        300: { 0: { actionStateId: 179, stocksRemaining: 3 } },
        301: { 0: { actionStateId: 205, stocksRemaining: 3 } },
      }),
      conversions: [],
      players,
      seenKeys: new Set(),
      fromFrame: 300,
      toFrame: 301,
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("shield-break");
  });

  it("alerts on stock drops without a killing conversion", () => {
    const events = detectLiveFrameEvents({
      frames: framesWithPosts({
        400: { 0: { actionStateId: 236, stocksRemaining: 3 } },
        401: { 0: { actionStateId: 0, stocksRemaining: 2 } },
      }),
      conversions: [],
      players,
      seenKeys: new Set(),
      fromFrame: 400,
      toFrame: 401,
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("self-destruct");
    expect(events[0].title).toBe("Air-Dodge Death");
  });
});
