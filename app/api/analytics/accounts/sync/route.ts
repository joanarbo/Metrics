import { NextResponse } from "next/server";
import { getNeonSql } from "@/lib/db/neon";
import { replaceSnapshotWithAccounts } from "@/lib/db/ga-store";
import { fetchAllAccountSummaries } from "@/lib/ga/account-summaries";

export const runtime = "nodejs";

export async function POST() {
  const sql = getNeonSql();
  if (!sql) {
    return NextResponse.json(
      { error: "DATABASE_URL no está configurada. Añádela en .env.local." },
      { status: 503 },
    );
  }

  try {
    const accounts = await fetchAllAccountSummaries();
    const syncedAt = await replaceSnapshotWithAccounts(sql, accounts);
    return NextResponse.json({
      accounts,
      source: "database" as const,
      syncedAt,
      persistEnabled: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const missingTable =
      /relation .* does not exist/i.test(message) ||
      (/ga_property_snapshot/i.test(message) && /does not exist/i.test(message));
    if (missingTable) {
      return NextResponse.json(
        {
          error: "Falta la tabla en Neon. Ejecuta db/schema.sql en el SQL Editor.",
          code: "SCHEMA_MISSING",
        },
        { status: 500 },
      );
    }
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : undefined;
    return NextResponse.json(
      {
        error: message,
        code,
        hint:
          "La sincronización necesita credenciales de Google Analytics válidas y permisos de lectura.",
      },
      { status: 502 },
    );
  }
}
