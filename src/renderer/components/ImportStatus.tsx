import { useImportStore } from "../stores/useImportStore";

export function ImportStatus() {
  const { busy, message, progress, errors, failed } = useImportStore();
  if (!message) return null;
  return <div className="operation-status" aria-live="polite" role={failed ? "alert" : "status"}>
    <div>{busy && progress ? `${progress.current}/${progress.total} files · ${progress.importedSoFar} imported · ${progress.skippedSoFar} skipped · ${progress.errorsSoFar} failed` : message}</div>
    {busy && <progress aria-label="Replay import progress" max={progress?.total || 1} value={progress ? progress.current : undefined} />}
    {errors.length > 0 && <details><summary>View {errors.length} failed files</summary>
      <ul>{errors.map((error, index) => <li key={index}>{error.filePath}: {error.error}</li>)}</ul>
      <p>Fix access or file errors, then import again. Existing games are skipped.</p>
    </details>}
  </div>;
}
