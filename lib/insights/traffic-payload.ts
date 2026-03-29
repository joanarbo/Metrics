import type {
  TrafficPayloadForInsights,
  TrafficRowForInsights,
} from "@/lib/together/summarize-traffic";

export function toInsightsPayload(body: Record<string, unknown>): TrafficPayloadForInsights | null {
  const days = body.days;
  const propertyCount = body.propertyCount;
  const totals = body.totals;
  const rows = body.rows;
  if (
    typeof days !== "number" ||
    typeof propertyCount !== "number" ||
    !totals ||
    typeof totals !== "object" ||
    !Array.isArray(rows)
  ) {
    return null;
  }
  const t = totals as Record<string, unknown>;
  const sessions = t.sessions;
  const totalUsers = t.totalUsers;
  const screenPageViews = t.screenPageViews;
  if (
    typeof sessions !== "number" ||
    typeof totalUsers !== "number" ||
    typeof screenPageViews !== "number"
  ) {
    return null;
  }

  const userIdFilterActive = body.userIdFilterActive === true;
  const excludedUserIdCount =
    typeof body.excludedUserIdCount === "number" ? body.excludedUserIdCount : 0;

  const cleanRows: TrafficRowForInsights[] = rows.map((r: unknown) => {
    const row = r as Record<string, unknown>;
    const base: TrafficRowForInsights = {
      property: typeof row.property === "string" ? row.property : undefined,
      propertyDisplayName: String(row.propertyDisplayName ?? ""),
      accountDisplayName: String(row.accountDisplayName ?? ""),
      sessions: Number(row.sessions) || 0,
      totalUsers: Number(row.totalUsers) || 0,
      screenPageViews: Number(row.screenPageViews) || 0,
      ...(typeof row.error === "string" ? { error: row.error } : {}),
    };
    if (typeof row.priorSessions === "number") base.priorSessions = row.priorSessions;
    if (typeof row.priorTotalUsers === "number") base.priorTotalUsers = row.priorTotalUsers;
    if (typeof row.priorScreenPageViews === "number") {
      base.priorScreenPageViews = row.priorScreenPageViews;
    }
    if (row.sessionsChangePct === null || typeof row.sessionsChangePct === "number") {
      base.sessionsChangePct = row.sessionsChangePct as number | null;
    }
    if (row.totalUsersChangePct === null || typeof row.totalUsersChangePct === "number") {
      base.totalUsersChangePct = row.totalUsersChangePct as number | null;
    }
    if (row.sessionsWeekOverWeekPct === null || typeof row.sessionsWeekOverWeekPct === "number") {
      base.sessionsWeekOverWeekPct = row.sessionsWeekOverWeekPct as number | null;
    }
    if (Array.isArray(row.bucketSessions)) {
      base.bucketSessions = row.bucketSessions.map((x: unknown) => Number(x) || 0);
    }
    return base;
  });

  const compare = body.compare === true;
  const period = typeof body.period === "string" ? body.period : undefined;
  let timeStrip: TrafficPayloadForInsights["timeStrip"];
  const ts = body.timeStrip;
  if (ts && typeof ts === "object") {
    const o = ts as Record<string, unknown>;
    const bl = o.bucketLabels;
    const gs = o.globalBucketSessions;
    const gu = o.globalBucketUsers;
    if (
      Array.isArray(bl) &&
      Array.isArray(gs) &&
      Array.isArray(gu) &&
      bl.every((x) => typeof x === "string")
    ) {
      timeStrip = {
        bucketLabels: bl as string[],
        globalBucketSessions: gs.map((x) => Number(x) || 0),
        globalBucketUsers: gu.map((x) => Number(x) || 0),
      };
    }
  }
  let previousTotals: TrafficPayloadForInsights["previousTotals"];
  const pt = body.previousTotals;
  if (pt && typeof pt === "object") {
    const o = pt as Record<string, unknown>;
    if (
      typeof o.sessions === "number" &&
      typeof o.totalUsers === "number" &&
      typeof o.screenPageViews === "number"
    ) {
      previousTotals = {
        sessions: o.sessions,
        totalUsers: o.totalUsers,
        screenPageViews: o.screenPageViews,
      };
    }
  }

  let totalsChangePct: TrafficPayloadForInsights["totalsChangePct"];
  const tcp = body.totalsChangePct;
  if (tcp && typeof tcp === "object") {
    const o = tcp as Record<string, unknown>;
    totalsChangePct = {
      sessions:
        o.sessions === null || typeof o.sessions === "number" ? (o.sessions as number | null) : null,
      totalUsers:
        o.totalUsers === null || typeof o.totalUsers === "number"
          ? (o.totalUsers as number | null)
          : null,
      screenPageViews:
        o.screenPageViews === null || typeof o.screenPageViews === "number"
          ? (o.screenPageViews as number | null)
          : null,
    };
  }

  let topGrowth: TrafficPayloadForInsights["topGrowth"];
  const tg = body.topGrowth;
  if (tg && typeof tg === "object") {
    const o = tg as Record<string, unknown>;
    if (typeof o.propertyDisplayName === "string" && typeof o.sessionsChangePct === "number") {
      topGrowth = { propertyDisplayName: o.propertyDisplayName, sessionsChangePct: o.sessionsChangePct };
    }
  } else if (tg === null) {
    topGrowth = null;
  }

  return {
    days,
    propertyCount,
    compare,
    ...(period ? { period } : {}),
    ...(timeStrip ? { timeStrip } : {}),
    totals: { sessions, totalUsers, screenPageViews },
    ...(previousTotals ? { previousTotals } : {}),
    ...(totalsChangePct ? { totalsChangePct } : {}),
    ...(compare ? { topGrowth: topGrowth ?? null } : {}),
    rows: cleanRows,
    userIdFilterActive,
    excludedUserIdCount,
  };
}
