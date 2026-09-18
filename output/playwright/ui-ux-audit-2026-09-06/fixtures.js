(() => {
  const q = new URLSearchParams(location.search);
  const scene = q.get('auditScene') || 'populated';
  const empty = scene === 'empty';
  const config = { targetPlayer: empty ? null : 'AuditPlayer', connectCode: empty ? null : 'TEST#123', replayFolder: empty ? null : 'C:/AuditFixtures/Replays', colorMode: q.get('auditTheme') || 'liquid', activeProvider: 'local', modelByProvider: {}, apiKeys: {}, density: 'comfortable' };
  const games = empty ? [] : Array.from({length: 20}, (_, i) => ({ id: i + 1, playedAt: new Date(Date.UTC(2026,8,6,18-i)).toISOString(), stage: i % 2 ? 'Battlefield' : 'Final Destination', playerCharacter: 'Marth', opponentCharacter: i % 2 ? 'Falco' : 'Fox', opponentTag: i % 2 ? 'FalcoPractice' : 'FoxPractice', result: i === 0 ? 'draw' : i % 3 ? 'win' : 'loss', playerFinalStocks: i % 3 ? 2 : 0, opponentFinalStocks: i % 3 ? 0 : 1, neutralWinRate: .48 + i * .003, lCancelRate: .8, conversionRate: .42, avgDamagePerOpening: 34 + i * .2, replayPath: 'C:/AuditFixtures/game.slp', duration: 180, durationFrames: 10800, eventMatches: [] }));
  const trends = { neutralWinRate: .04, lCancelRate: -.02, conversionRate: .03, avgDamagePerOpening: 3, openingsPerKill: -.3, edgeguardSuccessRate: .02 };
  const logs = []; const oracleMessages = []; const listeners = new Set(); const oracleRequests = new Map();
  const metrics = [['neutralWinRate', 'Neutral win rate', .52, .48], ['lCancelRate', 'L-cancel rate', .8, .82], ['avgDamagePerOpening', 'Damage per opening', 36, 33], ['avgDeathPercent', 'Average death percent', 136, 121]].map(([key,label,current,baseline]) => ({ key,label,current,baseline,delta:current-baseline,winValue:current,lossValue:baseline,higherIsBetter:true }));
  const api = {
    getWatcherStatus: async () => false,
    onOracleStream: callback => { listeners.add(callback); return () => listeners.delete(callback); },
    oracleCancel: async id => { oracleRequests.get(id)?.abort(); return true; },
    oracleAsk: async (text, requestId) => { const controller = new AbortController(); oracleRequests.set(requestId,controller); try { for (const chunk of ['A specific ', 'coaching response ', 'based on your question.']) { await new Promise((resolve,reject) => { const timer=setTimeout(resolve,650); controller.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('Stopped'));},{once:true}); }); for(const listener of listeners) listener({requestId,chunk,status:'Responding'}); } const result={user:{id:oracleMessages.length+1,role:'user',content:text,createdAt:new Date().toISOString()},assistant:{id:oracleMessages.length+2,role:'assistant',content:'A specific coaching response based on your question.',createdAt:new Date().toISOString()}}; oracleMessages.push(result.user,result.assistant);return result; } finally{oracleRequests.delete(requestId);} },
    oracleClear: async () => {oracleMessages.length=0;return true;},
    loadConfig: async () => ({ ...config }),
    saveConfig: async patch => { if (scene === 'save-error') throw new Error('Audit fixture: settings could not be saved.'); Object.assign(config, patch); return {...config}; },
    getOverallRecord: async () => ({ totalGames: games.length, wins: 13, losses: 6, draws: 1 }),
    getRecentGames: async n => { if(scene === 'load-error') throw new Error('Audit fixture: database unavailable.'); return games.slice(0,n); },
    getDashboardHighlights: async () => ({ streak: 2, trends, bestMatchup:null, worstMatchup:null, totalGames: games.length }),
    getLibraryGames: async filters => { const selected = games.filter(g => (filters.result === 'all' || filters.result === g.result) && (!filters.search || `${g.opponentTag} ${g.opponentCharacter} ${g.stage}`.toLowerCase().includes(filters.search.toLowerCase()))); return { games: selected.slice(filters.offset,filters.offset+filters.limit),total:selected.length,totalUnfiltered:games.length,wins:selected.filter(g=>g.result==='win').length,losses:selected.filter(g=>g.result==='loss').length,uniqueOpponents:empty?0:2,charactersPlayed:empty?0:1,characters:['Marth','Fox','Falco'],stages:['Battlefield','Final Destination'] }; },
    getTrendSeriesBundle: async () => Object.fromEntries(['neutralWinRate','lCancelRate','conversionRate','avgDamagePerOpening','openingsPerKill','avgDeathPercent'].map(key => [key, games.map((g,i) => ({playedAt:g.playedAt,value:key==='avgDeathPercent'?110+i*3:key==='avgDamagePerOpening'?32+i:key==='openingsPerKill'?4+i*.1:.4+i*.01}))])),
    getPerformanceHub: async () => ({sample:{gamesScanned:games.length,currentGames:20,baselineGames:20}, metrics,insights:[],reviewQueue:[]}),
    getTrainingLog: async () => [...logs],
    createTrainingLog: async entry => { await new Promise(r=>setTimeout(r,150)); const saved={...entry,id:logs.length+1,loggedAt:new Date().toISOString()}; logs.push(saved); return saved; },
    getSessionsByDay: async () => empty?[]:[{ date:'2026-09-06',games:games.length,wins:13,losses:6,draws:1,opponents:['FoxPractice','FalcoPractice'],gameIds:games.map(g=>g.id),gameResults:games.map(g=>({id:g.id,result:g.result})) }],
    getLLMModels: async () => [], getCurrentModel: async () => ({ modelId:'local',label:'Local model' }),
    getQueueStatus: async () => ({pending:0,processing:false}),
    cornermanStatus: async () => ({active:false,gamesCount:0,wins:0,losses:0,opponentTag:null}),
    openFolder: async () => null,
    getGameDetail: async () => null,
    getStockTimeline: async () => null,
  };
  for(const name of ['getRecentHighlights','getGameHighlights','getLatestAnalysis','getAnalysisHistory','getOpponents','getSets','getCharacterList','getMatchupRecords','getStageRecords','listPracticePlans','getGameReviewNotes']) api[name] = async () => [];
  api.oracleListMessages = async () => [...oracleMessages];
  window.clippi = new Proxy(api, { get(target,key) { if(key in target) return target[key]; if(String(key).startsWith('on')) return () => () => {}; return async () => { throw new Error(`Audit fixture: ${String(key)} is not connected.`); }; } });
})();
