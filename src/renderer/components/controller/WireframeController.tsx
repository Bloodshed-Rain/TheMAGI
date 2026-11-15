import { useId, type CSSProperties, type SVGProps } from "react";
import wireframe from "../../assets/gamecube-wireframe.webp";
import type { ControllerInput } from "./controllerInput";
import {
  GC_CONTROL_COLORS,
  WIREFRAME_BUTTONS,
  WIREFRAME_BUTTON_SHAPES,
  WIREFRAME_HEIGHT,
  WIREFRAME_STICKS,
  WIREFRAME_WIDTH,
  WIREFRAME_Z_LABEL,
  wireframeState,
  type WireframeControl,
  type WireframeShape,
  type WireframeStick,
} from "./wireframeLayout";

export interface WireframeControllerProps {
  input?: ControllerInput;
  className?: string;
  style?: CSSProperties;
  /** Color of the unlit wireframe. The background stays transparent. */
  ink?: string;
  /** Opacity of the unlit wireframe, 0 to 1. */
  idle?: number;
  /** Override a control's lit color; the defaults are a stock controller's. */
  colors?: Partial<Record<WireframeControl, string>>;
  /**
   * How long a released control takes to fade out, in milliseconds. A press
   * always lights instantly and at full strength; only the release fades, so a
   * one-frame input is still visible on a 30 fps stream. 0 turns it off.
   */
  afterglowMs?: number;
  label?: string;
  /** Outline every highlight region, for checking alignment with the artwork. */
  showRegions?: boolean;
}

const STICKS = Object.keys(WIREFRAME_STICKS) as WireframeStick[];
const FULL = { x: 0, y: 0, width: WIREFRAME_WIDTH, height: WIREFRAME_HEIGHT };

function Shape({ shape, ...rest }: { shape: WireframeShape } & SVGProps<SVGElement>) {
  const props = rest as Record<string, unknown>;
  if (shape.kind === "circle") return <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...props} />;
  if (shape.kind === "rect")
    return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} {...props} />;
  if (shape.kind === "polygon") return <polygon points={shape.points} {...props} />;
  return (
    <ellipse
      cx={shape.cx}
      cy={shape.cy}
      rx={shape.rx}
      ry={shape.ry}
      transform={`rotate(${shape.rotate} ${shape.cx} ${shape.cy})`}
      {...props}
    />
  );
}

/**
 * GameCube input display drawn from the wireframe artwork. Pressing a control
 * lights that control's own lines in its color; sticks move their cap and light
 * with deflection; L/R light with analog travel and fill on the digital click.
 * Pure SVG over one image, transparent background, no state of its own.
 */
export function WireframeController({
  input = {},
  className,
  style,
  ink = "#e8e9ec",
  idle = 0.45,
  colors,
  afterglowMs = 110,
  label = "GameCube controller input display",
  showRegions = false,
}: WireframeControllerProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { level, pressed, offset } = wireframeState(input);
  const color = (control: WireframeControl) => colors?.[control] ?? GC_CONTROL_COLORS[control];
  // Light instantly, fade only on release.
  const lit = (value: number): CSSProperties => ({
    opacity: value,
    transition: value > 0 || afterglowMs <= 0 ? "none" : `opacity ${afterglowMs}ms linear`,
  });
  const cap = (name: WireframeStick, fill: string, extra: CSSProperties) => (
    <g transform={`translate(${offset[name].x} ${offset[name].y})`}>
      <g clipPath={`url(#${id}-${name})`}>
        <rect {...FULL} fill={fill} mask={`url(#${id}-art)`} style={extra} />
      </g>
    </g>
  );
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${WIREFRAME_WIDTH} ${WIREFRAME_HEIGHT}`}
      role="img"
      aria-labelledby={`${id}-title`}
      className={className}
      style={{ display: "block", width: "100%", height: "auto", ...style }}
    >
      <title id={`${id}-title`}>{label}</title>
      <defs>
        {/* The artwork is white lines on black, so its brightness is the mask. */}
        <mask id={`${id}-art`} maskUnits="userSpaceOnUse" {...FULL}>
          <image href={wireframe} {...FULL} />
        </mask>
        {/* The same, minus each stick cap at rest and whatever its moved cap covers. */}
        <mask id={`${id}-body`} maskUnits="userSpaceOnUse" {...FULL}>
          <image href={wireframe} {...FULL} />
          {STICKS.map((name) => {
            const { cx, cy, cap: r } = WIREFRAME_STICKS[name];
            return (
              <g key={name} fill="#000">
                <circle cx={cx} cy={cy} r={r} />
                <circle cx={cx + offset[name].x} cy={cy + offset[name].y} r={r} />
              </g>
            );
          })}
        </mask>
        {STICKS.map((name) => (
          <clipPath key={name} id={`${id}-${name}`}>
            <circle cx={WIREFRAME_STICKS[name].cx} cy={WIREFRAME_STICKS[name].cy} r={WIREFRAME_STICKS[name].cap} />
          </clipPath>
        ))}
        <filter id={`${id}-glow`} filterUnits="userSpaceOnUse" {...FULL}>
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* A digital press also tints the control's area, so it reads at small sizes. */}
      {WIREFRAME_BUTTONS.map((button) => (
        <Shape
          key={button}
          shape={WIREFRAME_BUTTON_SHAPES[button]}
          fill={color(button)}
          style={lit(pressed[button] ? 0.2 : 0)}
        />
      ))}

      <rect {...FULL} fill={ink} opacity={idle} mask={`url(#${id}-body)`} />
      <text
        x={WIREFRAME_Z_LABEL.x}
        y={WIREFRAME_Z_LABEL.y}
        fill={ink}
        opacity={idle}
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="34"
        fontWeight="700"
        textAnchor="middle"
      >
        Z
      </text>
      {STICKS.map((name) => (
        <g key={name}>{cap(name, ink, { opacity: idle })}</g>
      ))}

      <g filter={`url(#${id}-glow)`}>
        <g mask={`url(#${id}-body)`}>
          {WIREFRAME_BUTTONS.map((button) => (
            <Shape
              key={button}
              shape={WIREFRAME_BUTTON_SHAPES[button]}
              fill={color(button)}
              style={lit(level[button])}
              data-control={button}
              data-pressed={pressed[button]}
              data-level={level[button]}
            />
          ))}
        </g>
        <text
          x={WIREFRAME_Z_LABEL.x}
          y={WIREFRAME_Z_LABEL.y}
          fill={color("Z")}
          style={lit(level.Z)}
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="34"
          fontWeight="700"
          textAnchor="middle"
        >
          Z
        </text>
        {STICKS.map((name) => (
          <g key={name} data-control={name} data-level={level[name]}>
            {cap(name, color(name), lit(level[name]))}
          </g>
        ))}
      </g>

      {showRegions && (
        <g fill="none" stroke="#ff2bd6" strokeWidth="2">
          {WIREFRAME_BUTTONS.map((button) => (
            <Shape key={button} shape={WIREFRAME_BUTTON_SHAPES[button]} />
          ))}
          {STICKS.map((name) => (
            <circle
              key={name}
              cx={WIREFRAME_STICKS[name].cx}
              cy={WIREFRAME_STICKS[name].cy}
              r={WIREFRAME_STICKS[name].cap}
            />
          ))}
        </g>
      )}
    </svg>
  );
}
