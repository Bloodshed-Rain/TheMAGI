import { validatePlayBounds, type PlayBounds, type PlayStatus } from "../playMode";

export interface PlayProcess {
  pid?: number | undefined;
  kill(): boolean;
  once(event: "exit" | "error", callback: (...args: any[]) => void): unknown;
}
export interface PlaySurface {
  mainHwnd: bigint;
  renderHwnd: bigint;
  renderIsChild: boolean;
  shellHwnds?: bigint[];
}
export interface PlaySessionDependencies {
  spawn(): PlayProcess;
  findWindow(pid: number, signal?: AbortSignal): Promise<PlaySurface>;
  place(surface: PlaySurface, bounds: PlayBounds): void;
  hide(surface: PlaySurface): void;
  close(surface: PlaySurface): void;
  publish(status: PlayStatus): void;
}

/** Owns only the Dolphin process MAGI launches. Route changes hide it; only
 * Stop Game or application shutdown closes it. */
export class PlaySessionController {
  private session: {
    child: PlayProcess;
    surface: PlaySurface | null;
    bounds: PlayBounds;
    visible: boolean;
    discovery: AbortController;
  } | null = null;
  private pendingStops = new Map<PlayProcess, ReturnType<typeof setTimeout>>();
  private status: PlayStatus = { phase: "stopped", visible: false, error: null };
  constructor(private deps: PlaySessionDependencies) {}
  getStatus(): PlayStatus {
    return { ...this.status };
  }
  private update(status: PlayStatus): PlayStatus {
    this.status = status;
    this.deps.publish(this.getStatus());
    return this.getStatus();
  }
  open(bounds: PlayBounds): PlayStatus {
    validatePlayBounds(bounds);
    if (this.session) {
      this.show(bounds);
      return this.getStatus();
    }
    const child = this.deps.spawn();
    if (child.pid == null) {
      child.once("error", () => {});
      throw new Error("Dolphin could not be started");
    }
    const session = {
      child,
      surface: null as PlaySurface | null,
      bounds: { ...bounds },
      visible: true,
      discovery: new AbortController(),
    };
    this.session = session;
    this.update({ phase: "launching", visible: true, error: null });
    child.once("exit", () => {
      session.discovery.abort();
      if (this.session !== session) return;
      this.session = null;
      this.update({ phase: "stopped", visible: false, error: null });
    });
    child.once("error", (error: Error) => this.fail(session, error));
    let discovery: Promise<PlaySurface>;
    try {
      discovery = this.deps.findWindow(child.pid, session.discovery.signal);
    } catch (error) {
      this.fail(session, error);
      return this.getStatus();
    }
    void discovery
      .then((surface) => {
        if (this.session !== session) return;
        session.surface = surface;
        // Apply placement once even when the user left during startup, so the
        // shell is owned by MAGI and can then be hidden without closing the game.
        this.deps.place(surface, session.bounds);
        if (!session.visible) this.deps.hide(surface);
        this.update({ phase: "running", visible: session.visible, error: null });
      })
      .catch((error: unknown) => this.fail(session, error));
    return this.getStatus();
  }
  private fail(session: NonNullable<PlaySessionController["session"]>, error: unknown): void {
    if (this.session !== session) return;
    this.session = null;
    session.discovery.abort();
    this.terminate(session.child);
    this.update({ phase: "error", visible: false, error: error instanceof Error ? error.message : String(error) });
  }
  show(bounds: PlayBounds): void {
    validatePlayBounds(bounds);
    const session = this.session;
    if (!session) return;
    session.bounds = { ...bounds };
    session.visible = true;
    if (!this.status.visible) this.update({ ...this.status, visible: true });
    this.reposition();
  }
  hide(): void {
    const session = this.session;
    if (!session) return;
    session.visible = false;
    let error = this.status.error;
    try {
      if (session.surface) this.deps.hide(session.surface);
    } catch (err) {
      error = `Could not hide Melee: ${err instanceof Error ? err.message : String(err)}`;
    }
    this.update({ ...this.status, visible: false, error });
  }
  reposition(): void {
    if (!this.session?.visible || !this.session.surface) return;
    try {
      this.deps.place(this.session.surface, this.session.bounds);
      if (this.status.error) this.update({ ...this.status, error: null });
    } catch (error) {
      // A transient native resize failure must not kill an in-progress match or
      // escape from Electron's move/focus event handlers.
      const message = `Could not position Melee: ${error instanceof Error ? error.message : String(error)}`;
      if (this.status.error !== message) this.update({ ...this.status, error: message });
    }
  }
  private terminate(child: PlayProcess): void {
    try {
      child.kill();
    } catch (error) {
      console.error("[play] Dolphin cleanup failed:", error);
    }
  }
  private clearPendingStop(child: PlayProcess): void {
    const timer = this.pendingStops.get(child);
    if (timer) clearTimeout(timer);
    this.pendingStops.delete(child);
  }
  stop(force = false): PlayStatus {
    const session = this.session;
    this.session = null;
    session?.discovery.abort();
    if (force) {
      for (const child of this.pendingStops.keys()) {
        this.clearPendingStop(child);
        this.terminate(child);
      }
    }
    if (session) {
      if (force) this.terminate(session.child);
      else {
        const timer = setTimeout(() => {
          this.pendingStops.delete(session.child);
          this.terminate(session.child);
        }, 1500);
        this.pendingStops.set(session.child, timer);
        session.child.once("exit", () => this.clearPendingStop(session.child));
        timer.unref();
      }
    }
    if (session?.surface && !force) {
      try {
        this.deps.close(session.surface);
      } catch {
        /* Fallback below still owns and terminates the child. */
      }
    }
    return this.update({ phase: "stopped", visible: false, error: null });
  }
}
