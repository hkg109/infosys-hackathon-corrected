import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_CONTEXT, getPublishedCatalog } from "@/server/catalog/getPublishedCatalog";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const res = await getPublishedCatalog({
    campus: q.get("campus") ?? DEFAULT_CONTEXT.campus,
    department: q.get("department") ?? DEFAULT_CONTEXT.department,
    curriculum: q.get("curriculum") ?? DEFAULT_CONTEXT.curriculum,
  });
  return NextResponse.json(res, {
    status: res.status === "unavailable" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
