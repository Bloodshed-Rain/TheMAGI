import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { ConversionType, FramesType } from "@slippi/slippi-js/node";
import { isKenCombo, kenComboSql, REPAIR_KEN_COMBOS_SQL } from "../src/kenCombo";
import { detectKenCombos } from "../src/pipeline/playerSummary";
import { detectHighlights } from "../src/pipeline/highlights";
import type { GameSummary } from "../src/pipeline/types";
import { detectLiveConversionEvents } from "../src/cornermanLiveEvents";
import { techniqueActionRange } from "../src/techniqueClips";
import { withMeleeAccuracy } from "../src/meleeAccuracy";

const cases = [
  { name: "FAIR FAIR DAIR kill", ids: [14, 14, 17], kill: true, valid: true },
  { name: "nonlethal FAIR FAIR DAIR", ids: [14, 14, 17], kill: false, valid: false },
  { name: "single FAIR DAIR kill", ids: [14, 17], kill: true, valid: false },
  { name: "DAIR without preceding FAIRs", ids: [17], kill: true, valid: false },
  { name: "a different killing move", ids: [14, 14, 17, 11], kill: true, valid: false },
  { name: "an interrupted finisher", ids: [14, 15, 14, 17], kill: true, valid: false },
  { name: "an extra hit before the strict finisher", ids: [8, 14, 14, 17], kill: true, valid: true },
];
function conversion(ids: number[], kill: boolean): ConversionType {
  return {
    playerIndex: 1,
    startFrame: 100,
    endFrame: 300,
    startPercent: 30,
    currentPercent: 70,
    endPercent: 70,
    didKill: kill,
    openingType: "neutral-win",
    moves: ids.map((moveId, i) => ({ moveId, frame: 120 + i * 30, playerIndex: 0, hitCount: 1, damage: 10 })),
  };
}
const players = [
  { playerIndex: 0, tag: "You", connectCode: "YOU#1", character: "Marth", isTarget: true },
  { playerIndex: 1, tag: "Other", connectCode: "OTH#1", character: "Fox", isTarget: false },
];
const summary = {
  players: [
    { character: "Marth", tag: "You" },
    { character: "Fox", tag: "Other" },
  ],
  result: { winner: "Other", finalStocks: [0, 2], finalPercents: [0, 0] },
} as unknown as GameSummary;
describe("mandatory Ken Combo invariant", () => {
  for (const c of cases)
    it(c.name, () => {
      const conv = conversion(c.ids, c.kill);
      expect(isKenCombo(conv.moves, conv.didKill)).toBe(c.valid);
      expect((detectKenCombos(9, [conv])?.total ?? 0) > 0).toBe(c.valid);
      expect(detectKenCombos(2, [conv])).toBeNull();
      expect(!!techniqueActionRange("kenCombos", conv.moves, conv.didKill)).toBe(c.valid);
      expect(detectHighlights(summary, [conv], {} as FramesType, 31, 0).some((h) => h.type === "ken-combo")).toBe(
        c.valid,
      );
      expect(
        detectLiveConversionEvents({ conversions: [conv], players, seenKeys: new Set() }).some(
          (e) => e.type === "ken-combo",
        ),
      ).toBe(c.valid);
    });
  it("uses the same exact rule in SQL and repairs old counts and highlights", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`CREATE TABLE games(id INTEGER PRIMARY KEY,player_character TEXT);
   CREATE TABLE conversions(id INTEGER,game_id INTEGER,attacker_is_player INTEGER,start_frame INTEGER,did_kill INTEGER,moves_json TEXT);
   CREATE TABLE character_signature_stats(game_id INTEGER,signature_json TEXT);
   CREATE TABLE highlights(game_id INTEGER,start_frame INTEGER,type TEXT,character TEXT,label TEXT,description TEXT);
   CREATE TABLE coaching_analyses(scope TEXT,scope_identifier TEXT);
   INSERT INTO games VALUES(1,'Marth');
   INSERT INTO character_signature_stats VALUES(1,'{"character":"Marth","kenCombos":50,"kenComboKills":12}');
   INSERT INTO coaching_analyses VALUES('character','Marth'),('character','Fox');`);
      cases.forEach((c, i) => {
        db.prepare("INSERT INTO conversions VALUES(?,1,1,?,?,?)").run(
          i,
          i * 300,
          Number(c.kill),
          JSON.stringify(conversion(c.ids, c.kill).moves),
        );
        db.prepare("INSERT INTO highlights VALUES(1,?,'ken-combo','Marth','Ken Combo','old')").run(i * 300);
        expect(db.prepare(`SELECT COUNT(*) as n FROM conversions c WHERE c.id=? AND ${kenComboSql()}`).get(i)?.n).toBe(
          Number(c.valid),
        );
      });
      db.exec(REPAIR_KEN_COMBOS_SQL);
      const stats = JSON.parse(
        String(db.prepare("SELECT signature_json FROM character_signature_stats").get()?.signature_json),
      );
      expect(stats.kenCombos).toBe(2);
      expect(stats).not.toHaveProperty("kenComboKills");
      expect(db.prepare("SELECT COUNT(*) as n FROM highlights").get()?.n).toBe(2);
      expect(db.prepare("SELECT scope_identifier FROM coaching_analyses").all()).toEqual([{ scope_identifier: "Fox" }]);
      db.exec(REPAIR_KEN_COMBOS_SQL);
      expect(db.prepare("SELECT COUNT(*) as n FROM highlights").get()?.n).toBe(2);
    } finally {
      db.close();
    }
  });
  it("requires technical accuracy for every coaching request", () => {
    expect(withMeleeAccuracy("coaching")).toContain("every Melee mechanic");
    expect(withMeleeAccuracy("coaching")).toContain("FAIR → FAIR → DAIR");
  });
});
