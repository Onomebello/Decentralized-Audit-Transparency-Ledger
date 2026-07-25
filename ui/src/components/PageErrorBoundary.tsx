"use client";
import React from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import Nav from "./Nav";

function reportError(error: Error, errorInfo: React.ErrorInfo) {
  if (typeof window !== "undefined") {
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    };
    console.error("[ErrorBoundary]", errorReport);
  }
}

export function PageErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      onError={reportError}
      fallback={
        <>
          <Nav />
          <main
            className="container"
            style={{ padding: "32px 24px", minHeight: "60vh" }}
          >
            <ErrorFallbackPage />
          </main>
        </>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

function ErrorFallbackPage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "50vh",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "var(--error, #ef4444)",
          opacity: 0.15,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 32,
        }}
      >
        !
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
        Page Error
      </h2>
      <p
        style={{
          color: "var(--text-muted, #888)",
          fontSize: 14,
          maxWidth: 420,
          textAlign: "center",
          margin: 0,
        }}
      >
        This page encountered an unexpected error. This has been logged for
        investigation. You can try navigating back or reloading.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={() => window.location.reload()}
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
          Reload page
        </button>
        <button
          onClick={() => window.history.back()}
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
          Go back
        </button>
      </div>
    </div>
  );
}

export function SectionErrorBoundary({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <ErrorBoundary
      onError={reportError}
      fallback={
        <div
          style={{
            padding: 24,
            textAlign: "center",
            border: "1px solid var(--border, #333)",
            borderRadius: 8,
            background: "var(--surface, #1a1a2e)",
          }}
        >
          <p style={{ color: "var(--error, #ef4444)", fontWeight: 600, fontSize: 14, margin: 0 }}>
            {title ? `Failed to load ${title}` : "Section failed to load"}
          </p>
          <p style={{ color: "var(--text-muted, #888)", fontSize: 12, margin: "8px 0 0 0" }}>
            Try refreshing the page.
          </p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
