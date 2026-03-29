/* Carga .env.local sin dependencias (solo líneas KEY=VAL). */
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const { v1beta } = require("@google-analytics/admin");

async function main() {
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!keyFilename) {
    console.error("Falta GOOGLE_APPLICATION_CREDENTIALS en .env.local");
    process.exit(1);
  }

  const client = new v1beta.AnalyticsAdminServiceClient({
    keyFilename,
    ...(projectId ? { projectId } : {}),
  });

  const [rows] = await client.listAccountSummaries({ pageSize: 200 });
  console.log("OK — Admin API responde. Cuentas en accountSummaries:", rows.length);
  for (const s of rows) {
    console.log(" -", s.displayName, "|", s.account);
  }
}

main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
