const NEON_CONSOLE_API = "https://console.neon.tech/api/v2";

function getNeonApiKey(): string {
  const key = process.env.NEON_API_KEY?.trim();
  if (!key) {
    throw new Error("NEON_API_KEY no está definida");
  }
  return key;
}

export async function neonConsoleGet<T = unknown>(pathWithQuery: string): Promise<T> {
  const key = getNeonApiKey();
  const url = `${NEON_CONSOLE_API}${pathWithQuery.startsWith("/") ? "" : "/"}${pathWithQuery}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Neon API ${res.status}: ${text.slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export type ConnectionUriResponse = { uri: string };

/**
 * URI de conexión para un proyecto/rama/rol (Management API).
 * @see https://api-docs.neon.tech/reference/getconnectionuri
 */
export async function getProjectConnectionUri(
  projectId: string,
  opts: {
    databaseName: string;
    roleName: string;
    branchId?: string;
    pooled?: boolean;
  },
): Promise<string> {
  const q = new URLSearchParams({
    database_name: opts.databaseName,
    role_name: opts.roleName,
  });
  if (opts.branchId) q.set("branch_id", opts.branchId);
  if (opts.pooled !== false) q.set("pooled", "true");
  const data = await neonConsoleGet<ConnectionUriResponse>(
    `/projects/${encodeURIComponent(projectId)}/connection_uri?${q.toString()}`,
  );
  if (!data?.uri) {
    throw new Error("Neon API no devolvió connection URI");
  }
  return data.uri;
}
