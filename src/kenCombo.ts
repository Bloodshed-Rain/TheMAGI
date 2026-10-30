/** Project invariant: the final three hit records are FAIR, FAIR, DAIR,
 * and that final DAIR takes the stock. Shared by every detection surface. */
export function isKenCombo(moves: readonly { moveId: number }[], didKill: boolean): boolean {
  return (
    didKill === true &&
    moves.length >= 3 &&
    moves.at(-3)?.moveId === 14 &&
    moves.at(-2)?.moveId === 14 &&
    moves.at(-1)?.moveId === 17
  );
}
/** Same invariant for persisted conversion records. Alias must be a trusted SQL alias. */
export function kenComboSql(alias = "c"): string {
  if (!/^[a-z]+$/i.test(alias)) throw new Error("Invalid SQL alias");
  return `${alias}.did_kill = 1 AND json_array_length(${alias}.moves_json) >= 3
    AND json_extract(${alias}.moves_json, '$[#-3].moveId') = 14
    AND json_extract(${alias}.moves_json, '$[#-2].moveId') = 14
    AND json_extract(${alias}.moves_json, '$[#-1].moveId') = 17`;
}
export const REPAIR_KEN_COMBOS_SQL = `
  UPDATE character_signature_stats AS css SET signature_json = json_set(
    json_remove(css.signature_json, '$.kenComboKills'), '$.kenCombos',
    (SELECT COUNT(*) FROM conversions c WHERE c.game_id = css.game_id AND c.attacker_is_player = 1 AND ${kenComboSql()}))
  WHERE css.game_id IN (SELECT id FROM games WHERE player_character = 'Marth');
  DELETE FROM highlights WHERE type = 'ken-combo' AND NOT EXISTS (
    SELECT 1 FROM conversions c JOIN games g ON g.id = c.game_id
    WHERE c.game_id = highlights.game_id AND c.start_frame = highlights.start_frame
      AND c.attacker_is_player = 1 AND g.player_character = 'Marth' AND highlights.character = 'Marth' AND ${kenComboSql()});
  UPDATE highlights SET label = 'Shine → Up Smash', description = 'Shine followed by up smash; wavedash inputs are not verified.' WHERE type = 'waveshine-upsmash';
  DELETE FROM coaching_analyses WHERE scope IN ('character', 'character-blurb', 'character-blurb-plain-v1') AND scope_identifier = 'Marth';
`;
