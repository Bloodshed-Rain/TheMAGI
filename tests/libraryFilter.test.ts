import { describe, it, expect } from "vitest";
import { filterGames, LibraryFilters, LibraryGame } from "../src/renderer/pages/library/filter";

const G = (partial: Partial<LibraryGame>): LibraryGame =>
  ({
    id: 1,
    opponentTag: "MANG0",
    opponentCharacter: "Falco",
    stage: "Battlefield",
    result: "win",
    ...partial,
  }) as LibraryGame;

describe("filterGames", () => {
  const games = [
    G({ id: 1, opponentTag: "MANG0", opponentCharacter: "Falco", stage: "Battlefield", result: "win" }),
    G({ id: 2, opponentTag: "ZAIN", opponentCharacter: "Marth", stage: "Yoshi's Story", result: "loss" }),
    G({ id: 3, opponentTag: "mang0", opponentCharacter: "Fox", stage: "Dream Land", result: "win" }),
  ];

  const base: LibraryFilters = { search: "", char: "all", stage: "all", result: "all" };

  it("returns all games when filters are default", () => {
    expect(filterGames(games, base).map((g) => g.id)).toEqual([1, 2, 3]);
  });

  it("matches opponent search case-insensitively", () => {
    expect(filterGames(games, { ...base, search: "mang0" }).map((g) => g.id)).toEqual([1, 3]);
  });

  it("filters by opponent character", () => {
    expect(filterGames(games, { ...base, char: "Marth" }).map((g) => g.id)).toEqual([2]);
  });

  it("filters by stage", () => {
    expect(filterGames(games, { ...base, stage: "Dream Land" }).map((g) => g.id)).toEqual([3]);
  });

  it("filters by result", () => {
    expect(filterGames(games, { ...base, result: "loss" }).map((g) => g.id)).toEqual([2]);
  });

  it("combines filters", () => {
    expect(filterGames(games, { ...base, search: "mang", result: "win" }).map((g) => g.id)).toEqual([1, 3]);
  });
});
