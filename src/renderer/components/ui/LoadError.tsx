export function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="operation-status" role="alert"><span>{message}</span>
    <button type="button" className="btn" onClick={retry}>Retry</button>
  </div>;
}
