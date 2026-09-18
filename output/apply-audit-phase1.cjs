const fs = require('fs');
function edit(p, fn) { const source = fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'); fs.writeFileSync(p,fn(source)); }
function r(s,a,b) { if(!s.includes(a)) throw Error('Missing: '+a.slice(0,100)); return s.replace(a,b); }
edit('src/renderer/main.tsx',s=>{
 s=r(s,'{ QueryClient, QueryClientProvider }','{ QueryClientProvider }');
 s=r(s,'import { App }','import { queryClient } from "./hooks/cache";\nimport { App }');
 return s.replace(/const queryClient = new QueryClient\([\s\S]*?\n\}\);\n/,'');
});
edit('src/renderer/App.tsx',s=>{
 s='import { AppDataEvents } from "./components/AppDataEvents";\nimport { ImportStatus } from "./components/ImportStatus";\n'+s;
 s=r(s,'navigate("/settings");','navigate("/settings?section=replays");');
 s=r(s,'        {routes}\n      </LiquidShell>','        <AppDataEvents refreshKey={refreshKey} />\n        <ImportStatus />\n        {routes}\n      </LiquidShell>');
 return s;
});
edit('src/renderer/pages/Settings.tsx',s=>{
 s='import { useSearchParams } from "react-router-dom";\nimport { useImportStore } from "../stores/useImportStore";\nimport { clearReplayData, queryClient } from "../hooks/cache";\n'+s;
 s=r(s,'  const [saved, setSaved] = useState(false);','  const [saved, setSaved] = useState(false);\n  const [saving, setSaving] = useState(false);\n  const [status, setStatus] = useState("");\n  const [loaded, setLoaded] = useState(false);\n  const [loadAttempt, setLoadAttempt] = useState(0);\n  const [watcherBusy, setWatcherBusy] = useState(false);\n  const [params, setParams] = useSearchParams();');
 const start=s.indexOf('  const [importing, setImporting]'); const end=s.indexOf('  const [dynamicModels',start);
 s=s.slice(0,start)+'  const importing = useImportStore((state) => state.busy);\n  const watching = useGlobalStore((state) => state.watcherActive);\n'+s.slice(end);
 s=s.replace(/const \[activeSection, setActiveSection\] = useState<SettingsSectionId>\("profile"\);/,`const activeSection = (SETTINGS_SECTIONS.some(s => s.id === params.get("section")) ? params.get("section") : "profile") as SettingsSectionId;
  const setActiveSection = (section: SettingsSectionId) => setParams({ section }, { replace: true });`);
 s=r(s,'if (c) setConfig(c);','if (c) setConfig(c);\n        setLoaded(true);\n        setStatus("");');
 s=r(s,'console.error("Failed to load config:", err);','setStatus(`Could not load settings: ${err instanceof Error ? err.message : String(err)}`);');
 s=r(s,'    load();\n  }, []);','    load();\n  }, [loadAttempt]);');
 const p=s.indexOf('  // Import progress events'); const q=s.indexOf('  const handleSave',p); s=s.slice(0,p)+s.slice(q);
 s=r(s,'  const handleSave = useCallback(async () => {','  const handleSave = useCallback(async () => {\n    if (saving || !loaded) return;\n    setSaving(true); setSaved(false); setStatus("");');
 s=r(s,'delete payload.theme;','delete payload.theme;\n      delete payload.density;');
 s=r(s,'      setSaved(true);','      setSaved(true);\n      setStatus("Settings saved.");\n      await queryClient.invalidateQueries({ queryKey: ["config"] });');
 s=r(s,'setImportStatus(`Error saving: ${err instanceof Error ? err.message : String(err)}`);','setStatus(`Could not save settings: ${err instanceof Error ? err.message : String(err)}`);');
 s=r(s,'  }, [config, keyEdits]);','    finally { setSaving(false); }\n  }, [config, keyEdits, saving, loaded]);');
 s=s.replaceAll('.catch(() => {});','.catch((error: unknown) => setStatus(`Could not save preference: ${error instanceof Error ? error.message : String(error)}`));');
 const a=s.indexOf('  const handleImport = async'); const b=s.indexOf('  const toggleWatcher',a);
 s=s.slice(0,a)+`  const handleImport = async () => {
    const player = config.connectCode?.trim() || config.targetPlayer?.trim();
    if (!player) { setStatus("Enter your connect code or player tag in Profile, then return to Replays."); setActiveSection("profile"); return; }
    await useImportStore.getState().run(config.replayFolder ?? "", player);
  };

`+s.slice(b);
 s=r(s,'  const toggleWatcher = async () => {\n    try {','  const toggleWatcher = async () => {\n    if (watcherBusy) return;\n    setWatcherBusy(true);\n    try {');
 s=s.replaceAll('        setWatching(false);\n','').replaceAll('        setWatching(true);\n','');
 s=s.replaceAll('setImportStatus(', 'setStatus(');
 s=r(s,'!config.replayFolder || !config.targetPlayer','!config.replayFolder || !(config.connectCode?.trim() || config.targetPlayer?.trim())');
 s=r(s,'config.connectCode ?? config.targetPlayer','config.connectCode?.trim() || config.targetPlayer!.trim()');
 s=r(s,'      setWatcherActive(false);\n      setStatus(`Watcher error:', '      setStatus(`Watcher error:');
 s=r(s,'    }\n  };\n\n  const handleClearAll','    } finally { setWatcherBusy(false); }\n  };\n\n  const handleClearAll');
 s=r(s,'await window.clippi.clearAllGames();','await clearReplayData();');
 s=r(s,'<button className="btn btn-primary settings-save-button" onClick={handleSave}>','<button className="btn btn-primary settings-save-button" onClick={handleSave} disabled={saving || !loaded}>');
 s=r(s,'{saved ? "Saved!" : "Save Settings"}','{saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}');
 s=r(s,'      <div className="settings-shell">',`      <p className="help-copy">Profile, playback, and coaching fields use Save Settings. Appearance choices save immediately.</p>
      {status && <div className="operation-status" role="status">{status}</div>}
      {!loaded && <button className="btn" onClick={() => setLoadAttempt(n => n + 1)}>Retry loading settings</button>}
      <div className="settings-shell">`);
 s=r(s,'onClick={toggleWatcher}>','onClick={toggleWatcher} disabled={watcherBusy}>');
 const x=s.indexOf('                {importing && (');const y=s.indexOf('\n              </Card>',x);s=s.slice(0,x)+s.slice(y);
 s=r(s,'placeholder="/path/to/slippi/replays"','placeholder="/path/to/slippi/replays"\n                      aria-label="Replay folder"');
 return s;
});
edit('src/renderer/pages/Dashboard.tsx',s=>{
 s='import { useImportStore } from "../stores/useImportStore";\nimport { showNotice } from "../components/AppDataEvents";\nimport { LoadError } from "../components/ui/LoadError";\n'+s;
 s=r(s,'data: games = [], isLoading, refetch','data: games = [], isLoading, isError, refetch');
 s=r(s,'const [importing, setImporting] = useState(false);','const importing = useImportStore((state) => state.busy);');
 const a=s.indexOf('  const handleImport = useCallback');const b=s.indexOf('  const recent =',a);
 s=s.slice(0,a)+`  const handleImport = useCallback(async () => {
    if (useImportStore.getState().busy) return;
    try {
      const config = await window.clippi.loadConfig();
      const tag = config?.connectCode?.trim() || config?.targetPlayer?.trim();
      if (!tag) { navigate("/settings?section=profile"); return; }
      const folder = await window.clippi.openFolder();
      if (folder) await useImportStore.getState().run(folder, tag);
    } catch (error) { showNotice(error instanceof Error ? error.message : String(error)); }
  }, [navigate]);

`+s.slice(b);
 s=r(s,'  if (games.length === 0) {','  if (isError) return <LoadError message="Could not load your replays." retry={() => void refetch()} />;\n\n  if (games.length === 0) {');
 s=r(s,'cta={{ label: "Import Replays", onClick: handleImport }}','cta={{ label: importing ? "Importing…" : "Import Replays", onClick: handleImport, disabled: importing }}');
 s=s.replaceAll('g.result === "win" ? "win" : "loss"','g.result');
 s=r(s,'<KPI label="Win Rate"','<KPI label="Win Rate · all games"');
 s=r(s,'label="Neutral WR"','label={`Neutral WR · last ${recent.length}`}');
 s=r(s,'label="L-Cancel"','label={`L-Cancel · last ${recent.length}`}');
 s=r(s,'<KPI label="Dmg / Opening"','<KPI label={`Dmg / Opening · last ${recent.length}`}');
 s=r(s,'      <RecentHighlightReel',`      <p className="help-copy">Technique changes compare the latest 10 games with the preceding 10. pp means percentage points. Win rate excludes draws.</p>
      <div className="review-next"><div><strong>Choose your next adjustment</strong><p>Review a game, capture one decision, then test it in practice.</p></div>
        <button className="btn btn-primary" onClick={() => navigate("/performance")}>Find a review target</button></div>
      <RecentHighlightReel`);
 s=r(s,'<DataTable>','<DataTable className="identity-table">');
 // Advice must be tied to the current sample; avoid paid automatic retries.
 s=r(s,'  const runningRef = useRef(false);','  const runningRef = useRef(false);\n  const [insightKey, setInsightKey] = useState("");\n  const [model, setModel] = useState("");\n  useEffect(() => { window.clippi.getCurrentModel().then(m => setModel(m.label)).catch(() => {}); }, []);');
 s=r(s,'      setInsight(result);','      setInsight(result);\n      setInsightKey(games.slice(0, 5).map(g => g.id).join(","));');
 s=r(s,'<Card title="MAGI Oracle" className="clippi-card">',`<Card title="MAGI Oracle" className="clippi-card">
      <p className="help-copy">Based on the latest {Math.min(games.length, 5)} games{model ? " · " + model : ""}.</p>
      {games.length < 3 && <p>Import at least 3 games to build a coaching summary.</p>}
      {insight && insightKey !== gameKey && <p role="status">New games are available. Refresh this summary to include them.</p>}
      {games.length >= 3 && <button className="btn" disabled={loading} onClick={run}>{error ? "Retry summary" : "Refresh summary"}</button>}`);
 return s;
});
edit('src/renderer/components/ui/EmptyState.tsx',s=>{
 s=r(s,'onClick: () => void','onClick: () => void; disabled?: boolean');
 s=r(s,'onClick={cta.onClick}','onClick={cta.onClick} disabled={cta.disabled}');return s;
});
