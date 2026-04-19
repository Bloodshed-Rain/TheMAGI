export function WinrateBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="winrate-bar">
      <div className="winrate-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
