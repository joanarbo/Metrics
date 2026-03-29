/** Opciones comunes para clientes Admin API y Data API (mismo JSON / proyecto). */
export function googleAnalyticsClientOptions():
  | { keyFilename?: string; projectId?: string }
  | undefined {
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
