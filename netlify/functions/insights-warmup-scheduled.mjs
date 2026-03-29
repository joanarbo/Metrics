/**
 * Netlify Scheduled Function: llama a /api/cron/insights-warmup con CRON_SECRET.
 * Variables en el sitio: URL (o DEPLOY_PRIME_URL), CRON_SECRET, y las mismas que usa Next (DATABASE_URL, Google, Together, etc.).
 */
export default async () => {
  const urlBase = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const secret = process.env.CRON_SECRET;
  if (!urlBase || !secret) {
    console.error("insights-warmup-scheduled: falta URL o CRON_SECRET");
    return;
  }
  const res = await fetch(`${urlBase.replace(/\/$/, "")}/api/cron/insights-warmup`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  console.log("insights-warmup-scheduled", res.status, text.slice(0, 500));
};
