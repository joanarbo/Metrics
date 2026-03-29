const TOGETHER_URL = "https://api.together.xyz/v1/chat/completions";

export type TrafficRowForInsights = {
  property?: string;
  propertyDisplayName: string;
  accountDisplayName: string;
  sessions: number;
  totalUsers: number;
  screenPageViews: number;
  error?: string;
  priorSessions?: number;
  priorTotalUsers?: number;
  priorScreenPageViews?: number;
  sessionsChangePct?: number | null;
  totalUsersChangePct?: number | null;
  sessionsWeekOverWeekPct?: number | null;
  bucketSessions?: number[];
};

export type TrafficPayloadForInsights = {
  days: number;
  propertyCount: number;
  compare?: boolean;
  period?: string;
  timeStrip?: {
    bucketLabels: string[];
    globalBucketSessions: number[];
    globalBucketUsers: number[];
  };
  totals: { sessions: number; totalUsers: number; screenPageViews: number };
  previousTotals?: { sessions: number; totalUsers: number; screenPageViews: number };
  totalsChangePct?: {
    sessions: number | null;
    totalUsers: number | null;
    screenPageViews: number | null;
  };
  topGrowth?: {
    propertyDisplayName: string;
    sessionsChangePct: number;
  } | null;
  rows: TrafficRowForInsights[];
  userIdFilterActive: boolean;
  excludedUserIdCount: number;
};

export type InsightTrend = "up" | "down" | "flat" | "nodata";

export type InsightAlertItem = {
  text: string;
  trend: InsightTrend;
};

export function inferInsightTrendFromText(text: string): InsightTrend {
  const t = text.toLowerCase();
  if (
    /\b0 sesiones\b|sin sesiones|sin tráfico|sin datos|no tuvo ninguna|revisar tracking|error de/i.test(
      t,
    )
  ) {
    return "nodata";
  }
  if (
    (/\+\d|sube|crec|aument|lidera|mantener|potenci/i.test(t) && !/baja|caíd|−|-\d|–\d/i.test(t)) ||
    /\bok\b/i.test(t)
  ) {
    return "up";
  }
  if (/-\d|–\d|↓|caíd|caer|baja\s+(usuarios|sesiones)|menos\s+usuarios/i.test(t)) {
    return "down";
  }
  if (/plana|plano|estable|igual|sin cambio|semana plana/i.test(t)) {
    return "flat";
  }
  return "flat";
}

function buildSystemPromptLegacy(): string {
  return `Eres un analista de marketing web. Respondes SIEMPRE en español, de forma breve y accionable.
Usas solo los datos JSON que recibes; no inventes cifras.
Si userIdFilterActive es false, recuerda en 1 frase que no se puede identificar a la misma persona entre propiedades sin User-ID en los sites, y sugiere filtrar tráfico interno en Admin de GA4.
Si hay filas con error, menciona que alguna propiedad falló sin detallar stack traces.`;
}

function buildUserContentLegacy(payload: TrafficPayloadForInsights): string {
  return `Datos agregados (últimos ${payload.days} días):

${JSON.stringify(payload, null, 2)}

Escribe 4-6 viñetas con lo más destacado: comparación entre propiedades, totales, desequilibrios, y una recomendación práctica. Sin markdown pesado (puedes usar guiones).`;
}

function buildSystemPromptStructured(): string {
  return `Eres un analista de marketing web. Respondes en español, solo con JSON válido (sin markdown, sin texto fuera del JSON).
Usas únicamente los números del JSON de entrada; no inventes métricas.
Tono de alertas: progreso semanal / periodo — incluye % cuando existan sessionsChangePct o sessionsWeekOverWeekPct en la fila del proyecto.
Cada acción debe empezar por el nombre exacto de una propertyDisplayName del JSON, seguido de dos puntos y un espacio.
En "actions", como máximo una cadena por propiedad distinta (prioriza las que más lo necesiten).
Si userIdFilterActive es false, incluye una frase breve en dataNote sobre límites entre propiedades sin User-ID y tráfico interno en Admin de GA4.`;
}

function buildUserContentStructured(payload: TrafficPayloadForInsights): string {
  return `Datos (periodo de ${payload.days} días, compare=${Boolean(payload.compare)}):

${JSON.stringify(payload, null, 2)}

Devuelve ÚNICAMENTE este JSON (claves en inglés, textos en español):
{
  "alerts": [
    { "text": "InstitutoX: +12% sesiones vs semana pasada (mantener).", "trend": "up" },
    { "text": "LorsClub: -8% usuarios, revisar entrada.", "trend": "down" }
  ],
  "actions": [
    "NombreExactoPropiedad: verbo en imperativo + impacto esperado (1 por proyecto como máximo)."
  ],
  "dataNote": "opcional, una sola línea si aplica lo de User-ID / datos"
}

trend debe ser uno de: "up", "down", "flat", "nodata" (inglés, minúsculas).

Reglas:
- alerts: máximo 4 objetos {text, trend}; una sola línea en text; estilo monitor TV / Geckoboard.
- actions: formato "Proyecto: verbo + (contexto breve).", máximo 1 por proyecto.
- Usa sessionsWeekOverWeekPct y sessionsChangePct del JSON cuando existan.`;
}

function normalizeTrend(raw: string | undefined): InsightTrend {
  const x = (raw ?? "").toLowerCase();
  if (x === "up" || x === "down" || x === "flat" || x === "nodata") return x;
  return "flat";
}

export function parseTogetherStructuredJson(content: string): {
  alerts: InsightAlertItem[];
  actions: string[];
  dataNote?: string;
} {
  let t = content.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const o = JSON.parse(t) as {
      alerts?: unknown;
      actions?: unknown;
      dataNote?: unknown;
    };
    const alerts: InsightAlertItem[] = [];
    if (Array.isArray(o.alerts)) {
      for (const item of o.alerts) {
        if (typeof item === "string") {
          const text = item.trim();
          if (text) alerts.push({ text, trend: inferInsightTrendFromText(text) });
        } else if (item && typeof item === "object") {
          const rec = item as Record<string, unknown>;
          const text = typeof rec.text === "string" ? rec.text.trim() : "";
          if (text) {
            alerts.push({
              text,
              trend:
                typeof rec.trend === "string"
                  ? normalizeTrend(rec.trend)
                  : inferInsightTrendFromText(text),
            });
          }
        }
      }
    }
    const actions = Array.isArray(o.actions)
      ? o.actions.map((x) => String(x).trim()).filter(Boolean)
      : [];
    const dataNote =
      typeof o.dataNote === "string" && o.dataNote.trim() ? o.dataNote.trim() : undefined;
    return { alerts, actions, dataNote };
  } catch {
    return {
      alerts: [{ text: t, trend: inferInsightTrendFromText(t) }],
      actions: [],
      dataNote: undefined,
    };
  }
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
        { role: "system", content: buildSystemPromptLegacy() },
        { role: "user", content: buildUserContentLegacy(payload) },
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

export async function summarizeAlertsAndActionsWithTogether(
  payload: TrafficPayloadForInsights,
): Promise<{ alerts: InsightAlertItem[]; actions: string[]; dataNote?: string; model: string }> {
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
      max_tokens: 1200,
      temperature: 0.35,
      messages: [
        { role: "system", content: buildSystemPromptStructured() },
        { role: "user", content: buildUserContentStructured(payload) },
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

  const parsed = parseTogetherStructuredJson(text);
  return { ...parsed, model };
}
