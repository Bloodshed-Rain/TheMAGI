export type CornermanPopupLiveAlertMode = "all" | "high" | "off";

export interface CornermanPopupSettings {
  coachingCards: boolean;
  liveAlerts: CornermanPopupLiveAlertMode;
  errors: boolean;
  desktopNotifications: boolean;
  autoHideSeconds: number;
}

export const DEFAULT_CORNERMAN_POPUP_SETTINGS: CornermanPopupSettings = {
  coachingCards: true,
  liveAlerts: "all",
  errors: true,
  desktopNotifications: false,
  autoHideSeconds: 0,
};

export const MAX_CORNERMAN_POPUP_AUTO_HIDE_SECONDS = 120;

export function normalizeCornermanPopupLiveAlerts(value: unknown): CornermanPopupLiveAlertMode {
  return value === "all" || value === "high" || value === "off" ? value : DEFAULT_CORNERMAN_POPUP_SETTINGS.liveAlerts;
}

export function normalizeCornermanPopupBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeCornermanPopupAutoHideSeconds(value: unknown): number {
  const numeric =
    typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_CORNERMAN_POPUP_SETTINGS.autoHideSeconds;
  return Math.min(MAX_CORNERMAN_POPUP_AUTO_HIDE_SECONDS, Math.max(0, Math.round(numeric)));
}

export function resolveCornermanPopupSettings(config: {
  cornermanPopupCoachingCards?: unknown;
  cornermanPopupLiveAlerts?: unknown;
  cornermanPopupErrors?: unknown;
  cornermanDesktopNotifications?: unknown;
  cornermanPopupAutoHideSeconds?: unknown;
}): CornermanPopupSettings {
  return {
    coachingCards: normalizeCornermanPopupBoolean(
      config.cornermanPopupCoachingCards,
      DEFAULT_CORNERMAN_POPUP_SETTINGS.coachingCards,
    ),
    liveAlerts: normalizeCornermanPopupLiveAlerts(config.cornermanPopupLiveAlerts),
    errors: normalizeCornermanPopupBoolean(config.cornermanPopupErrors, DEFAULT_CORNERMAN_POPUP_SETTINGS.errors),
    desktopNotifications: normalizeCornermanPopupBoolean(
      config.cornermanDesktopNotifications,
      DEFAULT_CORNERMAN_POPUP_SETTINGS.desktopNotifications,
    ),
    autoHideSeconds: normalizeCornermanPopupAutoHideSeconds(config.cornermanPopupAutoHideSeconds),
  };
}

export function shouldShowCornermanLiveAlert(mode: CornermanPopupLiveAlertMode, importance: "info" | "high"): boolean {
  if (mode === "off") return false;
  if (mode === "high") return importance === "high";
  return true;
}
