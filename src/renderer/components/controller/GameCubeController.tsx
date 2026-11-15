import { useId, type CSSProperties } from "react";
import { finiteClamp, type ControllerInput, type ControllerButton } from "./controllerInput";

export interface GameCubeControllerProps {
  input?: ControllerInput;
  className?: string;
  style?: CSSProperties;
  /** A single ink color; the shell and inactive controls remain transparent. */
  color?: string;
  activeLabelColor?: string;
  label?: string;
  showLabels?: boolean;
}

/** Original GameCube layout. Pure SVG, no assets/CSS/dependencies beyond React.
 * No interpolation: input frames are rendered without animation or added deadzones.
 */
export function GameCubeController({
  input = {},
  className,
  style,
  color = "#e8e9ec",
  activeLabelColor = "#14161a",
  label = "GameCube controller input display",
  showLabels = true,
}: GameCubeControllerProps) {
  const titleId = useId();
  const pressed = (key: ControllerButton) => input.buttons?.[key] === true;
  const buttonInk = (key: ControllerButton) => (pressed(key) ? color : "none");
  const textInk = (key: ControllerButton) => (pressed(key) ? activeLabelColor : color);
  const text = (key: ControllerButton, x: number, y: number, size = 15) =>
    showLabels && (
      <text
        x={x}
        y={y}
        fill={textInk(key)}
        stroke="none"
        fontSize={size}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {key === "Start" ? "START" : key}
      </text>
    );
  function stick(name: "stick" | "cStick", cx: number, cy: number, radius: number, cap: number, travel: number) {
    const x = finiteClamp(input[name]?.x) * travel;
    const y = -finiteClamp(input[name]?.y) * travel;
    const points = Array.from({ length: 8 }, (_, i) => {
      const angle = (i * Math.PI) / 4;
      return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
    }).join(" ");
    return (
      <g data-control={name}>
        <polygon points={points} opacity="0.55" />
        <path d={`M ${cx - 7} ${cy} h 14 M ${cx} ${cy - 7} v 14`} opacity="0.25" strokeWidth="1" />
        <line x1={cx} y1={cy} x2={cx + x} y2={cy + y} opacity="0.65" strokeWidth="2" />
        <g transform={`translate(${x} ${y})`}>
          <circle cx={cx} cy={cy} r={cap} fill={color} fillOpacity="0.09" />
          <circle cx={cx} cy={cy} r={cap - 5} opacity="0.3" strokeWidth="1" />
          {name === "cStick" && showLabels && (
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize="13" fill={color} stroke="none">
              C
            </text>
          )}
          {name === "stick" && <circle cx={cx} cy={cy} r="2" fill={color} stroke="none" />}
        </g>
      </g>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 420"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-labelledby={titleId}
      className={className}
      style={{ display: "block", width: "100%", height: "auto", ...style }}
      fontFamily="Arial, Helvetica, sans-serif"
    >
      <title id={titleId}>{label}</title>
      {/* L/R analog rails above the shell; filled badge means a digital click. */}
      {(["L", "R"] as const).map((key) => {
        const x = key === "L" ? 116 : 430;
        const value = finiteClamp(input.triggers?.[key], 0, 1);
        return (
          <g key={key} data-control={key} data-pressed={pressed(key)} data-value={value}>
            <path
              d={`M ${x} 77 V 66 Q ${x} 47 ${x + 20} 47 H ${x + 74} Q ${x + 94} 47 ${x + 94} 66 V 77`}
              opacity="0.6"
            />
            <rect x={x + 12} y="60" width="70" height="5" rx="2.5" opacity="0.25" strokeWidth="1" />
            <rect x={x + 12} y="60" width={70 * value} height="5" rx="2.5" fill={color} stroke="none" />
            <rect x={x + 32} y="17" width="30" height="21" rx="6" fill={buttonInk(key)} strokeWidth="1.5" />
            {text(key, x + 47, 28, 12)}
          </g>
        );
      })}
      <g data-control="Z" data-pressed={pressed("Z")}>
        <path
          d="M 488 80 Q 516 77 539 97 L 548 109 Q 549 116 540 117 L 517 113 Q 506 98 488 96 Q 480 89 488 80 Z"
          fill={buttonInk("Z")}
        />
        {text("Z", 518, 98, 11)}
      </g>
      {/* Two rounded lobes taper to the original controller's long grips. */}
      <path
        d="M 320 97 C 282 97 256 78 217 76 C 158 65 105 79 79 122 C 61 151 61 185 54 222 L 35 328 C 30 357 43 382 65 388 C 86 394 101 375 119 352 L 168 291 C 188 268 214 295 241 306 C 266 315 290 321 320 321 C 350 321 374 315 399 306 C 426 295 452 268 472 291 L 521 352 C 539 375 554 394 575 388 C 597 382 610 357 605 328 L 586 222 C 579 185 579 151 561 122 C 535 79 482 65 423 76 C 384 78 358 97 320 97 Z"
        strokeWidth="2.5"
      />
      <path
        d="M 78 224 C 92 259 121 272 151 269 M 489 269 C 519 272 548 259 562 224"
        opacity="0.25"
        strokeWidth="1.25"
      />
      {stick("stick", 170, 160, 60, 29, 25)}
      {stick("cStick", 389, 250, 43, 20, 18)}
      <g data-control="A" data-pressed={pressed("A")}>
        <circle cx="470" cy="163" r="31" fill={buttonInk("A")} />
        {text("A", 470, 164, 21)}
      </g>
      <g data-control="B" data-pressed={pressed("B")}>
        <circle cx="418" cy="199" r="19" fill={buttonInk("B")} />
        {text("B", 418, 200)}
      </g>
      <g data-control="Y" data-pressed={pressed("Y")}>
        <path
          d="M 420 111 C 419 98 435 90 450 90 C 464 90 479 96 478 106 C 477 116 463 120 450 120 C 437 121 424 124 420 111 Z"
          fill={buttonInk("Y")}
        />
        {text("Y", 449, 106, 13)}
      </g>
      <g data-control="X" data-pressed={pressed("X")}>
        <path
          d="M 512 123 C 520 115 533 124 540 139 C 548 155 547 170 538 174 C 527 179 521 166 516 155 C 512 145 505 132 512 123 Z"
          fill={buttonInk("X")}
        />
        {text("X", 528, 147, 13)}
      </g>
      <g data-control="Start" data-pressed={pressed("Start")}>
        <circle cx="320" cy="170" r="12" fill={buttonInk("Start")} />
        {showLabels && (
          <text
            x="320"
            y="200"
            fill={color}
            opacity="0.55"
            stroke="none"
            fontSize="8"
            letterSpacing="1"
            textAnchor="middle"
          >
            START / PAUSE
          </text>
        )}
      </g>
      <g transform="translate(245 249)">
        <path d="M -12 -32 H 12 V -12 H 32 V 12 H 12 V 32 H -12 V 12 H -32 V -12 H -12 Z" />
        {(["up", "right", "down", "left"] as const).map((key, i) => (
          <g key={key} data-control={key} data-pressed={pressed(key)} transform={`rotate(${i * 90})`}>
            <path d="M -9 -29 H 9 V -12 L 0 -3 L -9 -12 Z" stroke="none" fill={buttonInk(key)} />
            <path d="M -4 -20 L 0 -24 L 4 -20" stroke={textInk(key)} strokeWidth="1.5" />
          </g>
        ))}
        <circle r="3" strokeWidth="1" opacity="0.3" />
      </g>
    </svg>
  );
}
