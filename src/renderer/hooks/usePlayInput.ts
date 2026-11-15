import { useEffect, useState } from "react";
import { nextPlayInputPaint, queuePlayInputSamples, type PlayInputSample, type PlayInputStatus } from "../../playInput";
import { fromSlippiPreFrame, type ControllerInput } from "../components/controller/controllerInput";

const NEUTRAL: ControllerInput = {};

/**
 * The user's live controller for the input display, plus where the feed stands.
 *
 * Subscribing tells the main process something is showing the display; that is
 * what opens the connection to Dolphin. Samples are drawn once per paint: when
 * more than one arrived since the last paint, that paint shows every button
 * that was down on any of them, and the following paint shows the newest
 * sample alone, so a one-frame press is never skipped.
 */
export function usePlayInput(): { input: ControllerInput; status: PlayInputStatus } {
  const [input, setInput] = useState<ControllerInput>(NEUTRAL);
  const [status, setStatus] = useState<PlayInputStatus>({ phase: "off" });
  useEffect(() => {
    let alive = true;
    let queue: PlayInputSample[] = [];
    let frame = 0;
    const paint = () => {
      frame = 0;
      const { draw, carry } = nextPlayInputPaint(queue);
      queue = carry;
      if (!draw) return;
      setInput(fromSlippiPreFrame(draw));
      if (carry.length) frame = requestAnimationFrame(paint);
    };
    const clear = (next: PlayInputStatus) => {
      // Every status message means the game or the connection changed, so
      // whatever was lit belongs to something that is over.
      queue = [];
      cancelAnimationFrame(frame);
      frame = 0;
      setInput(NEUTRAL);
      setStatus(next);
    };
    const offInput = window.clippi.onPlayInput((samples) => {
      queue = queuePlayInputSamples(queue, samples);
      if (!frame) frame = requestAnimationFrame(paint);
    });
    const offStatus = window.clippi.onPlayInputStatus(clear);
    void window.clippi
      .playInputWatch(true)
      .then((current) => {
        if (alive) setStatus(current);
      })
      .catch(() => {
        if (alive) setStatus({ phase: "off" });
      });
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      offInput();
      offStatus();
      void window.clippi.playInputWatch(false).catch(() => {});
    };
  }, []);
  return { input, status };
}
