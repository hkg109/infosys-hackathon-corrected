import { ExchangeDetail } from "@/features/planner/components/ExchangeResults";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExchangeDetail id={decodeURIComponent(id)} />;
}
