import { playInputStatusText } from "../../playInput";
import { usePlayInput } from "../hooks/usePlayInput";
import { WireframeController } from "./controller/WireframeController";

/** Play Mode module: the user's controller, live. */
export function PlayInputDisplay() {
  const { input, status } = usePlayInput();
  return (
    <div className="play-input-display">
      <WireframeController input={input} />
      <p className="helper-text" role="status">
        {playInputStatusText(status)}
      </p>
    </div>
  );
}
