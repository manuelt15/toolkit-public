// `tk new`: de lo elegido (wizard o flags) a un proyecto montado.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { planSkills, resolveModules } from "./plan.mjs";
import { buildOps, applyOps } from "./project.mjs";
import { externalSteps, runSteps } from "./external.mjs";

export const today = () => new Date().toISOString().slice(0, 10);
const stampNow = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

// Skills elegibles para unos módulos, con lo que se marca por defecto
export function skillChoices(catalog, { modules, options, globalSkills }) {
  const p = planSkills(catalog, { modules, options, globalSkills });
  const fixed = [...p.byLevel.incluida, ...p.byLevel.obligatoria];
  return { fixed, recomendadas: p.byLevel.recomendada, opcionales: p.byLevel.opcional, global: p.global, pendingOptions: p.pendingOptions };
}

/**
 * Selección final de skills.
 * @param chosenIds  ids elegidos entre recomendadas y opcionales
 * @param alsoInProject  ids que ya están en global y se quieren también en el proyecto
 */
export function resolveSkills(catalog, choices, chosenIds, alsoInProject = []) {
  const out = [];
  for (const s of choices.fixed) {
    // incluidas y obligatorias van al proyecto aunque estén en global
    out.push({ id: s.id, scope: "proyecto", usarGlobal: false });
  }
  for (const s of [...choices.recomendadas, ...choices.opcionales]) {
    if (!chosenIds.includes(s.id)) continue;
    const usarGlobal = Boolean(s.global) && !alsoInProject.includes(s.id);
    out.push({ id: s.id, scope: usarGlobal ? "global" : "proyecto", usarGlobal });
  }
  for (const s of choices.global) {
    // skills de máquina: si ya están, se anotan; si faltan, se ofrece instalarlas en global
    out.push({ id: s.id, scope: "global", usarGlobal: Boolean(s.global) });
  }
  return out;
}

// Config a partir de flags (modo --yes y --dry-run sin teclado)
export function configFromFlags(catalog, flags, detected, identity) {
  const arch = catalog.architectures[flags.preset];
  if (!arch) throw new Error(`--preset ${flags.preset}: no existe. Opciones: ${Object.keys(catalog.architectures).join(", ")}`);
  const modules = resolveModules(catalog, [...arch.recommended, ...flags.modules]);
  const choices = skillChoices(catalog, { modules, options: flags.options, globalSkills: detected.globalSkills });
  if (choices.pendingOptions.length) {
    throw new Error("Falta elegir: " + choices.pendingOptions.map((p) => `--option ${p.module}=<${p.choices.join("|")}>`).join(" "));
  }
  const chosen = [...choices.recomendadas.map((s) => s.id), ...flags.skills];
  return {
    description: flags.description ?? "",
    architecture: flags.preset,
    modules,
    options: flags.options,
    skills: resolveSkills(catalog, choices, chosen, flags.alsoInProject),
    design: flags.design,
    identity: identity.chosen,
    identityReason: identity.reason,
    agents: detected.agents,
    date: today(),
  };
}

/** Escribe el proyecto. `consent`: "todos" | "obligatorios" | "ninguno" para comandos de terceros. */
export function execute(config, catalog, { cwd, root, version, dryRun, consent = "ninguno", runner, log = console.log }) {
  const steps = externalSteps(catalog, config.skills, config.agents);
  const stamp = stampNow();

  // 1. Ficheros (con todas las externas como pendientes; se actualiza tras ejecutar)
  for (const s of config.skills) {
    const c = catalog.skills[s.id];
    if (c.origen !== "externa") continue;
    s.estado = s.usarGlobal ? "global" : "pendiente";
    const step = steps.find((x) => x.id === s.id && x.kind === "run");
    s.comando = step?.text ?? null;
  }
  config.manual = steps.filter((x) => x.kind === "manual").map((x) => x.text);
  const report = applyOps(cwd, buildOps(config, catalog, { root, version }), { dryRun, stamp });
  log(report.join("\n"));

  // 2. git init e identidad (antes de las externas: así `npx skills` ve un proyecto)
  if (!dryRun) {
    if (!existsSync(join(cwd, ".git"))) execFileSync("git", ["init", "-q", "-b", "main"], { cwd });
    if (config.identity) {
      execFileSync("git", ["config", "user.email", config.identity.email], { cwd });
      if (config.identity.name) execFileSync("git", ["config", "user.name", config.identity.name], { cwd });
    }
  }
  log(`  ${dryRun ? "·" : "+"} git: ${config.identity ? `identidad ${config.identity.label} (${config.identityReason})` : "sin fijar identidad (queda en pending.md)"}`);

  // 3. Comandos de terceros, solo con consentimiento
  const allowed = steps.filter((s) => s.kind === "run" && (consent === "todos" || (consent === "obligatorios" && s.obligatoria)));
  const manual = steps.filter((s) => s.kind === "manual");
  if (dryRun) {
    for (const s of steps.filter((x) => x.kind === "run")) log(`  · ejecutaría: ${s.text}`);
  } else if (allowed.length) {
    const results = runSteps(allowed, { cwd, runner });
    for (const r of results) {
      const s = config.skills.find((x) => x.id === r.id);
      if (r.ok) s.estado = "instalada";
      log(`  ${r.ok ? "+" : "!"} ${r.text}${r.ok ? "" : "  (falló: queda en pending.md)"}`);
    }
    // Lock y pending reflejan lo que de verdad se instaló
    const fresh = buildOps(config, catalog, { root, version }).filter((o) => ["toolkit.lock.json", "memory/pending.md", "AGENTS.md"].includes(o.path));
    for (const o of fresh) writeFileSync(join(cwd, o.path), o.content);
  }
  for (const m of manual) log(`  · paso manual: ${m.text}`);
  return { steps, manual };
}

export function folderIsSafe(cwd) {
  return resolve(cwd) !== resolve(process.env.HOME ?? "/");
}
