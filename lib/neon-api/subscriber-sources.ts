import { DEFAULT_SUBSCRIBER_COUNT_SQL_BY_BRAND } from "@/lib/neon-api/default-subscriber-count-sql";
import { assertSafeSubscriberCountSql } from "@/lib/neon-api/validate-count-sql";

function defaultSubscriberSqlForBrand(brand: string): string | undefined {
  if (
    Object.prototype.hasOwnProperty.call(
      DEFAULT_SUBSCRIBER_COUNT_SQL_BY_BRAND,
      brand,
    )
  ) {
    return DEFAULT_SUBSCRIBER_COUNT_SQL_BY_BRAND[
      brand as keyof typeof DEFAULT_SUBSCRIBER_COUNT_SQL_BY_BRAND
    ];
  }
  return undefined;
}

const BRAND_PROJECT_ENV: Array<{
  brand: string;
  projectEnv: string;
  optionalCountSqlEnv?: string;
}> = [
  { brand: "Bodados", projectEnv: "NEON_PROJECT_ID_BODADOS" },
  { brand: "InstitutoAgentico", projectEnv: "NEON_PROJECT_ID_INSTITUTOAGENTICO" },
  { brand: "Lopeix", projectEnv: "NEON_PROJECT_ID_LOPEIX" },
  { brand: "PolyNews", projectEnv: "NEON_PROJECT_ID_POLYNEWS" },
  {
    brand: "LorsClub",
    projectEnv: "NEON_PROJECT_ID_LORSCLUB",
    optionalCountSqlEnv: "NEON_LORSCLUB_COUNT_SQL",
  },
];

function buildSourcesFromBrandProjectEnv(): NeonSubscriberSource[] {
  const databaseName =
    process.env.NEON_SUBSCRIBER_DATABASE?.trim() || "neondb";
  const roleName = process.env.NEON_SUBSCRIBER_ROLE?.trim() || "neondb_owner";
  const out: NeonSubscriberSource[] = [];

  for (const { brand, projectEnv, optionalCountSqlEnv } of BRAND_PROJECT_ENV) {
    const projectId = process.env[projectEnv]?.trim();
    if (!projectId) continue;

    const overrideSql = optionalCountSqlEnv
      ? (process.env[optionalCountSqlEnv]?.trim() ?? "")
      : "";
    const defaultSql = defaultSubscriberSqlForBrand(brand);
    const sqlToUse = overrideSql || defaultSql;

    if (!sqlToUse) {
      console.warn(
        `[subscriber-sources] ${projectEnv} definido pero falta SQL para ${brand}; define ${optionalCountSqlEnv ?? "countSql"}`,
      );
      continue;
    }

    out.push({
      brand,
      projectId,
      databaseName,
      roleName,
      countSql: assertSafeSubscriberCountSql(sqlToUse),
    });
  }

  return out;
}

export type NeonSubscriberSource = {
  /** Debe coincidir con la marca del dashboard (p. ej. Bodados, InstitutoAgentico). */
  brand: string;
  /** ID del proyecto en Neon (console). */
  projectId: string;
  databaseName: string;
  roleName: string;
  branchId?: string;
  /** Usar URI pooler (por defecto true). */
  pooled?: boolean;
  /**
   * Consulta que devuelve exactamente una fila con un valor numérico.
   * Si se omite y `brand` tiene tabla por defecto (Bodados, InstitutoAgentico, Lopeix, PolyNews),
   * se usa la de `default-subscriber-count-sql.ts`.
   */
  countSql: string;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function parseNeonSubscriberSources(): NeonSubscriberSource[] {
  const raw = process.env.NEON_SUBSCRIBER_SOURCES?.trim();
  if (!raw) {
    return buildSourcesFromBrandProjectEnv();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("NEON_SUBSCRIBER_SOURCES no es JSON válido");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("NEON_SUBSCRIBER_SOURCES debe ser un array JSON");
  }
  const out: NeonSubscriberSource[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) continue;
    const brand = String(item.brand ?? "").trim();
    const projectId = String(item.projectId ?? "").trim();
    const databaseName = String(item.databaseName ?? "neondb").trim() || "neondb";
    const roleName = String(item.roleName ?? "").trim();
    const countSqlRaw = String(item.countSql ?? "").trim();
    const branchId = item.branchId != null ? String(item.branchId).trim() : undefined;
    const pooled = item.pooled === false ? false : true;
    if (!brand || !projectId || !roleName) {
      throw new Error(
        "Cada entrada de NEON_SUBSCRIBER_SOURCES requiere brand, projectId y roleName",
      );
    }
    const fallbackSql = defaultSubscriberSqlForBrand(brand);
    const sqlToUse = countSqlRaw || fallbackSql;
    if (!sqlToUse) {
      throw new Error(
        `NEON_SUBSCRIBER_SOURCES: marca "${brand}" sin countSql y sin tabla por defecto (añade countSql o usa Bodados, InstitutoAgentico, Lopeix o PolyNews)`,
      );
    }
    const countSql = assertSafeSubscriberCountSql(sqlToUse);
    out.push({
      brand,
      projectId,
      databaseName,
      roleName,
      branchId: branchId || undefined,
      pooled,
      countSql,
    });
  }
  return out;
}
