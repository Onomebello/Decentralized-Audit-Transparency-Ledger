"use client";

export default function Spinner({ size = "default" }: { size?: "default" | "lg" }) {
  return <div className={`spinner ${size === "lg" ? "spinner-lg" : ""}`} />;
}

export function LoadingOverlay({ text = "Loading…" }: { text?: string }) {
  return (
    <div className="loading-overlay">
      <Spinner />
      <span className="text-muted">{text}</span>
    </div>
  );
}

export function ProgressBar() {
  return (
    <div className="progress-bar">
      <div className="progress-bar-fill" />
    </div>
  );
}
