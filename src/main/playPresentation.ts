export const GAME_ONLY_SHORTCUT = "Control+Shift+F11";

interface PresentationDependencies {
  isFullScreen(): boolean;
  setFullScreen(value: boolean): void;
  registerExit(callback: () => void): boolean;
  unregisterExit(): void;
  publish(active: boolean): void;
}

/** Fullscreen presentation is temporary; it never changes the saved layout or
 * owns the game process. Reserve an exit shortcut before hiding the controls. */
export class PlayPresentation {
  private active = false;
  private wasFullScreen = false;
  constructor(private deps: PresentationDependencies) {}
  isActive(): boolean {
    return this.active;
  }
  enter(): boolean {
    if (this.active) return true;
    if (!this.deps.registerExit(() => this.leave()))
      throw new Error("Ctrl+Shift+F11 is in use by another app. Free that shortcut before entering fullscreen.");
    this.wasFullScreen = this.deps.isFullScreen();
    this.active = true;
    try {
      this.deps.setFullScreen(true);
      this.deps.publish(true);
    } catch (error) {
      try {
        this.leave();
      } catch {
        /* Preserve the original fullscreen failure. */
      }
      throw error;
    }
    return true;
  }
  leave(restoreWindow = true): boolean {
    if (!this.active) return false;
    this.active = false;
    try {
      this.deps.unregisterExit();
    } catch (error) {
      console.warn("[play] Could not release fullscreen shortcut:", error);
    }
    try {
      if (restoreWindow) this.deps.setFullScreen(this.wasFullScreen);
    } catch (error) {
      console.warn("[play] Could not restore fullscreen window:", error);
    }
    this.deps.publish(false);
    return false;
  }
}
