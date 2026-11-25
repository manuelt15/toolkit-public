// Comandos de terceros para las skills externas. Se enseñan siempre antes de ejecutarlos y
// se ejecutan solo con consentimiento. Los plugins de Claude no se ejecutan: quedan como paso
// manual, porque algunos piden antes añadir su marketplace.
import { spawnSync } from "node:child_process";

// Solo agentes conocidos: la lista puede venir de un lock que viaja con un repo ajeno
export const AGENT_IDS = ["claude-code", "codex", "hermes-agent"];
export const knownAgents = (agents) => (agents ?? []).filter((a) => AGENT_IDS.includes(a));
const agentFlags = (agents) => agents.flatMap((a) => ["-a", a]);

/**
 * @param skills  [{ id, scope, usarGlobal }]  lo elegido para el proyecto
 * @param agents  agentes detectados (claude-code, codex, hermes-agent)
 * @returns [{ id, kind: "run"|"manual", argv?, text, obligatoria }]
 */
export function externalSteps(catalog, skills, agentsIn) {
  const steps = [];
  const agents = knownAgents(agentsIn);
  for (const sel of skills) {
    if (!Object.hasOwn(catalog.skills, sel.id)) continue;
    const s = catalog.skills[sel.id];
    if (s.origen !== "externa" || sel.usarGlobal) continue;
    const obligatoria = s.nivel === "obligatoria";
    const runnable = typeof s.instalar === "string" && s.instalar.startsWith("npx skills add ");
    let targets = agents;
    if (s.plugin_claude && agents.includes("claude-code")) {
      steps.push({ id: s.id, kind: "manual", obligatoria, text: `En Claude Code: /plugin install ${s.plugin_claude} (si pide marketplace, ver docs/toolkit/modulos)` });
      targets = agents.filter((a) => a !== "claude-code");
    }
    if (!targets.length) continue;
    if (!s.instalar) continue; // solo existe como plugin de Claude (security-guidance)
    if (!runnable) {
      steps.push({ id: s.id, kind: "manual", obligatoria, text: s.instalar ? s.instalar.replace("{agentes}", agentFlags(targets).join(" ")) : `Ver ${s.repo}` });
      continue;
    }
    const argv = s.instalar.split(" ").flatMap((t) => (t === "{agentes}" ? agentFlags(targets) : [t]));
    argv.push("-y");
    steps.push({ id: s.id, kind: "run", obligatoria, global: s.scope === "global", aviso: s.aviso ?? null, argv, text: argv.join(" ") });
  }
  return steps;
}

/** Ejecuta los pasos "run". `runner` se inyecta en los tests para no tocar la red. */
export function runSteps(steps, { cwd, runner = defaultRunner }) {
  return steps.filter((s) => s.kind === "run").map((s) => {
    console.log(`  → ejecutando: ${s.argv.join(" ")}`); // siempre se ve el comando completo antes
    return { ...s, ok: runner(s.argv, cwd) };
  });
}

function defaultRunner(argv, cwd) {
  const r = spawnSync(argv[0], argv.slice(1), { cwd, stdio: "inherit" });
  return r.status === 0;
}

// El catálogo guarda owner/repo (lo que entiende npx); git necesita la URL
const repoUrl = (repo) => (/^[\w.-]+\/[\w.-]+$/.test(repo) ? `https://github.com/${repo}.git` : repo);

/**
 * Revisión que hay ahora mismo en la rama por defecto del repo (git ls-remote HEAD).
 * Solo deja constancia de lo instalado: no fija nada. Sin red o si falla devuelve null
 * y la instalación sigue adelante. `lsRemote` se inyecta en los tests para no salir a la red.
 */
export function revisionOf(repo, { lsRemote = lsRemoteHead } = {}) {
  try {
    const sha = String(lsRemote(repoUrl(repo)) ?? "").trim().split(/\s+/)[0];
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

function lsRemoteHead(url) {
  const r = spawnSync("git", ["ls-remote", url, "HEAD"], { encoding: "utf8", timeout: 20000 });
  return r.status === 0 ? r.stdout : null;
}
