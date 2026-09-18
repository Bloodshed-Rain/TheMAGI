const fs = require('fs');
function edit(p, fn) { const s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'); fs.writeFileSync(p,fn(s)); }
function rep(s,a,b){if(!s.includes(a))throw new Error('Missing '+a.slice(0,100));return s.replace(a,b);}
edit('src/renderer/pages/PerformanceLab.tsx',s=>{
s='import { LoadError } from "../components/ui/LoadError";\nimport { useViewState } from "../hooks/useViewState";\n'+s;
s=rep(s,'const { data: logs = [], refetch: refetchLogs } = useTrainingLog(30);','const [logPage, setLogPage] = useViewState("training-page", 0);\n  const { data: logRows = [], isError: logsError, refetch: refetchLogs } = useTrainingLog(21, logPage * 20);\n  const logs = logRows.slice(0, 20);');
s=rep(s,'const data = new FormData(event.currentTarget);','if (saving) return;\n    const form = event.currentTarget;\n    const data = new FormData(form);');
s=rep(s,'event.currentTarget.reset();','form.reset();\n      setLogPage(0);');
s=rep(s,'return <EmptyState title="Performance Lab is unavailable" sub="Try refreshing after your next replay import." />;','return <LoadError message="Performance Lab could not load." onRetry={() => void refetchHub()} />;');
const start=s.indexOf('  if (hub.sample.gamesScanned === 0)'); const end=s.indexOf('  return (',start+50); const close=s.indexOf('\n  return (\n    <div className="performance-lab">',start); s=s.slice(0,start)+s.slice(close);
s=rep(s,'{showLogForm && (','{hub.sample.gamesScanned === 0 && <EmptyState title="No replay data to analyze yet" sub="Import replays for your scorecard. You can log training now." />}\n      {showLogForm && (');
s=rep(s,'{trackedMinutes} min tracked','{trackedMinutes} min on this page');
s=rep(s,'{logs.length === 0 ? (','{logsError ? <LoadError message="Training history could not load." onRetry={() => void refetchLogs()} /> : logs.length === 0 ? (');
s=rep(s,'logs.slice(0, 6).map','logs.map');
s=rep(s,'</Card>\n        </section>\n      </div>','</Card>\n          <div className="audit-pagination"><button className="btn" disabled={logPage === 0} onClick={() => setLogPage(p => p - 1)}>Newer blocks</button><span>Page {logPage + 1}</span><button className="btn" disabled={logRows.length <= 20} onClick={() => setLogPage(p => p + 1)}>Older blocks</button></div>\n        </section>\n      </div>'); return s;
});
edit('src/db.ts',s=>{s=rep(s,'listTrainingLogEntries(limit: number = 30)','listTrainingLogEntries(limit: number = 30, offset: number = 0)'); const i=s.indexOf('export function listTrainingLogEntries'); let t=s.slice(i); t=rep(t,'LIMIT ?','LIMIT ? OFFSET ?'); t=rep(t,'.all(safeLimit)','.all(safeLimit, Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0)'); s=s.slice(0,i)+t; const j=s.indexOf('export function getSessionsByDay'); let u=s.slice(j); u=rep(u,"WHERE date(played_at, 'localtime') >= date('now', 'localtime', '-' || ? || ' days')","WHERE (? = 0 OR date(played_at, 'localtime') >= date('now', 'localtime', '-' || ? || ' days'))"); u=rep(u,'.all(daysBack)','.all(daysBack, daysBack)'); return s.slice(0,j)+u;});
edit('src/main/handlers/stats.ts',s=>rep(s,'(_e, limit?: number) => listTrainingLogEntries(limit)','(_e, limit?: number, offset?: number) => listTrainingLogEntries(limit, offset)'));
edit('src/preload/index.ts',s=>rep(s,'getTrainingLog: (limit?: number) => ipcRenderer.invoke("stats:trainingLog", limit)','getTrainingLog: (limit?: number, offset?: number) => ipcRenderer.invoke("stats:trainingLog", limit, offset)'));
edit('src/renderer/global.d.ts',s=>rep(s,'getTrainingLog: (limit?: number)','getTrainingLog: (limit?: number, offset?: number)'));
edit('src/renderer/hooks/queries.ts',s=>rep(rep(rep(s,'useTrainingLog = (limit: number = 30)','useTrainingLog = (limit: number = 30, offset: number = 0)'),'queryKey: ["trainingLog", limit]','queryKey: ["trainingLog", limit, offset]'),'window.clippi.getTrainingLog(limit)','window.clippi.getTrainingLog(limit, offset)'));
edit('src/renderer/components/CommandPalette.tsx',s=>{
s='import { useNavigate } from "react-router-dom";\nimport { useDialog } from "../hooks/useDialog";\nimport { clearReplayData } from "../hooks/cache";\nimport { showNotice } from "./AppDataEvents";\n'+s;
s=rep(s,'const [query, setQuery]','const navigate = useNavigate();\n  const panelRef = useRef<HTMLDivElement>(null);\n  const [query, setQuery]');
s=rep(s,'}, [onOpenChange]);','}, [onOpenChange]);\n  useDialog(panelRef, isOpen, close, inputRef);');
s=rep(s,'window.clippi.clearAllGames();','void clearReplayData().then(() => showNotice("Replay data cleared.")).catch(e => showNotice(`Could not clear replay data: ${e instanceof Error ? e.message : String(e)}`));');
s=rep(s,'// Navigate to sessions to find this opponent\n          navigateTo("sessions");','navigate(`/rivals?opponent=${encodeURIComponent(opp.code || opp.tag)}`);');
s=rep(s,'[opponents, navigateTo, close]','[opponents, navigate, close]');
s=rep(s,'// ── Reset selection when results change','const displayItems = useMemo(() => groupedItems.flatMap(group => group.items), [groupedItems]);\n\n  // ── Reset selection when results change');
const a=s.indexOf('  const handleKeyDown'); s=s.slice(0,a)+s.slice(a).replaceAll('filteredItems','displayItems');
s=rep(s,'(e: React.KeyboardEvent) => {','(e: React.KeyboardEvent) => {\n      if (e.target !== inputRef.current) return;');
s=rep(s,'className="cmd-panel"','ref={panelRef}\n            className="cmd-panel"');
s=rep(s,'aria-label="Search commands"','role="combobox"\n                aria-expanded={true}\n                aria-controls="command-results"\n                aria-label="Search commands"');
s=rep(s,'<kbd className="cmd-kbd">ESC</kbd>','<button type="button" className="btn btn-ghost" onClick={close} aria-label="Close command palette">Esc</button>');
s=rep(s,'className="cmd-results"','id="command-results" aria-label="Commands" className="cmd-results"');
s=rep(s,'role="option"','role="option"\n                        tabIndex={-1}');
s=rep(s,'if (!isOpen) return;\n\n    if (debounceRef','if (!isOpen) return;\n    let cancelled = false;\n\n    if (debounceRef');
s=rep(s,'const results = await window.clippi.getOpponents(query);','const results = await window.clippi.getOpponents(query);\n          if (cancelled) return;');
s=rep(s,'} catch {\n          setOpponents','} catch {\n          if (cancelled) return;\n          setOpponents');
s=rep(s,'return () => {\n      if (debounceRef','return () => {\n      cancelled = true;\n      if (debounceRef');return s;
});
edit('src/renderer/pages/Sessions.tsx',s=>{
s='import { LoadError } from "../components/ui/LoadError";\nimport { useViewState } from "../hooks/useViewState";\n'+s;
s=rep(s,'const [report, setReport]','const [expanded, setExpanded] = useViewState(`session-expanded-${day.date}`, false);\n  const [report, setReport]');
s=rep(s,'games.slice(0, MAX_INLINE_DOTS)','expanded ? games : games.slice(0, MAX_INLINE_DOTS)');
s=rep(s,'<span\n                  aria-label={`${overflow} more games`}','<button type="button" className="btn btn-ghost" onClick={() => setExpanded(true)}\n                  aria-label={`Show ${overflow} more games`}');
s=rep(s,'+{overflow}\n                </span>','+{overflow}\n                </button>');
s=rep(s,'aria-label={`Open ${result} game`}','aria-label={`Open ${result} game ${game.id}`}');
s=rep(s,'const { data: days = [], isLoading, isError } = useSessionsByDay(90);','const [range, setRange] = useViewState("sessions-range", 90);\n  const { data: days = [], isLoading, isError, refetch } = useSessionsByDay(range);');
s=rep(s,'return <div className="sessions-error">Failed to load sessions. Please try again.</div>;','return <LoadError message="Sessions could not load." onRetry={() => void refetch()} />;');
const start=s.indexOf('  if (days.length === 0)'); const end=s.indexOf('\n  return (\n    <div>',start); s=s.slice(0,start)+s.slice(end);
s=rep(s,'<div className="sessions-grid">','<label>History <select value={range} onChange={e => setRange(Number(e.target.value))}><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option><option value={0}>All time</option></select></label>\n      {days.length === 0 && <EmptyState title="No sessions in this period" sub="Choose a wider period or import replays." cta={{label:"Import replays",onClick:()=>navigate("/settings?section=replays")}} />}\n      <div className="sessions-grid">');return s;
});
