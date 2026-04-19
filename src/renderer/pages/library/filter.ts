export interface LibraryGame {
  id: number;
  opponentTag: string;
  opponentCharacter: string;
  stage: string;
  result: "win" | "loss";
  [k: string]: unknown;
}

export interface LibraryFilters {
  search: string;
  char: "all" | string;
  stage: "all" | string;
  result: "all" | "win" | "loss";
}

export function filterGames<G extends LibraryGame>(games: G[], f: LibraryFilters): G[] {
  const needle = f.search.trim().toLowerCase();
  return games.filter((g) => {
    if (f.char !== "all" && g.opponentCharacter !== f.char) return false;
    if (f.stage !== "all" && g.stage !== f.stage) return false;
    if (f.result !== "all" && g.result !== f.result) return false;
    if (needle && !g.opponentTag.toLowerCase().includes(needle)) return false;
    return true;
  });
}
