export interface DolphinWindowCandidate {
  hwnd: bigint;
  width: number;
  height: number;
  className: string;
  title: string;
}
export interface DolphinTopWindow extends DolphinWindowCandidate {
  hasMenu: boolean;
  children: DolphinWindowCandidate[];
}
export interface DolphinGameSurface {
  mainHwnd: bigint;
  renderHwnd: bigint;
  renderIsChild: boolean;
  shellHwnds: bigint[];
}
const renderClass =
  /^(?:Dolphin|DolphinRender(?:Window)?|RenderFrame|RenderWidget|wxGLCanvas|QOpenGLWidget|GLWindow)$/i;
const libraryControl = /(?:SysListView32|SysTreeView32|wxListCtrl|wxDataView|QListView|QTreeView)/i;
const shellTitle = /^(?:Faster Melee\s*[-–]\s*Slippi(?:\s*\([^)]*\))?|Slippi Dolphin(?:\s*\([^)]*\))?)$/i;
const gameTitle = /(?:Super Smash Bros|\bGALE01\b|\bFPS\s*[:=|]|\bVPS\s*[:=|])/i;
const isDialog = (window: DolphinTopWindow) =>
  /(?:Dialog|#32770)/i.test(window.className) || /^(?:Error|Warning|Confirm|Loading|Compiling)\b/i.test(window.title);
export function isDolphinLibraryWindow(window: DolphinTopWindow): boolean {
  return window.children.some((child) => libraryControl.test(child.className)) || shellTitle.test(window.title);
}

/** A library being bigger or appearing first is never evidence that it renders
 * Melee. Wait for an identified render surface rather than hosting a game list. */
export function selectDolphinGameSurface(windows: DolphinTopWindow[], settled = false): DolphinGameSurface | null {
  const libraries = windows.filter(isDolphinLibraryWindow);
  const choices: Array<{ top: DolphinTopWindow; render: DolphinWindowCandidate; score: number }> = [];
  for (const top of windows) {
    if (top.width < 320 || top.height < 240 || isDialog(top)) continue;
    const render = top.children
      .filter((child) => child.width >= 160 && child.height >= 120 && renderClass.test(child.className))
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (render) {
      choices.push({ top, render, score: 100 });
      continue;
    }
    // Render-to-main wx builds replace the game list with a large panel once
    // emulation starts, while retaining the shell title, menu and toolbar.
    const mainPanel = top.children
      .filter(
        (child) =>
          child.className === "wxWindowNR" && child.title === "panel" && child.width >= 320 && child.height >= 240,
      )
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (
      settled &&
      shellTitle.test(top.title) &&
      !top.children.some((child) => libraryControl.test(child.className)) &&
      top.children.some((child) => child.className === "ToolbarWindow32") &&
      mainPanel
    ) {
      choices.push({ top, render: mainPanel, score: 95 });
      continue;
    }
    if (isDolphinLibraryWindow(top)) continue;
    if (renderClass.test(top.className)) {
      choices.push({ top, render: top, score: 90 });
      continue;
    }
    if (gameTitle.test(top.title)) {
      choices.push({ top, render: top, score: 80 });
      continue;
    }
    // wx-based Slippi builds can name the separate render frame just Dolphin.
    // It has no menu or list controls. Never use this fallback on a menu shell.
    if (!top.hasMenu && /^Dolphin$/i.test(top.title) && (libraries.length > 0 || settled))
      choices.push({ top, render: top, score: 60 });
  }
  choices.sort((a, b) => b.score - a.score);
  const chosen = choices[0];
  if (!chosen) return null;
  return {
    mainHwnd: chosen.top.hwnd,
    renderHwnd: chosen.render.hwnd,
    renderIsChild: chosen.top.hwnd !== chosen.render.hwnd,
    shellHwnds: libraries.filter((window) => window.hwnd !== chosen.top.hwnd).map((window) => window.hwnd),
  };
}
