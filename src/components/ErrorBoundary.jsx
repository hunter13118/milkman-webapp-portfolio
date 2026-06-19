import { Component } from "react";

/** Surfaces runtime errors instead of a blank screen (common on iOS Safari). */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[portfolio]", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      const message = this.state.error?.message || String(this.state.error);
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: "2rem",
            background: "#0f172a",
            color: "#e2e8f0",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>Something went wrong</h1>
          <p style={{ color: "#94a3b8", marginBottom: "1rem" }}>
            The page hit a JavaScript error after loading. Try a hard refresh; if it persists,
            screenshot this message.
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "rgba(0,0,0,0.35)",
              padding: "1rem",
              borderRadius: 8,
              fontSize: "0.85rem",
            }}
          >
            {message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              borderRadius: 8,
              border: "none",
              background: "#6366f1",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
