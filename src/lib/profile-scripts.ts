/**
 * Surge profile [Script] section parser (v0.2.1, T11).
 *
 * /v1/scripting returning [] does NOT mean "no scripts" — the profile may
 * still declare scripts. When the API reports none, the Scripts page falls
 * back to parsing the [Script] section of the loaded Configuration:
 *
 *   [Script]
 *   ad-block = type=http-response, requires-body=true, script-path=scripts/ad-block.js
 *   cron-job = cron, script-path=scripts/cron.js
 *   dns = dns scripts/dns.js
 *
 * Line syntax is intentionally lenient: key = value where value may be
 * "type=..., script-path=..." params or a bare "type path" pair. Everything
 * is best-effort — unknown lines are skipped, never fatal.
 */
export interface ProfileScript {
  name: string;
  /** Script type when declared ("http-response", "cron", …) else "script". */
  type: string;
  path?: string;
  /** Marks the fallback data source — "api" entries come from /v1/scripting. */
  source: "profile";
}

const SECTION_RE = /^\[([^\]]+)\]$/;
const TYPE_PARAM_RE = /type\s*=\s*([^,\s]+)/i;
const PATH_PARAM_RE = /(?:script-path|path)\s*=\s*([^,\s]+)/i;
const BARE_PATH_RE = /[^\s,]+\.([A-Za-z0-9]+)/;

export function parseScriptsFromProfile(profileText: string): ProfileScript[] {
  const scripts: ProfileScript[] = [];
  const lines = profileText.split(/\r?\n/);
  let inScriptSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") continue;

    const section = SECTION_RE.exec(line);
    if (section) {
      inScriptSection = section[1].trim().toLowerCase() === "script";
      continue;
    }
    if (!inScriptSection || line.startsWith("#") || line.startsWith(";")) continue;

    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const name = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!name || !value) continue;

    const typeParam = TYPE_PARAM_RE.exec(value)?.[1];
    const pathParam = PATH_PARAM_RE.exec(value)?.[1];
    const barePath = BARE_PATH_RE.exec(value)?.[0];
    const firstToken = value.split(",")[0].trim().split(/\s+/)[0].trim();
    // A bare "type path" pair ("http-response scripts/x.js") uses the first
    // token as type; a lone path ("scripts/x.js") means type is undeclared.
    const type = typeParam ?? (firstToken && !firstToken.includes(".") ? firstToken : "script");

    scripts.push({
      name,
      type: type || "script",
      path: pathParam ?? barePath,
      source: "profile",
    });
  }
  return scripts;
}
