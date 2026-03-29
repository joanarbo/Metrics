import { fetchAllAccountSummaries } from "@/lib/ga/account-summaries";
import type { AccountRow } from "@/lib/ga/account-summaries";
import { getNeonSql } from "@/lib/db/neon";
import { loadAccountsFromSnapshot } from "@/lib/db/ga-store";

/** Lista de cuentas para informes de tráfico (vivo o snapshot Neon). */
export async function getAccountsForTrafficRequest(
  source: string | null,
): Promise<AccountRow[]> {
  const sql = getNeonSql();
  if (source === "stored" && sql) {
    const snap = await loadAccountsFromSnapshot(sql);
    return snap.accounts;
  }
  return fetchAllAccountSummaries();
}
