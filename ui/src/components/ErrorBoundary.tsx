"use client";
import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

function ErrorFallback({
  error,
  errorInfo,
  onRetry,
}: {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  onRetry: () => void;
}) {
  const [showDetails, setShowDetails] = React.useState(false);

  return (
    <div
      style={{
        padding: 32,
        textAlign: "center",
        minHeight: 200,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "var(--error, #ef4444)",
          opacity: 0.15,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
        }}
      >
        !
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
        Something went wrong
      </h2>
      <p
        style={{
          color: "var(--text-muted, #888)",
          fontSize: 14,
          maxWidth: 400,
          margin: 0,
        }}
      >
        An unexpected error occurred while rendering this section. You can try
        reloading or navigate to a different page.
      </p>

      {error && (
        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            background: "none",
            border: "1px solid var(--border, #333)",
            borderRadius: 6,
            padding: "6px 12px",
            color: "var(--text-muted, #888)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {showDetails ? "Hide details" : "Show error details"}
        </button>
      )}

      {showDetails && error && (
        <pre
          style={{
            background: "var(--surface, #1a1a2e)",
            border: "1px solid var(--border, #333)",
            borderRadius: 8,
            padding: 16,
            fontSize: 12,
            textAlign: "left",
            maxWidth: "100%",
            overflow: "auto",
            maxHeight: 200,
            width: "100%",
            color: "var(--text, #eee)",
            margin: 0,
          }}
        >
          {error.message}
          {errorInfo?.componentStack && `\n\n${errorInfo.componentStack}`}
        </pre>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={onRetry}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            background: "var(--accent, #4f8ef7)",
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid var(--border, #333)",
            background: "transparent",
            color: "var(--text-muted, #888)",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
