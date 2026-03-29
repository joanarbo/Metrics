/**
 * Solo permite un SELECT de lectura (configuración de confianza en env).
 * Evita múltiples sentencias y palabras peligrosas obvias.
 */
export function assertSafeSubscriberCountSql(raw: string): string {
  const sql = raw.trim();
  if (!sql) {
    throw new Error("countSql vacío");
  }
  if (sql.includes(";")) {
    throw new Error("countSql no puede contener ';'");
  }
  const lower = sql.toLowerCase();
  if (!lower.startsWith("select ")) {
    throw new Error("countSql debe empezar por SELECT");
  }
  const forbidden = /\b(insert|update|delete|drop|truncate|alter|grant|revoke|execute|call)\b/i;
  if (forbidden.test(sql)) {
    throw new Error("countSql: sentencia no permitida");
  }
  return sql;
}
