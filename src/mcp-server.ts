import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  getDb,
  getOverallRecord,
  getMatchupRecords,
  getStageRecords,
  getRecentGames,
  getOpponentHistory,
  getLatestAnalysis,
  getStatTrend,
  detectSets,
} from "./db.js";
import { loadConfig } from "./config.js";
import { processGame } from "./pipeline/index.js";

// ── Helpers ─────────────────────────────────────────────────────────

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const };
}

function redactKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return "****";
  return "****" + key.slice(-4);
}

// ── Tool definitions ────────────────────────────────────────────────

const TOOLS = [
  {
    name: "magi_get_stats",
    description: "Get overall win/loss record from the MAGI database",
    inputSchema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "magi_get_matchups",
    description: "Get character matchup records. Optionally filter by player character.",
    inputSchema: {
      type: "object" as const,
      properties: {
        character: { type: "string", description: "Filter by player character name" },
      },
    },
  },
  {
    name: "magi_get_stages",
    description: "Get stage-specific win/loss records",
    inputSchema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "magi_get_recent_games",
    description: "Get recent game history with stats",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of recent games to return (default 20)" },
      },
    },
  },
  {
    name: "magi_get_opponents",
    description: "Get opponent history. Optionally filter by opponent name or connect code.",
    inputSchema: {
      type: "object" as const,
      properties: {
        search: { type: "string", description: "Filter by opponent name or connect code" },
      },
    },
  },
  {
    name: "magi_get_coaching",
    description: "Get latest coaching analysis from the database",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of analyses to return (default 1)" },
      },
    },
  },
  {
    name: "magi_get_trends",
    description:
      "Get stat trends over time. Valid stats: neutral_win_rate, conversion_rate, l_cancel_rate, recovery_success_rate, ledge_entropy, knockdown_entropy, power_shield_count, edgeguard_success_rate, wavedash_count, avg_damage_per_opening, avg_death_percent, total_damage_dealt",
    inputSchema: {
      type: "object" as const,
      properties: {
        stat: { type: "string", description: "Stat column name (e.g. neutral_win_rate, l_cancel_rate)" },
        limit: { type: "number", description: "Max number of data points" },
        character: { type: "string", description: "Filter by player character" },
        opponent_character: { type: "string", description: "Filter by opponent character" },
      },
      required: ["stat"],
    },
  },
  {
    name: "magi_analyze_replay",
    description:
      "Parse a .slp replay file and return structured game data (no LLM call). Returns full game summary and derived insights for Claude to interpret.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Absolute path to a .slp replay file" },
        target_player: { type: "string", description: "Player tag or connect code to focus analysis on" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "magi_get_sets",
    description: "Get detected tournament-style sets grouped by opponent and time proximity",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of recent sets to return (default 10)" },
      },
    },
  },
  {
    name: "magi_get_config",
    description: "Get current MAGI configuration (API keys are redacted)",
    inputSchema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "magi_db_query",
    description: "Run a read-only SQL SELECT query against the MAGI SQLite database. Only SELECT statements are allowed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sql: { type: "string", description: "SQL SELECT query" },
        params: {
          type: "array",
          items: { oneOf: [{ type: "string" }, { type: "number" }, { type: "null" }] },
          description: "Bind parameters for the query",
        },
      },
      required: ["sql"],
    },
  },
  {
    name: "magi_get_character_stats",
    description: "Get character-specific statistics including matchup records and stage records",
    inputSchema: {
      type: "object" as const,
      properties: {
        character: { type: "string", description: "Character name to get stats for" },
      },
      required: ["character"],
    },
  },
] as const;

// ── Tool handlers ───────────────────────────────────────────────────

type Args = Record<string, unknown>;

function handleTool(name: string, args: Args) {
  switch (name) {
    // 1. magi_get_stats
    case "magi_get_stats":
      return ok(getOverallRecord());

    // 2. magi_get_matchups
    case "magi_get_matchups":
      return ok(getMatchupRecords(args.character as string | undefined));

    // 3. magi_get_stages
    case "magi_get_stages":
      return ok(getStageRecords());

    // 4. magi_get_recent_games
    case "magi_get_recent_games": {
      const limit = typeof args.limit === "number" ? args.limit : 20;
      return ok(getRecentGames(limit));
    }

    // 5. magi_get_opponents
    case "magi_get_opponents":
      return ok(getOpponentHistory(args.search as string | undefined));

    // 6. magi_get_coaching
    case "magi_get_coaching": {
      const limit = typeof args.limit === "number" ? args.limit : 1;
      return ok(getLatestAnalysis(limit));
    }

    // 7. magi_get_trends
    case "magi_get_trends": {
      const stat = args.stat as string;
      const opts: { character?: string; opponentCharacter?: string; stage?: string; limit?: number } = {};
      if (typeof args.character === "string") opts.character = args.character;
      if (typeof args.opponent_character === "string") opts.opponentCharacter = args.opponent_character;
      if (typeof args.limit === "number") opts.limit = args.limit;
      return ok(getStatTrend(stat, opts));
    }

    // 8. magi_analyze_replay
    case "magi_analyze_replay": {
      const filePath = args.file_path as string;
      const result = processGame(filePath, 1);
      return ok(result);
    }

    // 9. magi_get_sets
    case "magi_get_sets": {
      const limit = typeof args.limit === "number" ? args.limit : 10;
      const sets = detectSets();
      const recent = sets.slice(-limit).reverse();
      return ok(recent);
    }

    // 10. magi_get_config
    case "magi_get_config": {
      const config = loadConfig();
      const redacted = {
        ...config,
        openrouterApiKey: redactKey(config.openrouterApiKey),
        geminiApiKey: redactKey(config.geminiApiKey),
        anthropicApiKey: redactKey(config.anthropicApiKey),
        openaiApiKey: "(managed by MAGI proxy)",
      };
      return ok(redacted);
    }

    // 11. magi_db_query
    case "magi_db_query": {
      const sql = (args.sql as string).trim();
      if (!/^select\b/i.test(sql)) {
        return err("Only SELECT queries are allowed. Query must start with SELECT.");
      }
      if (/;\s*(insert|update|delete|drop|alter|create|attach|detach|pragma)\b/i.test(sql)) {
        return err("Multi-statement or write queries are not allowed.");
      }
      const params = (args.params as (string | number | null)[] | undefined) ?? [];
      const db = getDb();
      const rows = db.prepare(sql).all(...params);
      return ok(rows);
    }

    // 12. magi_get_character_stats
    case "magi_get_character_stats": {
      const character = args.character as string;
      const matchups = getMatchupRecords(character);
      const stages = getDb()
        .prepare(
          `SELECT
            g.stage,
            SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN g.result = 'loss' THEN 1 ELSE 0 END) as losses,
            COUNT(*) as totalGames,
            ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate
          FROM games g
          WHERE g.player_character = ?
          GROUP BY g.stage
          ORDER BY totalGames DESC`,
        )
        .all(character);

      const overall = getDb()
        .prepare(
          `SELECT
            SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
            COUNT(*) as totalGames
          FROM games
          WHERE player_character = ?`,
        )
        .get(character);

      return ok({ character, overall, matchups, stages });
    }

    default:
      return err(`Unknown tool: ${name}`);
  }
}

// ── Server setup ────────────────────────────────────────────────────

const server = new Server(
  { name: "magi-melee", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: [...TOOLS] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    return handleTool(name, (args ?? {}) as Args);
  } catch (e) {
    return err(e);
  }
});

// ── Start ───────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e: unknown) => {
  console.error("MAGI MCP server failed to start:", e);
  process.exit(1);
});
