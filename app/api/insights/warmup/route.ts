import { NextResponse } from "next/server";
import { runInsightsWarmup } from "@/lib/insights/run-insights-warmup";

export const runtime = "nodejs";

function allowDashboardWarmup(request: Request): boolean {
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  const flag = process.env.ALLOW_DASHBOARD_INSIGHTS_WARMUP?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") {
    return true;
  }
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return token === secret;
}

/**
 * Precalienta la caché de insights como el cron (mismas env INSIGHTS_CRON_*).
 * Producción: define ALLOW_DASHBOARD_INSIGHTS_WARMUP=1 en Netlify, o envía Authorization: Bearer CRON_SECRET.
 */
export async function POST(request: Request) {
  if (!allowDashboardWarmup(request)) {
    return NextResponse.json(
      {
        error:
          "No autorizado. En producción: ALLOW_DASHBOARD_INSIGHTS_WARMUP=1 en el sitio, o usa Bearer CRON_SECRET.",
      },
      { status: 401 },
    );
  }

  const out = await runInsightsWarmup();
  if (out.error && out.status) {
    return NextResponse.json({ ok: false, error: out.error, results: out.results }, { status: out.status });
  }

  return NextResponse.json({ ok: out.ok, results: out.results });
}
