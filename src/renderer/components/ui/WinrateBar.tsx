interface WinrateBarProps {
  value: number;
  /**
   * Cut a notch at 50% so an even record reads without the number. For win
   * rates only: a share with no meaningful midpoint (practice progress) leaves it off.
   */
  marked?: boolean;
}

export function WinrateBar({ value, marked = false }: WinrateBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={marked ? "winrate-bar winrate-bar--marked" : "winrate-bar"}>
      <div className="winrate-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
