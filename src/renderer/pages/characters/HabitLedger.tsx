import "./HabitLedger.css";
import { useState } from "react";
import { Eye } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Pill, PillRow } from "../../components/ui/Pill";
import { useCharacterEventProfile } from "../../hooks/queries";
import type { HabitOptionAgg } from "../../../characterEventProfile";
import { EVENT_SAMPLE_GUARDS, HABIT_SITUATION_ORDER } from "../../../characterEventProfile";
import type { CharacterModuleProps } from "./shared";
import { accentVars, orderBy, pct, prettyLabel, ratio } from "./shared";

type HabitFilter = "all" | "cornered" | "pressured";

const FILTERS: Array<{ key: HabitFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "cornered", label: "Near the edge" },
  { key: "pressured", label: "Under pressure" },
];

interface OptionCounts {
  row: HabitOptionAgg;
  n: number;
  punished: number;
}

interface SituationSection {
  situation: string;
  total: number;
  options: OptionCounts[];
  /** Option key flagged as most scoutable in this situation, if any. */
  scoutable: string | null;
}

function countsFor(row: HabitOptionAgg, filter: HabitFilter): { n: number; punished: number } {
  if (filter === "cornered") return { n: row.cornered, punished: row.corneredPunished };
  if (filter === "pressured") return { n: row.pressured, punished: row.pressuredPunished };
  return { n: row.total, punished: row.punished };
}

function buildSections(habits: HabitOptionAgg[], filter: HabitFilter): SituationSection[] {
  const bySituation = new Map<string, OptionCounts[]>();
  for (const row of habits) {
    const { n, punished } = countsFor(row, filter);
    if (n <= 0) continue;
    const list = bySituation.get(row.situation) ?? [];
    list.push({ row, n, punished });
    bySituation.set(row.situation, list);
  }

  const sections: SituationSection[] = [];
  for (const [situation, unsorted] of bySituation) {
    const total = unsorted.reduce((sum, o) => sum + o.n, 0);
    if (total < EVENT_SAMPLE_GUARDS.habitSituationMin) continue;
    const options = [...unsorted].sort((a, b) => b.n - a.n);
    // Most scoutable: share > 40% AND punished rate > 50% with enough samples;
    // options are sorted by n desc, so the first hit is the highest-share one.
    let scoutable: string | null = null;
    for (const o of options) {
      if (o.n >= EVENT_SAMPLE_GUARDS.habitPunishedRateMin && o.n / total > 0.4 && o.punished / o.n > 0.5) {
        scoutable = o.row.option;
        break;
      }
    }
    sections.push({ situation, total, options, scoutable });
  }
  return orderBy(sections, (s) => s.situation, HABIT_SITUATION_ORDER);
}

export function HabitLedger({ character, color, glowColor }: CharacterModuleProps) {
  const [filter, setFilter] = useState<HabitFilter>("all");
  const { data: profile } = useCharacterEventProfile(character);

  if (!profile) return null;
  if (profile.habits.length === 0) return null;

  const allSections = buildSections(profile.habits, "all");
  if (allSections.length === 0) return null;

  const sections = filter === "all" ? allSections : buildSections(profile.habits, filter);

  return (
    <Card title="Repeated habits" className="habit-ledger" style={accentVars(color, glowColor)}>
      <PillRow className="habit-ledger-filters">
        {FILTERS.map((f) => (
          <Pill key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </Pill>
        ))}
      </PillRow>

      {sections.length === 0 ? (
        <div className="habit-ledger-empty-note">Not enough examples for this filter yet</div>
      ) : (
        sections.map((section) => (
          <div key={section.situation} className="habit-ledger-section">
            <div className="habit-ledger-section-header">
              <span className="habit-ledger-situation">{prettyLabel(section.situation)}</span>
              <span className="habit-ledger-section-n">{section.total} examples</span>
            </div>
            {section.options.map((o) => {
              const dimmed = o.n < EVENT_SAMPLE_GUARDS.habitOptionMin;
              const showRate = o.n >= EVENT_SAMPLE_GUARDS.habitPunishedRateMin;
              return (
                <div
                  key={o.row.option}
                  className={dimmed ? "habit-ledger-row habit-ledger-row-dim" : "habit-ledger-row"}
                >
                  <div className="habit-ledger-option">
                    <span className="habit-ledger-option-label" title={prettyLabel(o.row.option)}>
                      {prettyLabel(o.row.option)}
                    </span>
                    {section.scoutable === o.row.option && (
                      <span
                        className="habit-ledger-scoutable"
                        title="When you are in this situation you pick this option over 40% of the time and it gets punished over half the time"
                      >
                        <Eye size={11} aria-hidden="true" />
                        Easy to predict
                      </span>
                    )}
                  </div>
                  <div className="habit-ledger-bar-track">
                    <div
                      className="habit-ledger-bar-fill"
                      style={{ width: `${Math.min(100, (o.n / section.total) * 100)}%` }}
                    />
                  </div>
                  <span className="habit-ledger-share">
                    {pct(o.n, section.total)} <span className="habit-ledger-ratio">{ratio(o.n, section.total)}</span>
                  </span>
                  {showRate ? (
                    <span className="habit-ledger-punished" title={`punished ${ratio(o.punished, o.n)}`}>
                      {pct(o.punished, o.n)} punished
                    </span>
                  ) : (
                    <span className="habit-ledger-punished habit-ledger-punished-na" title="Not enough examples yet">
                      —
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}

      <div className="habit-ledger-caption">
        Share of each choice when you are in the situation, and how often that pick was punished.
      </div>
    </Card>
  );
}
