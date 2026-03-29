import { NextResponse } from "next/server";
import { getNeonSql } from "@/lib/db/neon";
import {
  getCachedTrafficPayload,
  trafficCacheKeyFromRouteParams,
  upsertTrafficCache,
} from "@/lib/db/traffic-cache";
import { hasGoogleCredentialsEnv } from "@/lib/ga/google-client-options";
import { buildDashboardTrafficJson } from "@/lib/ga/build-dashboard-traffic-json";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");
  const source = searchParams.get("source");
  const withLocations = searchParams.get("locations") === "1";
  const withCompare = searchParams.get("compare") === "1";
  const withStrip = searchParams.get("strip") === "1";
  const refresh = searchParams.get("refresh") === "1";
  const sourceStored = source === "stored";

  const sql = getNeonSql();
  const cacheKey = trafficCacheKeyFromRouteParams({
    period,
    daysParam: searchParams.get("days"),
    withCompare,
    withStrip,
    withLocations,
    sourceStored,
  });

  try {
    if (!refresh && sql) {
      const cached = await getCachedTrafficPayload(sql, cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    if (!hasGoogleCredentialsEnv()) {
      return NextResponse.json(
        {
          error:
            "No hay credenciales de Google para la Data API (tráfico GA4). En Netlify no sirve una ruta local al JSON.",
          code: "GA_CREDENTIALS_MISSING",
          hint: "Añade la variable GOOGLE_SERVICE_ACCOUNT_JSON con el JSON completo de la service account, y GOOGLE_CLOUD_PROJECT. Ver .env.example.",
        },
        { status: 503 },
      );
    }

    const data = await buildDashboardTrafficJson({
      period,
      daysParam: searchParams.get("days"),
      source,
      withLocations,
      withCompare,
      withStrip,
    });

    if (sql) {
      await upsertTrafficCache(sql, cacheKey, data);
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : undefined;
    return NextResponse.json(
      {
        error: message,
        code,
        hint:
          "Comprueba credenciales, APIs Data + Admin habilitadas y acceso de la cuenta de servicio a cada propiedad GA4.",
      },
      { status: 502 },
    );
  }
}
