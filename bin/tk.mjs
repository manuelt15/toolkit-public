#!/usr/bin/env node
// CLI del toolkit (comando `tk`).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { detect } from "../src/detect.mjs";
import { detectIdentities, pickIdentity } from "../src/identity.mjs";
import { configFromFlags, execute, folderIsSafe } from "../src/new.mjs";
import { externalSteps } from "../src/external.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

const HELP = `Uso: tk [new] [opciones]

Sin opciones y en una terminal: wizard interactivo.
Sin teclado (CI, VM, la skill nuevo-proyecto): --preset y --yes o --dry-run.

  --preset <id>          saas, landing, agente-ia, api, herramienta
  --modules <a,b>        módulos que añadir a los recomendados
  --option <mod=op>      opción de un módulo (datos=neon, ingenieria=mattpocock...)
  --skills <a,b>         skills opcionales que añadir
  --also-in-project <a,b>  skills que ya están en global y se quieren también en el proyecto
  --description <texto>  qué es el proyecto, en una frase
  --design <x>           ruta a DESIGN.md o tokens, enlace de Figma, o "reference"
  --git <email|cuenta>   identidad de git si hay varias
  --install <modo>       comandos de terceros: todos | obligatorios | ninguno (por defecto ninguno)
  --dry-run              enseña lo que haría, sin escribir nada
  --yes                  aplica sin preguntar
  -h, --help
  -v, --version`;

function designFromFlag(v) {
  if (!v) return null;
  if (v === "reference") return { kind: "reference", value: null };
  if (/^https:\/\/(www\.)?figma\.com\//.test(v)) return { kind: "figma", value: v };
  const abs = resolve(v);
  return { kind: abs.endsWith(".md") ? "file" : "tokens", value: abs };
}

async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      preset: { type: "string" },
      modules: { type: "string", default: "" },
      option: { type: "string", multiple: true, default: [] },
      skills: { type: "string", default: "" },
      "also-in-project": { type: "string", default: "" },
      description: { type: "string" },
      design: { type: "string" },
      git: { type: "string" },
      install: { type: "string", default: "ninguno" },
      "dry-run": { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });
  if (values.help) { console.log(HELP); return 0; }
  if (values.version) { console.log(VERSION); return 0; }
  const cmd = positionals[0] ?? "new";
  if (cmd !== "new") { console.error(`Comando desconocido: ${cmd}\n\n${HELP}`); return 2; }
  if (!["todos", "obligatorios", "ninguno"].includes(values.install)) { console.error("--install: todos | obligatorios | ninguno"); return 2; }

  const cwd = process.cwd();
  if (!folderIsSafe(cwd)) { console.error("No se monta un proyecto en tu carpeta personal. Crea una carpeta para el proyecto."); return 2; }
  const home = process.env.TOOLKIT_HOME ?? homedir();
  const catalog = JSON.parse(readFileSync(join(ROOT, "catalogo", "catalog.json"), "utf8"));
  const detected = detect({ home, cwd });
  const ids = detectIdentities({ home, cwd });
  const dryRun = values["dry-run"];
  const interactive = !values.yes && !dryRun && process.stdin.isTTY && process.stdout.isTTY;

  if (interactive) {
    const w = await import("../src/wizard.mjs");
    const config = await w.runWizard(catalog, detected, { detected: ids });
    const steps = externalSteps(catalog, config.skills, config.agents);
    const summary = [
      `Arquitectura: ${catalog.architectures[config.architecture].title}`,
      `Módulos: ${config.modules.join(", ") || "ninguno"}`,
      `Skills en el proyecto: ${config.skills.filter((s) => s.scope === "proyecto").map((s) => s.id).join(", ")}`,
      `Desde global: ${config.skills.filter((s) => s.usarGlobal).map((s) => s.id).join(", ") || "ninguna"}`,
      `Git: ${config.identity ? config.identity.label : "sin fijar"}`,
      `Escribe: AGENTS.md, CLAUDE.md, memory/, toolkit.lock.json, .agents/skills/${config.modules.includes("diseno") ? ", DESIGN.md" : ""}`,
    ].join("\n");
    if (!(await w.confirmApply(summary))) { w.outro("No se ha escrito nada."); return 0; }
    const consent = await w.askConsent(steps);
    execute(config, catalog, { cwd, root: ROOT, version: VERSION, dryRun: false, consent });
    w.outro("Proyecto listo. Abre tu agente aquí: leerá AGENTS.md y memory/pending.md.");
    return 0;
  }

  if (!values.preset) { console.error(`Sin terminal interactiva hace falta --preset.\n\n${HELP}`); return 2; }
  if (!values.yes && !dryRun) { console.error("Añade --yes para aplicar o --dry-run para ver el plan."); return 2; }
  const identity = { chosen: pickIdentity(ids, values.git), reason: values.git ? "elegida con --git" : ids.reason };
  if (identity.chosen && !identity.chosen.name) identity.chosen = { ...identity.chosen, name: ids.candidates.find((c) => c.name)?.name ?? null };
  const config = configFromFlags(catalog, {
    preset: values.preset,
    modules: values.modules.split(",").filter(Boolean),
    options: Object.fromEntries(values.option.map((o) => o.split("="))),
    skills: values.skills.split(",").filter(Boolean),
    alsoInProject: values["also-in-project"].split(",").filter(Boolean),
    description: values.description,
    design: designFromFlag(values.design),
  }, detected, identity);
  console.log(`${dryRun ? "Plan (dry-run: no se escribe nada)" : "Aplicando"} en ${detected.folder.empty ? "carpeta vacía" : "carpeta con contenido"}:`);
  execute(config, catalog, { cwd, root: ROOT, version: VERSION, dryRun, consent: values.install });
  return 0;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
