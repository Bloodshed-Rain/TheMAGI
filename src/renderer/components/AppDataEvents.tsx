import { useEffect, useState } from "react";
import { refreshData } from "../hooks/cache";
import { useGlobalStore } from "../stores/useGlobalStore";
import { useImportStore } from "../stores/useImportStore";


export function AppDataEvents({ refreshKey }: { refreshKey: number }) {
  const [notice, setNotice] = useState("");
  useEffect(() => { void refreshData(); }, [refreshKey]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const setWatcher = useGlobalStore.getState().setWatcherActive;
    const noticeListener = (event: Event) => setNotice((event as CustomEvent<string>).detail);
    window.addEventListener("magi:notice", noticeListener);
    const offStatus = window.clippi.onWatcherStatus(setWatcher);
    void window.clippi.getWatcherStatus().then(setWatcher).catch(() => setNotice("Could not read replay watcher status. Retry from Replay settings."));
    const offImport = window.clippi.onImported(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { void refreshData(); }, 150);
    });
    const offError = window.clippi.onWatcherError((message) => {
      setNotice(`Replay watcher: ${message}`);
      void window.clippi.getWatcherStatus().then(setWatcher).catch(() => {});
    });
    const offProgress = window.clippi.onImportProgress((progress) => {
      if (useImportStore.getState().busy) useImportStore.setState({ progress });
    });
    const offCard = window.clippi.onCornermanCard((card) => {
      useGlobalStore.getState().addCornermanCard(card);
      void refreshData();
    });
    return () => {
      clearTimeout(timer); offStatus(); offImport(); offError(); offProgress(); offCard();
      window.removeEventListener("magi:notice", noticeListener);
    };
  }, []);
  return notice ? <div className="operation-status" role="status"><span>{notice}</span>
    <button type="button" className="btn" onClick={() => setNotice("")}>Dismiss</button>
  </div> : null;
}
