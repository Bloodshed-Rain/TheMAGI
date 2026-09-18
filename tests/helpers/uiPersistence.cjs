// Exercise the real database adapter with Electron's matching native SQLite binary.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'magi-ui-persistence-'));
os.homedir = () => scratch;
require('tsx/cjs');
const db = require('../../src/db.ts');
try {
  for (let i=0;i<245;i++) db.createTrainingLogEntry({activityType:'Tech skill',minutes:10,focus:`Block ${i}`});
  const pages = Array.from({length:13},(_,page)=>db.listTrainingLogEntries(20,page*20));
  const ids = pages.flat().map(entry=>entry.id);
  assert.equal(ids.length,245);
  assert.equal(new Set(ids).size,245);
  assert.equal(pages[12].length,5);
  assert.equal(db.listTrainingLogEntries(20,-10)[0].id,pages[0][0].id);
  const raw = db.getDb();
  const insert = raw.prepare(`INSERT INTO games (replay_path,replay_hash,played_at,stage,duration_seconds,player_character,opponent_character,player_tag,opponent_tag,result,end_method,player_final_stocks,player_final_percent,opponent_final_stocks,opponent_final_percent) VALUES ('test.slp',?,?, 'Battlefield',180,'Marth','Fox','Test','Opponent','draw','timeout',1,100,1,100)`);
  insert.run('old','2001-01-01T12:00:00Z'); insert.run('new',new Date().toISOString());
  assert.equal(db.getSessionsByDay(0).reduce((sum,day)=>sum+day.games,0),2);
  assert.equal(db.getSessionsByDay(90).reduce((sum,day)=>sum+day.games,0),1);
  const baseline = JSON.stringify({sampleGames:20,latestReplayId:2,evidenceReplayId:1,metrics:[]});
  const plan = db.insertPracticePlan('Evidence plan','A specific weakness',[{name:'Drill',target:'Ten repetitions'}],baseline);
  db.closeDb();
  const saved = db.listPracticePlans().find(p=>p.id===plan.id);
  assert.equal(saved.baselineJson,baseline);
  assert.equal(saved.drills.length,1);
  assert.equal(db.getDb().prepare('SELECT version FROM schema_version').get().version,15);
  process.stdout.write('Persistence checks passed');
} finally {
  db.closeDb();
  if (path.dirname(scratch)!==os.tmpdir() || !path.basename(scratch).startsWith('magi-ui-persistence-')) throw new Error('Unexpected temporary directory');
  fs.rmSync(scratch,{recursive:true,force:true});
}
