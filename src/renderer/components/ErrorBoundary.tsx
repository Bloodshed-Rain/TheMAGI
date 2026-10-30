import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 40,
            maxWidth: 600,
            margin: "80px auto",
            textAlign: "center",
            color: "var(--text)",
          }}
        >
          <h2 style={{ marginBottom: 12, color: "var(--loss)" }}>Something went wrong</h2>
          <p style={{ color: "var(--text-dim)", marginBottom: 16, fontSize: 14 }}>
            MAGI hit an unexpected error. Try reloading the app.
          </p>
          <pre
            style={{
              textAlign: "left",
              padding: 16,
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              fontSize: 12,
              overflow: "auto",
              maxHeight: 200,
              color: "var(--text-dim)",
            }}
          >
            {this.state.error?.message ?? "Unknown error"}
          </pre>
          <button
            className="btn btn-primary"
            onClick={() => {
              this.setState({ hasError: false, error: null });
            }}
            style={{
              marginTop: 16,
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
