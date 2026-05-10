import SessionOrchestrator from "@/components/Breakout/SessionOrchestrator";

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ role: string }> }) {
  const { id } = await params;
  const { role } = await searchParams;
  return <SessionOrchestrator sessionId={id} initialRole={(role as "userA" | "userB") || "userA"} />;
}
