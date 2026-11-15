# TheMAGI GameCube input overlay

Open `preview.html` directly in a browser. It is self-contained, works offline, and needs no Electron bridge or server. The source preview is also available at `http://localhost:5173/controller-preview.html` while Vite is running (`npx vite`).

## Deliverables

- `themagi-gamecube.svg`: transparent neutral controller, light ink for dark footage.
- `themagi-gamecube-dark-ink.svg`: transparent neutral controller, dark ink for light footage.
- `preview.html`: interactive sandbox with all buttons, both sticks, independent analog/digital triggers, D-pad, labels, width, backgrounds, and current-state SVG download.
- `../../src/renderer/components/controller/GameCubeController.tsx`: controlled React component. Inline SVG; no CSS, network, image, or icon dependencies. The original-style layout has one Z button, asymmetric face buttons, and octagonal stick gates. Artwork is original, inspired by the minimal input-display approach of m-overlay, not copied from its assets. This is a stylized controller drawing, not a dimensioned hardware trace.
- `../../src/renderer/components/controller/controllerInput.ts`: typed normalized input contract and Slippi adapter.

## Integration

```tsx
import { GameCubeController } from "./components/controller/GameCubeController";
import { fromSlippiPreFrame, type SlippiControllerFrame } from "./components/controller/controllerInput";

export function PlayerInput({ pre }: { pre: SlippiControllerFrame | undefined }) {
  return (
    <div style={{ width: 320 }}>
      <GameCubeController input={fromSlippiPreFrame(pre)} />
    </div>
  );
}
```

Pass the selected player's `frame.players[playerIndex]?.pre` from slippi-js, or the equivalent pre-frame event. Select the main player rather than the follower. The host owns subscriptions, player selection, timestamps, and replay synchronization. Use the frame corresponding to displayed playback; for live rollback streams, choose your confirmed/speculative frame policy deliberately. Clear the input with `undefined` on disconnect, replay unload, or player change so stale presses do not remain lit. This deliverable does not subscribe to TheMAGI's live pipeline or add a Play Mode panel.

For other controller sources, map events into `ControllerInput` directly:

```tsx
<GameCubeController
  input={{
    buttons: { A: true, Z: true, up: true, L: false },
    stick: { x: 0.7, y: 0.7 },
    cStick: { x: 0, y: -1 },
    triggers: { L: 0.65, R: 0 },
  }}
  color="#e8e9ec"
  activeLabelColor="#14161a"
  showLabels
/>
```

Normalize hardware axes before passing them in. Browser Gamepad adapter mappings vary; no universal GameCube mapping is assumed here.

## Input semantics

Mapping follows the [Slippi replay specification](https://github.com/project-slippi/slippi-wiki/blob/master/SPEC.md#pre-frame-update) and the installed `@slippi/slippi-js` types.

- Buttons use `physicalButtons`, including independent L/R digital click bits. No analog threshold invents a digital press.
- L/R analog rails use `physicalLTrigger` / `physicalRTrigger`, each 0–1. The merged processed `trigger` value cannot distinguish shoulders and is not used.
- Sticks use the **processed** `joystickX/Y` and `cStickX/Y` fields, each −1–1. They are not raw hardware readings. Positive Y is up; SVG Y is inverted only for drawing.
- No extra deadzone, radial normalization, smoothing, CSS animation, or move/technique inference. Gate artwork is visual and does not impose gameplay thresholds.
- Nonfinite/missing numbers display as neutral; finite values outside the contract are clamped. Missing data is not evidence the physical controller was neutral; the host should show connection/data availability separately.
- Omitted buttons are released; each input is a complete snapshot, not a patch. Both diagonals and simultaneous presses are preserved.

## Appearance and export

The SVG has a `640 420` viewBox and a transparent background. Set the parent width to scale it. The component supports `className`, `style`, `color`, `activeLabelColor`, `showLabels`, and an accessible `label`. SVG title IDs are unique across multiple instances. No live-region announcements occur on every frame. Light/dark preview backgrounds are not included in exported SVGs.

Export SVG in the preview downloads the **current** state and ink/label settings. Regenerate committed neutral SVGs and offline preview after source changes:

```sh
npx tsx --tsconfig tsconfig.renderer.json scripts/export-controller.tsx
```

The explicit renderer config is required for JSX transformation. The preview bundles the project's existing React runtime with esbuild; no dependency installation is required. These are design/component artifacts, not a packaged MAGI app release.

## Verification

`tests/controllerInput.test.ts` covers all 12 physical button bits independently, simultaneous/unused bits, independent analog and digital triggers, axes and missing/nonfinite data, upward Y rendering, and distinct accessible IDs across instances. Run it with `npx vitest run tests/controllerInput.test.ts`.

Real hardware capture and live Slippi playback synchronization are integration work and have not been verified by this preview.
