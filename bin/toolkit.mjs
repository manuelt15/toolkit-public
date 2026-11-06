#!/usr/bin/env node
// CLI del toolkit. En esta versión solo enseña el plan (--dry-run): no escribe nada.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { detect } from "../src/detect.mjs";
import { planForArchitecture } from "../src/plan.mjs";
import { renderPlan } from "../src/render.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HELP = `Uso: toolkit [new] --preset <arquitectura> --dry-run [opciones]

  --preset <id>        saas, landing, agente-ia, api, herramienta
  --modules <a,b>      módulos opcionales a añadir
  --option <mod=op>    elegir opción de un módulo (datos=neon, ingenieria=mattpocock...)
  --dry-run            enseña lo que haría, sin escribir nada
  -h, --help

Estado: en desarrollo. Solo funciona --dry-run.`;

function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      preset: { type: "string" },
      modules: { type: "string", default: "" },
      option: { type: "string", multiple: true, default: [] },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) { console.log(HELP); return 0; }
  const cmd = positionals[0] ?? "new";
  if (cmd !== "new") { console.error(`Comando desconocido: ${cmd}\n\n${HELP}`); return 2; }
  if (!values["dry-run"]) {
    console.error("Esta versión solo enseña el plan. Añade --dry-run.");
    return 2;
  }
  if (!values.preset) { console.error(`Falta --preset.\n\n${HELP}`); return 2; }

  const catalog = JSON.parse(readFileSync(join(ROOT, "catalogo", "catalog.json"), "utf8"));
  const options = Object.fromEntries(values.option.map((o) => o.split("=")));
  const detected = detect({ home: process.env.TOOLKIT_HOME ?? homedir(), cwd: process.cwd() });
  const plan = planForArchitecture(catalog, {
    architecture: values.preset,
    extraModules: values.modules.split(",").filter(Boolean),
    options,
    globalSkills: detected.globalSkills,
  });
  console.log(renderPlan({ plan, detected }));
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
