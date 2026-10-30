// Win32 FFI bindings via koffi for embedding Slippi Dolphin's playback window
// inside MAGI's BrowserWindow as a true child window.
//
// Scope is intentionally narrow — passive replay viewing only, no controllers,
// no fullscreen toggle. That sidesteps the SetParent failure modes that hit
// games with DirectInput capture or exclusive GPU mode.
//
// All koffi types are declared anonymously so a partial init failure can't
// leave stale named-type registrations behind (Node un-caches modules whose
// top-level throws, and koffi's type registry is process-global — re-loading
// a module with `koffi.proto("Name", ...)` then throws "Duplicate type name").

import koffi from "koffi";
import { selectDolphinGameSurface, type DolphinTopWindow, type DolphinGameSurface } from "../dolphinWindowSelection";

// ── Win32 constants ───────────────────────────────────────────────────

const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const GWLP_HWNDPARENT = -8;

const WS_CHILD = 0x40000000;
const WS_VISIBLE = 0x10000000;
const WS_POPUP = 0x80000000;
const WS_CAPTION = 0x00c00000;
const WS_THICKFRAME = 0x00040000;
const WS_BORDER = 0x00800000;
const WS_DLGFRAME = 0x00400000;
const WS_SYSMENU = 0x00080000;
const WS_MINIMIZEBOX = 0x00020000;
const WS_MAXIMIZEBOX = 0x00010000;

const WS_EX_APPWINDOW = 0x00040000;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_DLGMODALFRAME = 0x00000001;

const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const SWP_SHOWWINDOW = 0x0040;

const WM_CLOSE = 0x0010;
const WM_SIZE = 0x0005;
const SIZE_RESTORED = 0;

const SW_HIDE = 0;

const WM_KEYDOWN = 0x0100;
const WM_KEYUP = 0x0101;

// ── Lazy-loaded koffi bindings ────────────────────────────────────────

interface RectShape {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Bindings {
  EnumWindowsProcType: koffi.IKoffiCType;
  EnumWindows: (cb: unknown, lparam: number | bigint) => boolean;
  EnumChildWindows: (parent: bigint, cb: unknown, lparam: number | bigint) => boolean;
  GetWindowThreadProcessId: (hwnd: bigint, pidOut: [number]) => number;
  IsWindowVisible: (hwnd: bigint) => boolean;
  GetWindowTextW: (hwnd: bigint, buf: Uint16Array, max: number) => number;
  GetClassNameW: (hwnd: bigint, buf: Uint16Array, max: number) => number;
  GetParent: (hwnd: bigint) => unknown;
  GetForegroundWindow: () => unknown;
  GetAncestor: (hwnd: bigint, flags: number) => unknown;
  GetMenu: (hwnd: bigint) => unknown;
  SetMenu: (hwnd: bigint, menu: null) => boolean;
  GetWindowRect: (hwnd: bigint, rect: RectShape) => boolean;
  SetParent: (child: bigint, parent: bigint | null) => bigint;
  SetWindowLongPtrW: (hwnd: bigint, idx: number, value: number | bigint) => bigint;
  GetWindowLongPtrW: (hwnd: bigint, idx: number) => bigint;
  SetWindowPos: (
    hwnd: bigint,
    insertAfter: bigint | null,
    x: number,
    y: number,
    cx: number,
    cy: number,
    flags: number,
  ) => boolean;
  PostMessageW: (hwnd: bigint, msg: number, wparam: number | bigint, lparam: number | bigint) => boolean;
  ShowWindow: (hwnd: bigint, cmd: number) => boolean;
  GetClientRect: (hwnd: bigint, rect: RectShape) => boolean;
  MapVirtualKeyW: (uCode: number, uMapType: number) => number;
}

let cachedBindings: Bindings | null = null;

function getBindings(): Bindings {
  if (cachedBindings) return cachedBindings;

  const user32 = koffi.load("user32.dll");
  const GetMenu = user32.func("__stdcall", "GetMenu", "void *", ["void *"]);
  const SetMenu = user32.func("__stdcall", "SetMenu", "bool", ["void *", "void *"]);

  // Anonymous types only — no global names to collide with on retry.
  const RECT = koffi.struct({
    left: "long",
    top: "long",
    right: "long",
    bottom: "long",
  });

  // Anonymous proto: 2-arg form (returnType, paramTypes) → no global name.
  const EnumWindowsProc = koffi.proto("bool", ["void *", "intptr"]);

  const EnumWindows = user32.func("__stdcall", "EnumWindows", "bool", [koffi.pointer(EnumWindowsProc), "intptr"]);
  const EnumChildWindows = user32.func("__stdcall", "EnumChildWindows", "bool", [
    "void *",
    koffi.pointer(EnumWindowsProc),
    "intptr",
  ]);
  const GetWindowThreadProcessId = user32.func("__stdcall", "GetWindowThreadProcessId", "uint32", [
    "void *",
    koffi.out(koffi.pointer("uint32")),
  ]);
  const IsWindowVisible = user32.func("__stdcall", "IsWindowVisible", "bool", ["void *"]);
  const GetWindowTextW = user32.func("__stdcall", "GetWindowTextW", "int", [
    "void *",
    koffi.out(koffi.pointer("uint16")),
    "int",
  ]);
  const GetClassNameW = user32.func("__stdcall", "GetClassNameW", "int", [
    "void *",
    koffi.out(koffi.pointer("uint16")),
    "int",
  ]);
  const GetParent = user32.func("__stdcall", "GetParent", "void *", ["void *"]);
  const GetForegroundWindow = user32.func("__stdcall", "GetForegroundWindow", "void *", []);
  const GetAncestor = user32.func("__stdcall", "GetAncestor", "void *", ["void *", "uint"]);
  const GetWindowRect = user32.func("__stdcall", "GetWindowRect", "bool", ["void *", koffi.out(koffi.pointer(RECT))]);
  const SetParent = user32.func("__stdcall", "SetParent", "void *", ["void *", "void *"]);
  const SetWindowLongPtrW = user32.func("__stdcall", "SetWindowLongPtrW", "intptr", ["void *", "int", "intptr"]);
  const GetWindowLongPtrW = user32.func("__stdcall", "GetWindowLongPtrW", "intptr", ["void *", "int"]);
  const SetWindowPos = user32.func("__stdcall", "SetWindowPos", "bool", [
    "void *",
    "void *",
    "int",
    "int",
    "int",
    "int",
    "uint",
  ]);
  const PostMessageW = user32.func("__stdcall", "PostMessageW", "bool", ["void *", "uint", "uintptr", "intptr"]);
  const ShowWindow = user32.func("__stdcall", "ShowWindow", "bool", ["void *", "int"]);
  const GetClientRect = user32.func("__stdcall", "GetClientRect", "bool", ["void *", koffi.out(koffi.pointer(RECT))]);
  const MapVirtualKeyW = user32.func("__stdcall", "MapVirtualKeyW", "uint", ["uint", "uint"]);

  cachedBindings = {
    EnumWindowsProcType: EnumWindowsProc,
    EnumWindows: EnumWindows as Bindings["EnumWindows"],
    EnumChildWindows: EnumChildWindows as Bindings["EnumChildWindows"],
    GetWindowThreadProcessId: GetWindowThreadProcessId as Bindings["GetWindowThreadProcessId"],
    IsWindowVisible: IsWindowVisible as Bindings["IsWindowVisible"],
    GetWindowTextW: GetWindowTextW as Bindings["GetWindowTextW"],
    GetClassNameW: GetClassNameW as Bindings["GetClassNameW"],
    GetParent: GetParent as Bindings["GetParent"],
    GetForegroundWindow: GetForegroundWindow as Bindings["GetForegroundWindow"],
    GetAncestor: GetAncestor as Bindings["GetAncestor"],
    GetMenu: GetMenu as Bindings["GetMenu"],
    SetMenu: SetMenu as Bindings["SetMenu"],
    GetWindowRect: GetWindowRect as Bindings["GetWindowRect"],
    SetParent: SetParent as Bindings["SetParent"],
    SetWindowLongPtrW: SetWindowLongPtrW as Bindings["SetWindowLongPtrW"],
    GetWindowLongPtrW: GetWindowLongPtrW as Bindings["GetWindowLongPtrW"],
    SetWindowPos: SetWindowPos as Bindings["SetWindowPos"],
    PostMessageW: PostMessageW as Bindings["PostMessageW"],
    ShowWindow: ShowWindow as Bindings["ShowWindow"],
    GetClientRect: GetClientRect as Bindings["GetClientRect"],
    MapVirtualKeyW: MapVirtualKeyW as Bindings["MapVirtualKeyW"],
  };
  return cachedBindings;
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Owned Dolphin windows count as MAGI foreground even while Electron is blurred. */
export function isHostedGameForeground(ownerHwnd: bigint): boolean {
  const b = getBindings();
  const foreground = hwndAddr(b.GetForegroundWindow());
  return foreground !== 0n && (foreground === ownerHwnd || hwndAddr(b.GetAncestor(foreground, 3)) === ownerHwnd);
}

/** Convert an Electron BrowserWindow.getNativeWindowHandle() Buffer to a BigInt HWND. */
export function bufferToHwnd(buf: Buffer): bigint {
  if (buf.length === 8) {
    return buf.readBigUInt64LE(0);
  }
  if (buf.length === 4) {
    return BigInt(buf.readUInt32LE(0));
  }
  throw new Error(`Unexpected HWND buffer length: ${buf.length}`);
}

/**
 * Normalize whatever koffi gives us for a `void *` (HWND) into a BigInt.
 * koffi 2.x returns opaque "external" objects for void* by default — they
 * round-trip back to FFI calls fine but don't have `.toString(radix)`.
 * `koffi.address()` extracts the numeric address as a BigInt.
 */
function hwndAddr(hwnd: unknown): bigint {
  if (hwnd == null) return 0n;
  if (typeof hwnd === "bigint") return hwnd;
  if (typeof hwnd === "number") return BigInt(hwnd);
  const k = koffi as unknown as { address?: (p: unknown) => bigint };
  if (typeof k.address === "function") {
    try {
      return k.address(hwnd);
    } catch {
      /* fall through */
    }
  }
  return 0n;
}

function readWideString(buf: Uint16Array): string {
  let end = buf.length;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) {
      end = i;
      break;
    }
  }
  return String.fromCharCode(...buf.subarray(0, end));
}

/** Find all top-level windows owned by a given PID. */
function findWindowsByPid(targetPid: number): bigint[] {
  const b = getBindings();
  const handles: bigint[] = [];
  const cb = koffi.register((hwnd: unknown, _lparam: unknown): boolean => {
    const hwndBig = hwndAddr(hwnd);
    const pidOut: [number] = [0];
    b.GetWindowThreadProcessId(hwndBig, pidOut);
    if (pidOut[0] === targetPid) {
      handles.push(hwndBig);
    }
    return true;
  }, koffi.pointer(b.EnumWindowsProcType));
  try {
    b.EnumWindows(cb, 0);
  } finally {
    koffi.unregister(cb);
  }
  return handles;
}

/** Enumerate direct + nested child windows of `parent`. */
function findChildWindows(parent: bigint): bigint[] {
  const b = getBindings();
  const handles: bigint[] = [];
  const cb = koffi.register((hwnd: unknown, _lparam: unknown): boolean => {
    handles.push(hwndAddr(hwnd));
    return true;
  }, koffi.pointer(b.EnumWindowsProcType));
  try {
    b.EnumChildWindows(parent, cb, 0);
  } finally {
    koffi.unregister(cb);
  }
  return handles;
}

function getPathFromAncestorToDescendant(ancestor: bigint, descendant: bigint): bigint[] {
  const b = getBindings();
  const path: bigint[] = [];
  const seen = new Set<bigint>();
  let current = descendant;

  while (current !== 0n && !seen.has(current)) {
    if (current === ancestor) return path;
    seen.add(current);
    path.unshift(current);
    current = hwndAddr(b.GetParent(current));
  }

  // If Dolphin returns an unexpected window tree, still preserve the old
  // behavior by fitting the selected render HWND itself.
  return [descendant];
}

const pendingRenderFits = new Map<bigint, ReturnType<typeof setTimeout>>();

function fitRenderPathToMainClient(mainHwnd: bigint, renderHwnd: bigint, frameChanged: boolean = false): void {
  const b = getBindings();
  const rect: RectShape = { left: 0, top: 0, right: 0, bottom: 0 };
  if (!b.GetClientRect(mainHwnd, rect)) return;

  const w = Math.max(1, rect.right - rect.left);
  const h = Math.max(1, rect.bottom - rect.top);
  const flags = SWP_NOZORDER | SWP_NOACTIVATE | (frameChanged ? SWP_FRAMECHANGED : 0);

  for (const hwnd of getPathFromAncestorToDescendant(mainHwnd, renderHwnd)) {
    b.SetWindowPos(hwnd, null, 0, 0, w, h, flags);
  }
}

function settleRenderLayout(mainHwnd: bigint, renderHwnd: bigint): void {
  const pending = pendingRenderFits.get(mainHwnd);
  if (pending) clearTimeout(pending);
  // wx processes its own resize after SetWindowPos and can restore toolbar
  // margins. Fit again after that layout, without sending another shell resize.
  const timer = setTimeout(() => {
    pendingRenderFits.delete(mainHwnd);
    try {
      if (getBindings().IsWindowVisible(mainHwnd) && getBindings().IsWindowVisible(renderHwnd))
        fitRenderPathToMainClient(mainHwnd, renderHwnd);
    } catch (error) {
      console.warn("[play] Delayed render fit failed:", error);
    }
  }, 100);
  timer.unref();
  pendingRenderFits.set(mainHwnd, timer);
}

interface DolphinWindowInfo {
  hwnd: bigint;
  width: number;
  height: number;
  className: string;
  title: string;
}

function inspectWindow(hwnd: bigint, minimumSize = 50): DolphinWindowInfo | null {
  const b = getBindings();
  if (!b.IsWindowVisible(hwnd)) return null;

  const rect: RectShape = { left: 0, top: 0, right: 0, bottom: 0 };
  if (!b.GetWindowRect(hwnd, rect)) return null;
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  if (width < minimumSize || height < minimumSize) return null;

  const titleBuf = new Uint16Array(256);
  b.GetWindowTextW(hwnd, titleBuf, titleBuf.length);
  const title = readWideString(titleBuf);

  const classBuf = new Uint16Array(256);
  b.GetClassNameW(hwnd, classBuf, classBuf.length);
  const className = readWideString(classBuf);

  return { hwnd, width, height, className, title };
}

export interface DolphinWindows {
  /** Top-level window owned by Dolphin — the WM_CLOSE target. */
  mainHwnd: bigint;
  /** The actual render surface. May equal mainHwnd, or be an inner child. */
  renderHwnd: bigint;
  /** True when render is a separate child HWND inside main. */
  renderIsChild: boolean;
}

/** Read-only process-specific inventory, also used to diagnose fork-specific
 * window classes without touching unrelated Dolphin processes. */
export function inspectDolphinWindows(pid: number): DolphinTopWindow[] {
  const b = getBindings();
  return findWindowsByPid(pid)
    .map((hwnd) => {
      const info = inspectWindow(hwnd);
      if (!info) return null;
      return {
        ...info,
        hasMenu: hwndAddr(b.GetMenu(hwnd)) !== 0n,
        children: findChildWindows(hwnd)
          .map((child) => inspectWindow(child, 1))
          .filter((child): child is DolphinWindowInfo => child !== null),
      };
    })
    .filter((window): window is DolphinTopWindow => window !== null);
}

export async function findDolphinGameWindows(
  pid: number,
  timeoutMs = 30000,
  signal?: AbortSignal,
): Promise<DolphinGameSurface> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    signal?.throwIfAborted();
    const surface = selectDolphinGameSurface(inspectDolphinWindows(pid), Date.now() - started >= 1000);
    if (surface) return surface;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Melee’s render window did not appear. MAGI will not host Dolphin’s game-library window.");
}

/** Raise above the owner only when MAGI itself is foregrounded; this is not
 * an always-on-top window and must not cover another application after Alt-Tab. */
export function raiseHostedGame(hwnd: bigint): void {
  getBindings().SetWindowPos(hwnd, null, 0, 0, 0, 0, 0x0001 | 0x0002 | SWP_NOACTIVATE | SWP_SHOWWINDOW);
}

/**
 * Poll for the spawned Dolphin process's render surface.
 *
 * Strategy:
 *  1. Find largest visible top-level window owned by the PID — this is the
 *     "main" window (WM_CLOSE target).
 *  2. Look inside it for the largest visible child >= 320x240. Slippi
 *     Dolphin's wxWidgets shell renders into a nested "wxWindowNR" panel;
 *     reparenting the child directly avoids the swap-chain invalidation
 *     that hits when we reparent the outer window with style-strip.
 *  3. If no suitable child exists, fall back to embedding main itself.
 */
export async function findDolphinWindows(pid: number, timeoutMs: number = 15000): Promise<DolphinWindows> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tops = findWindowsByPid(pid)
      .map((h) => inspectWindow(h))
      .filter((w): w is DolphinWindowInfo => w != null && w.width >= 320 && w.height >= 240);

    if (tops.length > 0) {
      tops.sort((a, b) => b.width * b.height - a.width * a.height);
      const main = tops[0]!;
      // Log every top-level for diagnosis on first successful poll.
      console.log("[embed] Dolphin top-level windows:");
      for (const w of tops) {
        console.log(`  hwnd=0x${w.hwnd.toString(16)} ${w.width}x${w.height} class="${w.className}" title="${w.title}"`);
      }

      // Inspect children of main and pick the largest visible >= 320x240.
      const childCandidates = findChildWindows(main.hwnd)
        .map((h) => inspectWindow(h))
        .filter((w): w is DolphinWindowInfo => w != null && w.width >= 320 && w.height >= 240);
      childCandidates.sort((a, b) => b.width * b.height - a.width * a.height);
      console.log(`[embed] Children of main (>=320x240, visible): ${childCandidates.length}`);
      for (const c of childCandidates) {
        console.log(
          `  child hwnd=0x${c.hwnd.toString(16)} ${c.width}x${c.height} class="${c.className}" title="${c.title}"`,
        );
      }

      if (childCandidates.length > 0) {
        const render = childCandidates[0]!;
        console.log(`[embed] Picked render CHILD hwnd=0x${render.hwnd.toString(16)}`);
        return { mainHwnd: main.hwnd, renderHwnd: render.hwnd, renderIsChild: true };
      }
      console.log(`[embed] No suitable child; embedding main directly hwnd=0x${main.hwnd.toString(16)}`);
      return { mainHwnd: main.hwnd, renderHwnd: main.hwnd, renderIsChild: false };
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Timed out waiting for Dolphin main window");
}

/** @deprecated kept for callers; prefer findDolphinWindows. */
export async function findDolphinMainWindow(pid: number, timeoutMs?: number): Promise<bigint> {
  return (await findDolphinWindows(pid, timeoutMs)).mainHwnd;
}

/**
 * Reparent `renderHwnd` into MAGI's window and hide the Dolphin shell.
 *
 * Two paths:
 *   - `renderIsChild` true: render is an inner child HWND (e.g. a wxWindowNR
 *     panel). It already has WS_CHILD style, so we can SetParent it directly
 *     into MAGI without touching styles. The Dolphin shell window is moved
 *     off-screen so its empty toolbar doesn't peek through.
 *   - `renderIsChild` false: render IS the top-level Dolphin window. We have
 *     to strip its native frame (caption/border/thickframe) and add WS_CHILD
 *     before reparenting, otherwise SetParent on a top-level WS_OVERLAPPED
 *     window produces an "owned" window rather than a true child.
 */
export function embed(windows: DolphinWindows, parentHwnd: bigint, x: number, y: number, w: number, h: number): void {
  const b = getBindings();

  if (windows.renderIsChild) {
    // The render panel is already a WS_CHILD of the main shell. SetParent
    // reparents it into MAGI; SetWindowPos with SWP_FRAMECHANGED + the
    // explicit WM_SIZE nudge prods Dolphin's renderer to resize its swap
    // chain to the new client rect. The main shell is left where it is for
    // diagnosis — if MAGI's modal stays black but Dolphin's main window
    // shows the game, that proves Slippi is rendering to main, not the
    // panel, and we need to embed main directly.
    const w_round = Math.round(w);
    const h_round = Math.round(h);
    b.SetParent(windows.renderHwnd, parentHwnd);
    b.SetWindowPos(
      windows.renderHwnd,
      null,
      Math.round(x),
      Math.round(y),
      w_round,
      h_round,
      SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
    );
    // Nudge the renderer: WM_SIZE wParam=SIZE_RESTORED, lParam=MAKELONG(w,h)
    // Many renderers (DXGI swap chain, GLX) use WM_SIZE as the trigger to
    // recreate/resize their backbuffer.
    const lparam = (h_round << 16) | (w_round & 0xffff);
    b.PostMessageW(windows.renderHwnd, WM_SIZE, SIZE_RESTORED, lparam);
    return;
  }

  // Top-level Dolphin window path. WS_POPUP = 0x80000000 overflows Int32,
  // and koffi may return Number for intptr that fits in JS double range —
  // promote everything to BigInt up-front so bit ops stay typed.
  const child = windows.renderHwnd;
  const oldStyle = BigInt(b.GetWindowLongPtrW(child, GWL_STYLE));
  const styleStripMask =
    BigInt(WS_POPUP) |
    BigInt(WS_CAPTION) |
    BigInt(WS_THICKFRAME) |
    BigInt(WS_BORDER) |
    BigInt(WS_DLGFRAME) |
    BigInt(WS_SYSMENU) |
    BigInt(WS_MINIMIZEBOX) |
    BigInt(WS_MAXIMIZEBOX);
  const newStyle = (oldStyle & ~styleStripMask) | BigInt(WS_CHILD) | BigInt(WS_VISIBLE);
  b.SetWindowLongPtrW(child, GWL_STYLE, newStyle);

  const oldEx = BigInt(b.GetWindowLongPtrW(child, GWL_EXSTYLE));
  const exStripMask = BigInt(WS_EX_APPWINDOW) | BigInt(WS_EX_DLGMODALFRAME);
  const newEx = (oldEx & ~exStripMask) | BigInt(WS_EX_TOOLWINDOW);
  b.SetWindowLongPtrW(child, GWL_EXSTYLE, newEx);

  b.SetParent(child, parentHwnd);
  b.SetWindowPos(
    child,
    null,
    Math.round(x),
    Math.round(y),
    Math.round(w),
    Math.round(h),
    SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
  );
}

/** Move/resize an embedded child window to new client-area coordinates. */
export function setBounds(hwnd: bigint, x: number, y: number, w: number, h: number): void {
  const b = getBindings();
  b.SetWindowPos(hwnd, null, Math.round(x), Math.round(y), Math.round(w), Math.round(h), SWP_NOZORDER | SWP_NOACTIVATE);
}

/** Send a virtual key code to the window as a KEYDOWN + KEYUP sequence. */
export function sendKey(hwnd: bigint, vk: number): void {
  const b = getBindings();
  const scanCode = b.MapVirtualKeyW(vk, 0); // MAPVK_VK_TO_VSC = 0

  // Arrow keys are extended keys (bit 24)
  let extended = 0;
  if (vk === 0x25 || vk === 0x26 || vk === 0x27 || vk === 0x28) {
    extended = 1 << 24;
  }

  // Use >>> 0 to ensure these are positive 32-bit unsigned integers.
  // This prevents sign-extension bugs when koffi converts them to 64-bit intptr.
  const lParamDown = Number((1 | (scanCode << 16) | extended) >>> 0);
  const lParamUp = Number((1 | (scanCode << 16) | extended | (1 << 30) | (1 << 31)) >>> 0);

  b.PostMessageW(hwnd, WM_KEYDOWN, vk, lParamDown);

  // Dolphin polls input at 60fps. If we send KEYUP immediately, Dolphin might
  // process both messages in a single frame and fail to register the keystroke.
  // Holding it for 50ms guarantees it spans at least 2 frames.
  setTimeout(() => {
    b.PostMessageW(hwnd, WM_KEYUP, vk, lParamUp);
  }, 50);
}

/**
 * "Floating attached" mode — the only path that survived live testing.
 *
 * Cross-process `SetParent` works mechanically but kills the GPU swap
 * chain: Slippi's renderer is still in its own process, but the present
 * target HWND now lives in our window tree, and DXGI/GLX swap operations
 * silently produce nothing. Both `WM_SIZE` nudges and `SWP_FRAMECHANGED`
 * fail to recover it.
 *
 * Instead: keep Dolphin's main HWND in its own process tree (preserving
 * the render context), strip its chrome down to a borderless popup, set
 * MAGI as its OWNER (via GWLP_HWNDPARENT — z-order tracking, hide-with-
 * owner, no taskbar entry), and position it in screen coords over MAGI's
 * stage rect.
 *
 * The user perceives an embedded Dolphin. Technically it's a separate
 * native window pinned over MAGI; the renderer reports stage-rect screen
 * coords whenever MAGI moves/resizes and we re-pin via setFloatBounds.
 */
export function floatOver(
  ownerHwnd: bigint,
  dolphinMainHwnd: bigint,
  screenX: number,
  screenY: number,
  w: number,
  h: number,
  activate = true,
): void {
  const b = getBindings();

  const oldStyle = BigInt(b.GetWindowLongPtrW(dolphinMainHwnd, GWL_STYLE));
  const stripMask =
    BigInt(WS_CAPTION) |
    BigInt(WS_THICKFRAME) |
    BigInt(WS_BORDER) |
    BigInt(WS_DLGFRAME) |
    BigInt(WS_SYSMENU) |
    BigInt(WS_MINIMIZEBOX) |
    BigInt(WS_MAXIMIZEBOX);
  const newStyle = (oldStyle & ~stripMask) | BigInt(WS_POPUP) | BigInt(WS_VISIBLE);
  b.SetWindowLongPtrW(dolphinMainHwnd, GWL_STYLE, newStyle);

  const oldEx = BigInt(b.GetWindowLongPtrW(dolphinMainHwnd, GWL_EXSTYLE));
  const exStrip = BigInt(WS_EX_APPWINDOW);
  const newEx = (oldEx & ~exStrip) | BigInt(WS_EX_TOOLWINDOW);
  b.SetWindowLongPtrW(dolphinMainHwnd, GWL_EXSTYLE, newEx);

  // Owner relationship: MAGI now owns Dolphin. Owned windows stay above
  // their owner in z-order, hide with the owner, and don't get their own
  // taskbar entry. This is the textbook "child-like floating window"
  // pattern from Win32 — used by tooltips, popup menus, etc.
  b.SetWindowLongPtrW(dolphinMainHwnd, GWLP_HWNDPARENT, ownerHwnd);

  b.SetWindowPos(
    dolphinMainHwnd,
    null,
    Math.round(screenX),
    Math.round(screenY),
    Math.round(w),
    Math.round(h),
    SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW | (activate ? 0 : SWP_NOACTIVATE),
  );
}

/** Reposition a floating-attached window to new screen-space bounds. */
export function setFloatBounds(hwnd: bigint, screenX: number, screenY: number, w: number, h: number): void {
  const b = getBindings();
  b.SetWindowPos(
    hwnd,
    null,
    Math.round(screenX),
    Math.round(screenY),
    Math.round(w),
    Math.round(h),
    SWP_NOZORDER | SWP_NOACTIVATE,
  );
}

/** Hide a hosted game without closing it, or show it without stealing focus. */
export function setHostedGameVisible(hwnd: bigint, visible: boolean): void {
  getBindings().ShowWindow(hwnd, visible ? 4 /* SW_SHOWNOACTIVATE */ : SW_HIDE);
}

/**
 * Hide every visible child of `mainHwnd` except `renderHwnd`, then resize
 * the render panel to fill main's full client area. Result: only the
 * gameplay surface is visible inside the floating window — toolbar, status
 * bar, replay-list view, etc. are all hidden.
 *
 * Slippi's render thread responds to the panel's WM_SIZE by recreating its
 * swap chain at the new dimensions, so the gameplay scales to fill.
 */
export function coverShellWithRender(mainHwnd: bigint, renderHwnd: bigint): void {
  const b = getBindings();
  b.SetMenu(mainHwnd, null);
  const renderPath = getPathFromAncestorToDescendant(mainHwnd, renderHwnd);
  const keepVisible = new Set(renderPath);

  for (const child of findChildWindows(mainHwnd)) {
    if (keepVisible.has(child)) continue;
    // Skip descendants of the render panel — those belong to Slippi's
    // overlay (frame counter, controller display, etc.) and should stay
    // visible if Dolphin chose to show them.
    if (isDescendantOf(child, renderHwnd)) continue;
    b.ShowWindow(child, SW_HIDE);
  }

  fitRenderPathToMainClient(mainHwnd, renderHwnd, true);
  settleRenderLayout(mainHwnd, renderHwnd);
}

/**
 * Re-fit the render panel to main's client area after main has been
 * resized. Cheaper than coverShellWithRender (skips re-hiding children)
 * — call this on every drag/resize tick.
 */
export function refitRender(mainHwnd: bigint, renderHwnd: bigint): void {
  fitRenderPathToMainClient(mainHwnd, renderHwnd);
  settleRenderLayout(mainHwnd, renderHwnd);
}

/** True if `candidate` is a descendant of `ancestor` in the window tree. */
function isDescendantOf(candidate: bigint, ancestor: bigint): boolean {
  for (const c of findChildWindows(ancestor)) {
    if (c === candidate) return true;
  }
  return false;
}

/** Politely ask the window to close. Dolphin handles WM_CLOSE by exiting. */
export function requestClose(hwnd: bigint): void {
  const b = getBindings();
  b.PostMessageW(hwnd, WM_CLOSE, 0, 0);
}
