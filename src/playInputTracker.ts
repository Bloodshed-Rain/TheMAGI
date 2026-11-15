import { Command, type GameStartType, type PreFrameUpdateType } from "@slippi/slippi-js/node";
import { matchTargetPlayerIndex } from "./cornermanLiveMonitor";
import type { PlayInputSample } from "./playInput";

export type PlayInputEvent =
  /** A game started. `playerIndex` is null when the user could not be identified. */
  { type: "game"; playerIndex: number | null } | { type: "sample"; sample: PlayInputSample } | { type: "end" };

/**
 * Which player's inputs to show: the one the user's connect code or tag
 * identifies. With no match, a game with exactly one human player (offline
 * practice against a CPU) can only be the user. Otherwise nobody: showing
 * another player's inputs as the user's own would be wrong, so the display
 * stays dark instead.
 */
export function identifyPlayInputPlayer(settings: GameStartType, target: string | null): number | null {
  const matched = target ? matchTargetPlayerIndex(settings, target) : null;
  if (matched !== null) return matched;
  const humans = settings.players.filter((player) => player.type === 0);
  return humans.length === 1 ? humans[0]!.playerIndex : null;
}

/**
 * Turns Slippi's event stream into the user's controller samples, one per
 * game frame.
 *
 * Rollback: when netplay rolls back, Dolphin re-sends the frames it replays.
 * A player's own pre-frame inputs for a frame never change between those
 * re-sends, so a frame at or before the newest one already shown is skipped.
 * That holds for the LOCAL player only: a remote player's first-sent inputs
 * can be predictions that a rollback corrects, so this tracker must not be
 * pointed at an opponent without replacing that rule.
 */
export class PlayInputTracker {
  private playerIndex: number | null = null;
  private lastFrame = Number.NEGATIVE_INFINITY;
  private inGame = false;

  constructor(private readonly target: () => string | null) {}

  reset(): void {
    this.playerIndex = null;
    this.lastFrame = Number.NEGATIVE_INFINITY;
    this.inGame = false;
  }

  /** Feed every parsed command of the stream, in order. */
  handle(command: number, payload: unknown): PlayInputEvent | null {
    if (command === Command.GAME_START) {
      this.reset();
      this.inGame = true;
      this.playerIndex = identifyPlayInputPlayer(payload as GameStartType, this.target());
      return { type: "game", playerIndex: this.playerIndex };
    }
    if (command === Command.GAME_END) {
      if (!this.inGame) return null;
      this.reset();
      return { type: "end" };
    }
    if (command !== Command.PRE_FRAME_UPDATE || this.playerIndex === null) return null;
    const pre = payload as PreFrameUpdateType;
    // Nana shares Popo's port; the pad belongs to the leader's update.
    if (pre.playerIndex !== this.playerIndex || pre.isFollower) return null;
    const frame = pre.frame;
    if (typeof frame !== "number" || frame <= this.lastFrame) return null;
    this.lastFrame = frame;
    return {
      type: "sample",
      sample: {
        frame,
        playerIndex: this.playerIndex,
        physicalButtons: pre.physicalButtons,
        joystickX: pre.joystickX,
        joystickY: pre.joystickY,
        cStickX: pre.cStickX,
        cStickY: pre.cStickY,
        physicalLTrigger: pre.physicalLTrigger,
        physicalRTrigger: pre.physicalRTrigger,
      },
    };
  }
}
