import { neon } from "@neondatabase/serverless";

export type NeonSql = ReturnType<typeof neon>;

export function getNeonSql(): NeonSql | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    return null;
  }
  return neon(url);
}
