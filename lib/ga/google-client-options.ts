import type { ClientOptions } from "google-gax";

/**
 * Opciones para Analytics Admin API y Data API.
 * - **Netlify / serverless:** usa `GOOGLE_SERVICE_ACCOUNT_JSON` (pega el JSON completo en una variable).
 * - **Local:** `GOOGLE_APPLICATION_CREDENTIALS` = ruta al JSON, o ADC con `gcloud`.
 */
export function googleAnalyticsClientOptions(): ClientOptions | undefined {
  const jsonRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonRaw) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(jsonRaw) as Record<string, unknown>;
    } catch {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON no es JSON válido. Si lo pegaste en Netlify, revisa comillas y saltos de línea.",
      );
    }
    if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON debe ser un objeto (service account).");
    }
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
      (typeof credentials.project_id === "string" ? credentials.project_id : undefined);
    return {
      credentials,
      ...(projectId ? { projectId } : {}),
    };
  }

  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!keyFilename && !projectId) {
    return undefined;
  }
  return {
    ...(keyFilename ? { keyFilename } : {}),
    ...(projectId ? { projectId } : {}),
  };
}

/** True si hay JSON en env o ruta a credenciales (no comprueba que el archivo exista). */
export function hasGoogleCredentialsEnv(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
  );
}
