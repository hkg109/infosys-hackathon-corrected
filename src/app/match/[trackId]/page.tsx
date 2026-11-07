import { TrackDetail } from "@/features/planner/components/TrackDetail";

export default async function Page({ params }: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await params;
  return <TrackDetail trackId={decodeURIComponent(trackId)} />;
}
