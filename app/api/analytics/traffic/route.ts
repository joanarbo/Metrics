import { NextResponse } from "next/server";
import { parseGa4ExcludedUserIds } from "@/lib/ga/excluded-user-ids";
import {
  fetchAggregatedCountrySessions,
  fetchTrafficForAllProperties,
} from "@/lib/ga/property-traffic";
import { getAccountsForTrafficRequest } from "@/lib/ga/traffic-accounts";

export const runtime = "nodejs";

function clampDays(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : 7;
  if (!Number.isFinite(n)) {
    return 7;
  }
  return Math.min(90, Math.max(1, n));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = clampDays(searchParams.get("days"));
  const source = searchParams.get("source");
  const withLocations = searchParams.get("locations") === "1";
  const excludeUserIds = parseGa4ExcludedUserIds();
  const userIdFilterActive = excludeUserIds.length > 0;

  try {
    const accounts = await getAccountsForTrafficRequest(source);

    const rows = await fetchTrafficForAllProperties(accounts, days, excludeUserIds);
    const totals = rows.reduce(
      (acc, r) => ({
        sessions: acc.sessions + r.sessions,
        totalUsers: acc.totalUsers + r.totalUsers,
        screenPageViews: acc.screenPageViews + r.screenPageViews,
      }),
      { sessions: 0, totalUsers: 0, screenPageViews: 0 },
    );

    let locations: Array<{ country: string; sessions: number }> | undefined;
    if (withLocations) {
      const okProps = rows.filter((r) => !r.error).map((r) => r.property);
      locations = await fetchAggregatedCountrySessions(okProps, days, 18, excludeUserIds);
    }

    return NextResponse.json({
      days,
      rows,
      totals,
      propertyCount: rows.length,
      userIdFilterActive,
      excludedUserIdCount: excludeUserIds.length,
      ...(withLocations ? { locations: locations ?? [] } : {}),
    });
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
