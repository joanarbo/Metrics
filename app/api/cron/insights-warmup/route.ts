import { NextResponse } from "next/server";
import { runInsightsWarmup } from "@/lib/insights/run-insights-warmup";

export const runtime = "nodejs";

/**
 * Precalienta filas en `dashboard_insights_cache` (mismo criterio que la home: compare+strip).
 * Proteger con Authorization: Bearer CRON_SECRET. Invocado por la función programada de Netlify.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 503 });
  }
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== secret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const out = await runInsightsWarmup();
  if (out.error && out.status) {
    return NextResponse.json({ ok: false, error: out.error, results: out.results }, { status: out.status });
  }

  return NextResponse.json({ ok: out.ok, results: out.results });
}
