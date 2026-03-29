#!/usr/bin/env node
/**
 * Lista proyectos Neon (id + name) usando NEON_API_KEY.
 * Uso: node --env-file=.env.local scripts/list-neon-projects.mjs
 */

const key = process.env.NEON_API_KEY?.trim();
if (!key) {
  console.error("Define NEON_API_KEY (p. ej. node --env-file=.env.local …)");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
};

const base = "https://console.neon.tech/api/v2";

async function main() {
  const orgRes = await fetch(`${base}/users/me/organizations`, { headers });
  const orgText = await orgRes.text();
  if (!orgRes.ok) {
    console.error(orgRes.status, orgText.slice(0, 500));
    process.exit(1);
  }
  const orgJson = JSON.parse(orgText);
  const orgs = orgJson.organizations ?? [];
  if (!orgs.length) {
    console.log("No hay organizaciones.");
    return;
  }

  for (const org of orgs) {
    const orgId = org.id;
    const q = new URLSearchParams({ org_id: orgId, limit: "100" });
    const pr = await fetch(`${base}/projects?${q}`, { headers });
    const pt = await pr.text();
    if (!pr.ok) {
      console.error(org.name, pr.status, pt.slice(0, 300));
      continue;
    }
    const pj = JSON.parse(pt);
    const projects = pj.projects ?? [];
    console.log(`\nOrg: ${org.name} (${orgId})\n`);
    for (const p of projects) {
      console.log(`  ${p.id}\t${p.name}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
