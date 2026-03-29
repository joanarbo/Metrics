import { neon } from "@neondatabase/serverless";
import { getProjectConnectionUri } from "@/lib/neon-api/console-client";
import type { NeonSubscriberSource } from "@/lib/neon-api/subscriber-sources";

function firstNumericCell(row: Record<string, unknown>): number | null {
  for (const v of Object.values(row)) {
    if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
      return Math.trunc(Number(v));
    }
  }
  return null;
}

async function runCountQuery(uri: string, countSql: string): Promise<number> {
  const sql = neon(uri, { readOnly: true });
  const rows = await sql.query(countSql, []);
  if (!Array.isArray(rows) || rows.length === 0) {
    return 0;
  }
  const n = firstNumericCell(rows[0] as Record<string, unknown>);
  return n ?? 0;
}

export type NeonSubscriberFetchResult = {
  byBrand: Record<string, number>;
  errors: Array<{ brand: string; message: string }>;
};

export async function fetchNeonSubscriberCounts(
  sources: NeonSubscriberSource[],
): Promise<NeonSubscriberFetchResult> {
  const byBrand: Record<string, number> = {};
  const errors: Array<{ brand: string; message: string }> = [];

  await Promise.all(
    sources.map(async (src) => {
      try {
        const uri = await getProjectConnectionUri(src.projectId, {
          databaseName: src.databaseName,
          roleName: src.roleName,
          branchId: src.branchId,
          pooled: src.pooled,
        });
        const n = await runCountQuery(uri, src.countSql);
        byBrand[src.brand] = n;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push({ brand: src.brand, message });
      }
    }),
  );

  return { byBrand, errors };
}
