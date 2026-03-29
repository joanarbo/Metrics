const TOGETHER_URL = "https://api.together.xyz/v1/chat/completions";

export type TrafficPayloadForInsights = {
  days: number;
  propertyCount: number;
  totals: { sessions: number; totalUsers: number; screenPageViews: number };
  rows: Array<{
    propertyDisplayName: string;
    accountDisplayName: string;
    sessions: number;
    totalUsers: number;
    screenPageViews: number;
    error?: string;
  }>;
  userIdFilterActive: boolean;
  excludedUserIdCount: number;
};

function buildSystemPrompt(): string {
  return `Eres un analista de marketing web. Respondes SIEMPRE en español, de forma breve y accionable.
Usas solo los datos JSON que recibes; no inventes cifras.
Si userIdFilterActive es false, recuerda en 1 frase que no se puede identificar a la misma persona entre propiedades sin User-ID en los sites, y sugiere filtrar tráfico interno en Admin de GA4.
Si hay filas con error, menciona que alguna propiedad falló sin detallar stack traces.`;
}

function buildUserContent(payload: TrafficPayloadForInsights): string {
  return `Datos agregados (últimos ${payload.days} días):

${JSON.stringify(payload, null, 2)}

Escribe 4-6 viñetas con lo más destacado: comparación entre propiedades, totales, desequilibrios, y una recomendación práctica. Sin markdown pesado (puedes usar guiones).`;
}

export async function summarizeTrafficWithTogether(
  payload: TrafficPayloadForInsights,
): Promise<{ text: string; model: string }> {
  const apiKey = process.env.TOGETHER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("TOGETHER_API_KEY no configurada");
  }

  const model =
    process.env.TOGETHER_MODEL?.trim() || "meta-llama/Llama-3.3-70B-Instruct-Turbo";

  const res = await fetch(TOGETHER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      temperature: 0.4,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserContent(payload) },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Together API ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Respuesta vacía de Together");
  }

  return { text, model };
}
