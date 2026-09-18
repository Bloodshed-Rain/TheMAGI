const fs=require('fs'); function edit(p,f){fs.writeFileSync(p,f(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')))}function rep(s,a,b){if(!s.includes(a))throw Error('Missing '+a.slice(0,80));return s.replace(a,b)}
edit('src/renderer/components/LiquidShell.tsx',s=>{
s=rep(s,'useMemo, useState','useMemo, useState, useRef');s='import { useDialog } from "../hooks/useDialog";\n'+s;
s=rep(s,'const [clock, setClock]','const startRef = useRef<HTMLDivElement>(null);\n  useDialog(startRef, startMenuOpen, () => setStartMenuOpen(false), undefined, false);\n  useEffect(() => { setWindowsMinimized(false); setStartMenuOpen(false); }, [location.pathname, location.search]);\n  useEffect(() => { const restore = () => setWindowsMinimized(false); window.addEventListener("magi:restore", restore); return () => window.removeEventListener("magi:restore", restore); }, []);\n  useEffect(() => { if (!startMenuOpen) return; const dismiss = (e: PointerEvent) => { if (!startRef.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest(".windows-start-button")) setStartMenuOpen(false); }; document.addEventListener("pointerdown", dismiss); return () => document.removeEventListener("pointerdown", dismiss); }, [startMenuOpen]);\n  const [clock, setClock]');
s=rep(s,'{!windowsMinimized && (','{(');s=rep(s,'<motion.main\n','<motion.main\n              hidden={windowsMinimized}\n              inert={windowsMinimized}\n');
s=rep(s,'onClick={() => setWindowsMinimized(true)}','onClick={() => { setWindowsMinimized(true); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".windows-task-button.active")?.focus()); }}');
s=s.replace(/\s*<button type="button" onClick=\{\(\) => setWindowsMinimized\(true\)\} aria-label="Close window">[\s\S]*?<\/button>/,'');
s=s.replace(/\s*<div className="windows-menu-strip"[\s\S]*?<\/div>/,'');
s=s.replaceAll('key={location.pathname}','');
s=rep(s,'className="windows-start-menu" role="menu"','ref={startRef} className="windows-start-menu" role="dialog"');s=s.replaceAll('role="menuitem"','');
s=rep(s,'<div className="nav-section-label">Analyze</div>\n        {analyzeItems.map(renderItem)}','{[{label:"Overview",ids:["dashboard"]},{label:"Review",ids:["library","sessions","characters","rivals"]},{label:"Improve",ids:["performance","trends","practice"]},{label:"Coaching",ids:["cornerman","oracle"]}].map(group => <div key={group.label}><div className="nav-section-label">{group.label}</div>{analyzeItems.filter(item => group.ids.includes(item.id)).map(renderItem)}</div>)}'); return s;
});
edit('src/renderer/App.tsx',s=>{const i=s.indexOf('const navigateTo');return s.slice(0,i)+s.slice(i).replace('navigate(', 'window.dispatchEvent(new CustomEvent("magi:restore"));\n      navigate(');});
for(const name of ['Library','Rivals']) edit(`src/renderer/pages/${name}.tsx`,s=>{
s='import { useViewState } from "../hooks/useViewState";\n'+s;s=rep(s,'useMemo, useState','useMemo, useRef');
s=s.replace(/const \[(\w+), (\w+)\] = useState(<[^;]+?>)?\(([^;]*?)\);/g,(_,v,set,t,init)=>`const [${v}, ${set}] = useViewState${t||''}("${name.toLowerCase()}-${v}", ${init});`);
const deps=name==='Library'?'deferredSearch, char, stage, result':'deferredSearch, sort, filter';
s=rep(s,`useEffect(() => {\n    setPage(0);\n  }, [${deps}]);`,`const filterKey = JSON.stringify([${deps}]);\n  const previousFilters = useRef(filterKey);\n  useEffect(() => {\n    if (previousFilters.current !== filterKey) setPage(0);\n    previousFilters.current = filterKey;\n  }, [filterKey, setPage]);`);
s=rep(s,'if (page > 0 && page >= pageCount)','if (!isLoading && !isFetching && !isError && page > 0 && page >= pageCount)');s=rep(s,'}, [page, pageCount]);','}, [page, pageCount, isLoading, isFetching, isError, setPage]);');
if(name==='Library'){
s=rep(s,'<select\n              value={char}','<select\n              aria-label="Matchup"\n              value={char}');s=rep(s,'<select\n              value={stage}','<select\n              aria-label="Stage"\n              value={stage}');
s=rep(s,'className="kpi-grid" style={{ marginBottom: 12 }}','className="audit-summary-strip"');
s=rep(s,'<DataTable\n','<DataTable\n          className="identity-table library-table"\n');s=rep(s,') : total === 0 && !filtersActive ?',') : isError ? <tr><td colSpan={columnCount}>Games unavailable. Use Retry above.</td></tr> : total === 0 && !filtersActive ?');
s=s.replaceAll('navigate("/settings")','navigate("/settings?section=replays")');
}else{
s=rep(s,'{ useNavigate }','{ useNavigate, useSearchParams }');s=rep(s,'const navigate = useNavigate();','const navigate = useNavigate();\n  const [params, setParams] = useSearchParams();');
s=rep(s,'const [sort, setSort]','useEffect(() => { const key = params.get("opponent"); if (key) setSelected(key); }, [params, setSelected]);\n  const [sort, setSort]');
s=rep(s,'onBack={() => setSelected(null)}','onBack={() => { setSelected(null); setParams({}, { replace: true }); }}');
s=rep(s,'isFetching, isError }','isFetching, isError, refetch }');s=rep(s,'data: rawDetail, isLoading, isError }','data: rawDetail, isLoading, isError, refetch }');
s=rep(s,'const recentWins =','const recentLosses = recentGames.filter(game => game.result === "loss").length;\n  const recentDraws = recentGames.length - recentLosses - recentGames.filter(game => game.result === "win").length;\n  const recentWins =');
s=rep(s,'{recentWins}W-{recentGames.length - recentWins}L','{recentWins}W-{recentLosses}L{recentDraws > 0 ? `-${recentDraws}D` : ""}');
s=rep(s,'[...(detail.stageBreakdown ?? [])].sort','[...(detail.stageBreakdown ?? [])].filter(stage => stage.totalGames >= 5).sort');
s=rep(s,'Best current stage:','Highest observed win rate (at least 5 games):');s=rep(s,'{pct(bestStage.winRate)}.','{pct(bestStage.winRate)} across {bestStage.totalGames} games.');
s=s.replace(/<select\b/g,'<select aria-label="Sort rivals"');
s=s.replace(/(<div className="sessions-error"[^>]*>)([^<]+)/g,'$1$2<button className="btn" onClick={() => void refetch()}>Retry</button>');
}return s;
});
for(const name of ['CoachingModal','CoachingPanel'])edit(`src/renderer/components/${name}.tsx`,s=>{
s='import { useFollowOutput } from "../hooks/useFollowOutput";\n'+s;s=s.replace(', useReducedMotion','').replace('import { useReducedMotion } from "framer-motion";\n','').replace('  const reduceMotion = useReducedMotion();\n','');
s=rep(s,'const bodyRef = useRef<HTMLDivElement>(null);','const bodyRef = useRef<HTMLDivElement>(null);\n  const { unread, resume } = useFollowOutput(bodyRef, analysis);');
s=s.replace(/  \/\/ Autoscroll the body[\s\S]*?\}, \[analysis, loading, reduceMotion\]\);/,'');
if(name==='CoachingModal'){
s='import { useDialog } from "../hooks/useDialog";\n'+s;s=s.replace(/  \/\/ Close on Escape[\s\S]*?\}, \[isOpen\]\);/,'  useDialog(panelRef, isOpen, onClose, closeRef, !isReplayOpen);');
}else{s=rep(s,'{error && <div className="coaching-error">{error}</div>}','{error && <div className="coaching-error" role="alert">{error}<button className="btn" onClick={runAnalysis}>Retry</button></div>}');}
s=rep(s,'<div ref={bodyRef}','{unread && <button className="btn" onClick={resume}>New response · Jump to latest</button>}\n      <div ref={bodyRef}');return s;
});
edit('src/renderer/pages/Trends.tsx',s=>{
s='import { LoadError } from "../components/ui/LoadError";\n'+s;s=rep(s,'domain: [0, 100],','');s=rep(s,'isLoading: optionsLoading }','isLoading: optionsLoading, isError: optionsError, refetch: retryOptions }');s=rep(s,'    isError,\n','    isError,\n    refetch,\n');
s=rep(s,'  if (totalGames === 0)','  if (optionsError) return <LoadError message="Trend filters could not load." onRetry={() => void retryOptions()} />;\n\n  if (totalGames === 0)');
s=rep(s,'// y-axis tick labels (top → bottom) when the metric has a fixed domain.','const chartDomain: [number, number] = current.domain ?? [Math.min(0, ...smoothed), Math.max(1, ...smoothed) * 1.05];\n  // Axis labels use the same domain as the plot.');
s=rep(s,'const yTicks = current.domain\n    ? [current.domain[1], (current.domain[0] + current.domain[1]) / 2, current.domain[0]].map((v) => current.fmt(v))\n    : null;','const yTicks = [chartDomain[1], (chartDomain[0] + chartDomain[1]) / 2, chartDomain[0]].map(current.fmt);');
s=rep(s,'{...(current.domain ? { domain: current.domain } : {})}','domain={chartDomain}\n                  label={`${current.label}: ${series.length} games, five-game rolling average`}');
s=rep(s,'Couldn&apos;t load trend data. Try again.','<LoadError message="Trend data could not load." onRetry={() => void refetch()} />');
s=rep(s,'<div className="trends-grid">','<p className="audit-sample-note">Points are equally spaced by game, not elapsed time. Change compares the mean rolling average in the later half with the earlier half of this filtered sample.</p>\n      <details><summary>View {current.label} data</summary><div className="audit-data-scroll"><table><thead><tr><th>Game date</th><th>Value</th><th>Rolling average</th></tr></thead><tbody>{series.map((point, index) => <tr key={index}><td>{new Date(point.playedAt).toLocaleString()}</td><td>{current.fmt(point.value)}</td><td>{current.fmt(smoothed[index]!)}</td></tr>)}</tbody></table></div></details>\n      <div className="trends-grid">');return s;
});
edit('src/renderer/components/ui/Sparkline.tsx',s=>{s=rep(s,'values: number[];','values: number[];\n  label?: string;');s=rep(s,'  values,','  values,\n  label = "Trend",');s=rep(s,'<svg\n','<svg\n      role="img"\n      aria-label={`${label}. ${values.length} points; first ${values[0]?.toFixed(2)}, last ${values.at(-1)?.toFixed(2)}.`}\n');return s;});
