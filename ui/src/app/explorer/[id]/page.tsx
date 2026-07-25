import Nav from "@/components/Nav";
import EventDetailClient from "./EventDetailClient";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <Nav />
      <main className="container" style={{ padding: "32px 24px" }}>
        <EventDetailClient eventId={id} />
      </main>
    </>
  );
}
