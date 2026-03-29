import { NextResponse } from "next/server";
import { getNeonSql } from "@/lib/db/neon";
import { loadAccountsFromSnapshot } from "@/lib/db/ga-store";
import { fetchAllAccountSummaries } from "@/lib/ga/account-summaries";

export const runtime = "nodejs";

function googleErrorResponse(err: unknown) {
  const message =
    err instanceof Error ? err.message : "Unknown error calling Analytics Admin API";
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : undefined;
  return NextResponse.json(
    {
      error: message,
      code,
      hint:
        "En Netlify usa GOOGLE_SERVICE_ACCOUNT_JSON (JSON completo). Local: GOOGLE_APPLICATION_CREDENTIALS o ADC. Habilita Admin API. Ver docs/GA-SETUP.md.",
    },
    { status: 502 },
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const live = searchParams.get("live") === "1";
  const sql = getNeonSql();

  if (sql && !live) {
    try {
      const { accounts, syncedAt } = await loadAccountsFromSnapshot(sql);
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
        /ga_property_snapshot/i.test(message);
      if (missingTable) {
        return NextResponse.json(
          {
            error: "Falta la tabla en Neon. Ejecuta el SQL de db/schema.sql en el SQL Editor de Neon.",
            code: "SCHEMA_MISSING",
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        {
          error: message,
          hint: "Revisa DATABASE_URL y que la base sea alcanzable.",
        },
        { status: 502 },
      );
    }
  }

  try {
    const accounts = await fetchAllAccountSummaries();
    return NextResponse.json({
      accounts,
      source: "google" as const,
      syncedAt: null,
      persistEnabled: Boolean(sql),
    });
  } catch (err) {
    return googleErrorResponse(err);
  }
}
