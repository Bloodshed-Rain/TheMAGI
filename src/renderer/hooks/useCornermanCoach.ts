import { useEffect } from "react";
import { useGlobalStore } from "../stores/useGlobalStore";
import { createHybridCornermanSpeechCoach } from "../utils/cornermanSpeech";
import { resolveCornermanVoiceSettings } from "../../cornermanVoiceSettings";
import { resolveCornermanPopupSettings, shouldShowCornermanLiveAlert } from "../../cornermanPopupSettings";

/** One main-renderer owner: delivery and voice survive page changes without a popup. */
export function useCornermanCoach() {
  useEffect(() => {
    let disposed = false,
      active = false,
      statusReceived = false;
    let settings = resolveCornermanVoiceSettings({});
    let display = resolveCornermanPopupSettings({});
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const coach = createHybridCornermanSpeechCoach((message) =>
      useGlobalStore.setState({ cornermanError: `Voice: ${message}` }),
    );
    const configure = () => coach?.configure({ ...settings, enabled: active && settings.enabled });
    const reload = async () => {
      try {
        const config = await window.clippi.loadConfig();
        if (disposed) return;
        settings = resolveCornermanVoiceSettings(config ?? {});
        display = resolveCornermanPopupSettings(config ?? {});
        if (config?.cornermanEnabled === false) {
          settings = { ...settings, enabled: false };
          if (active) await window.clippi.cornermanStop();
        }
        configure();
      } catch {
        /* Keep the last successfully loaded preferences. */
      }
    };
    void reload();
    void window.clippi
      .cornermanStatus()
      .then((status) => {
        if (!disposed && !statusReceived) {
          active = status.active;
          configure();
        }
      })
      .catch(() => {});
    const offSettings = window.clippi.onCornermanSettingsChanged(() => void reload());
    const offStream = window.clippi.onCornermanStream((chunk) =>
      useGlobalStore.setState((s) => ({ cornermanStream: s.cornermanStream + chunk, cornermanError: null })),
    );
    const offCard = window.clippi.onCornermanCard((card) => {
      useGlobalStore.setState({ cornermanStream: "", cornermanError: null });
      useGlobalStore.getState().addCornermanCard(card);
      coach?.speakBetweenGameAdjustment(card.text);
    });
    const offEvents = window.clippi.onCornermanLiveEvent((event) => {
      coach?.enqueueLiveEvent(event);
      if (!shouldShowCornermanLiveAlert(display.liveAlerts, event.importance)) return;
      useGlobalStore.setState((s) => ({
        cornermanLiveEvents: [event, ...s.cornermanLiveEvents.filter((e) => e.id !== event.id)].slice(0, 4),
      }));
      const old = timers.get(event.id);
      if (old) clearTimeout(old);
      timers.set(
        event.id,
        setTimeout(() => {
          timers.delete(event.id);
          useGlobalStore.setState((s) => ({
            cornermanLiveEvents: s.cornermanLiveEvents.filter((e) => e.id !== event.id),
          }));
        }, 20000),
      );
    });
    const offError = window.clippi.onCornermanError((message) =>
      useGlobalStore.setState({ cornermanStream: "", cornermanError: message }),
    );
    const offStatus = window.clippi.onCornermanSetUpdate((status) => {
      statusReceived = true;
      active = status.active;
      configure();
      useGlobalStore.setState({ cornermanStream: "" });
      if (!status.active) {
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
        useGlobalStore.setState({ cornermanLiveEvents: [], cornermanError: null });
      }
    });
    return () => {
      disposed = true;
      offSettings();
      offStream();
      offCard();
      offEvents();
      offError();
      offStatus();
      for (const timer of timers.values()) clearTimeout(timer);
      coach?.dispose();
    };
  }, []);
}
