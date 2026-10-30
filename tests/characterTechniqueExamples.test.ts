import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readCharacterTechniqueExamples } from "../src/characterTechniqueReplayQuery";
import { validateTechniqueKey } from "../src/characterTechniqueExamples";

describe("character replay examples", () => {
  it("rejects invalid stat keys before constructing a query", () => {
    for (const key of ["x') OR 1=1 --", "a.b", "", null]) expect(() => validateTechniqueKey(key)).toThrow();
    expect(validateTechniqueKey("kenCombos")).toBe("kenCombos");
  });
  it("filters by your character and count, and keeps saved clips separate from game counts", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`CREATE TABLE games(id INTEGER PRIMARY KEY,replay_path TEXT,opponent_tag TEXT,opponent_character TEXT,player_character TEXT,played_at TEXT);
      CREATE TABLE character_signature_stats(game_id INTEGER,signature_json TEXT);
      CREATE TABLE conversions(id INTEGER, game_id INTEGER, attacker_is_player INTEGER,start_frame INTEGER,end_frame INTEGER,moves_json TEXT,did_kill INTEGER);
      CREATE TABLE highlights(id INTEGER,game_id INTEGER,character TEXT,type TEXT,start_frame INTEGER,timestamp TEXT);
      INSERT INTO games VALUES(1,'/missing/game.slp','One','Fox','Marth','2026-01-01'),(2,'/missing/game2.slp','Two','Marth','Fox','2026-01-02'),(3,'/missing/game3.slp','Three','Fox','Marth','2026-01-03');
      INSERT INTO character_signature_stats VALUES(1,'{"kenCombos":3,"chainGrabs":2}'),(2,'{"kenCombos":9}'),(3,'{"kenCombos":0}');
      INSERT INTO conversions VALUES(11,1,1,600,750,'[{"frame":600,"moveId":14},{"frame":630,"moveId":14},{"frame":660,"moveId":17}]',1);
      INSERT INTO highlights VALUES(1,1,'Marth','ken-combo',600,'0:10'),(2,1,'Fox','ken-combo',700,'0:11'),(3,1,'Marth','big-combo',800,'0:13');`);
      const rows = readCharacterTechniqueExamples(db, "Marth", "kenCombos");
      expect(rows).toHaveLength(1);
      expect(rows[0]!.count).toBe(3);
      expect(rows[0]!.moments).toHaveLength(1);
      expect(rows[0]!.moments[0]!.startFrame).toBe(540);
      expect(rows[0]!.replayAvailable).toBe(false);
      expect(readCharacterTechniqueExamples(db, "Marth", "chainGrabs")[0]!.moments).toEqual([]);
      expect(readCharacterTechniqueExamples(db, "Marth", "neverRecorded")).toEqual([]);
    } finally {
      db.close();
    }
  });
});
