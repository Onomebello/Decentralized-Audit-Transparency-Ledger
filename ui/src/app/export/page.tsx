import Nav from "@/components/Nav";
import ExportClient from "./ExportClient";

export default function ExportPage() {
  return (
    <>
      <Nav />
      <main className="container" style={{ padding: "32px 24px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Export Events</h1>
        <p className="text-muted mb-6">
          Export on-chain audit events in various formats for analysis and compliance.
        </p>
        <ExportClient />
      </main>
    </>
  );
}
