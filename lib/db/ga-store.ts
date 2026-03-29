import type { AccountRow } from "@/lib/ga/account-summaries";
import type { NeonSql } from "@/lib/db/neon";

type SnapshotRow = {
  property_resource: string;
  account_resource: string;
  account_api_name: string;
  account_display_name: string;
  property_display_name: string;
  property_type: string | null;
  updated_at: Date;
};

export async function loadAccountsFromSnapshot(
  sql: NeonSql,
): Promise<{ accounts: AccountRow[]; syncedAt: string | null }> {
  const rows = (await sql`
    SELECT property_resource, account_resource, account_api_name, account_display_name,
           property_display_name, property_type, updated_at
    FROM ga_property_snapshot
    ORDER BY account_display_name ASC, property_display_name ASC
  `) as SnapshotRow[];

  if (rows.length === 0) {
    return { accounts: [], syncedAt: null };
  }

  const syncedAt = rows.reduce<string | null>((max, r) => {
    const t = new Date(r.updated_at).toISOString();
    return max && max > t ? max : t;
  }, null);

  const byAccount = new Map<string, AccountRow>();
  for (const r of rows) {
    let acc = byAccount.get(r.account_resource);
    if (!acc) {
      acc = {
        name: r.account_api_name || r.account_resource,
        account: r.account_resource,
        displayName: r.account_display_name,
        propertySummaries: [],
      };
      byAccount.set(r.account_resource, acc);
    }
    acc.propertySummaries.push({
      property: r.property_resource,
      displayName: r.property_display_name,
      propertyType: r.property_type ?? "",
      parent: "",
    });
  }

  return { accounts: [...byAccount.values()], syncedAt };
}

export async function replaceSnapshotWithAccounts(
  sql: NeonSql,
  accounts: AccountRow[],
): Promise<string> {
  const queries = [sql`DELETE FROM ga_property_snapshot`];

  for (const acc of accounts) {
    for (const p of acc.propertySummaries) {
      queries.push(sql`
        INSERT INTO ga_property_snapshot (
          property_resource,
          account_resource,
          account_api_name,
          account_display_name,
          property_display_name,
          property_type,
          updated_at
        ) VALUES (
          ${p.property},
          ${acc.account},
          ${acc.name},
          ${acc.displayName},
          ${p.displayName},
          ${p.propertyType || null},
          now()
        )
      `);
    }
  }

  await sql.transaction(queries);
  return new Date().toISOString();
}
