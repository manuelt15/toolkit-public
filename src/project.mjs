// Qué se escribe en el proyecto. buildOps es pura (decide), applyOps hace la E/S
// (con backup de lo que ya exista). Así el dry-run y los tests ven exactamente lo mismo.
import { createHash } from "node:crypto";
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, statSync,
  renameSync, symlinkSync, readlinkSync, lstatSync, appendFileSync,
} from "node:fs";
import { join, dirname, basename, extname, relative } from "node:path";

export const GITIGNORE = [".env*", "!.env.example", "node_modules/", ".DS_Store", "*.bak-toolkit-*"];

// Hash estable de una carpeta: ruta relativa + contenido de cada fichero, en orden
export function hashDir(dir) {
  const h = createHash("sha256");
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(relative(dir, p)).update("\0").update(readFileSync(p)).update("\0");
    }
  };
  walk(dir);
  return "sha256-" + h.digest("hex").slice(0, 16);
}

export function agentsMd(config, catalog, version) {
  const skill = (id) => catalog.skills[id];
  const inProject = config.skills.filter((s) => s.scope === "proyecto").map((s) => ({ ...skill(s.id), estado: s.estado }));
  const fromGlobal = config.skills.filter((s) => s.scope === "global").map((s) => skill(s.id));
  const L = [];
  L.push(`<!-- toolkit:public v${version} -->`);
  L.push("## Flujo de sesión (obligatorio)");
  L.push("- Al empezar: ejecuta `tk start` y lee lo que imprime (si no tienes `tk`, lee");
  L.push("  `memory/MEMORY.md`). Lee `memory/pending.md` antes de proponer trabajo.");
  L.push("- Al terminar una sesión con cambios: skill `cierre`. Con `tk`: `tk close`, rellena los");
  L.push("  huecos que deja y `tk close --commit` (commit de memory/ sin push). No termines sin hacerlo.");
  L.push("- Una memoria es una foto del momento: comprueba ficheros y funciones contra el código antes");
  L.push("  de darlos por ciertos.");
  L.push("");
  L.push("## Skills de este proyecto");
  for (const s of inProject) L.push(`- \`${s.id}\`: ${s.para_que}${s.estado === "pendiente" ? " (pendiente de instalar: ver memory/pending.md)" : ""}`);
  if (fromGlobal.length) {
    L.push("");
    L.push(`Además, desde la instalación global de cada máquina: ${fromGlobal.map((s) => `\`${s.id}\``).join(", ")}.`);
  }
  if (config.modules.includes("diseno")) {
    L.push("");
    L.push("## Diseño");
    L.push("- No generes diseños genéricos de shadcn. Toda UI sale de `DESIGN.md`; si falta un token,");
    L.push("  pregunta en vez de inventarlo.");
    L.push("- shadcn sobre Radix: `npx shadcn@latest init --base radix`.");
  }
  if (config.modules.length) {
    L.push("");
    L.push("## Módulos");
    L.push("Guía de cada módulo (qué incluye, decisiones, instalación y cumplimiento) en");
    L.push("`docs/toolkit/modulos/`. Léela antes de tocar esa parte.");
  }
  L.push("<!-- /toolkit:public -->");
  L.push("");
  if (config.profile?.block) {
    L.push(`<!-- toolkit:profile ${config.profile.nombre} -->`);
    L.push(config.profile.block);
    L.push("<!-- /toolkit:profile -->");
    L.push("");
  }
  L.push("<!-- toolkit:project -->");
  L.push("## Este proyecto");
  L.push(config.description?.trim() || "(describe aquí qué es y para quién)");
  L.push("");
  L.push(`- Arquitectura: ${catalog.architectures[config.architecture].title}`);
  L.push(`- Módulos: ${config.modules.join(", ") || "ninguno"}`);
  const opts = Object.entries(config.options ?? {});
  if (opts.length) L.push(`- Opciones: ${opts.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  L.push("- Memoria: `memory/`");
  L.push("<!-- /toolkit:project -->");
  return L.join("\n") + "\n";
}

function pendingMd(config, catalog, root) {
  const tpl = readFileSync(join(root, "plantillas/memory/pending.md"), "utf8");
  const items = [];
  if (config.modules.includes("diseno")) {
    const origen = { file: "tu DESIGN.md", tokens: "tus tokens en `design/`", figma: "Figma", reference: "una referencia de getdesign.md" }[config.design?.kind] ?? "tu sistema de diseño";
    items.push(`- Completar \`DESIGN.md\` a partir de ${origen} antes de la primera pantalla.`);
  }
  for (const id of config.modules) items.push(`- Módulo \`${id}\`: ${catalog.modules[id].gives}. Pasos en \`docs/toolkit/modulos/${id}.md\`.`);
  if (config.skills.some((s) => s.id === "seguridad-rgpd")) items.push("- Revisar los puntos de `seguridad-rgpd` que aplican, antes de lanzar.");
  for (const s of config.skills.filter((x) => x.estado === "pendiente" && x.comando)) {
    items.push(`- Instalar la skill \`${s.id}\`: \`${s.comando}\``);
  }
  for (const t of config.manual ?? []) items.push(`- Paso manual: ${t}`);
  if (!config.identity) items.push("- Fijar la identidad de git del repo (`git config user.email ...`) antes del primer commit.");
  return tpl.replace("## ⏳ Abierto\n", `## ⏳ Abierto\n\n${items.join("\n")}\n`);
}

function designOps(config, root) {
  const tpl = readFileSync(join(root, "plantillas/DESIGN.md"), "utf8");
  const d = config.design ?? { kind: "reference" };
  if (d.kind === "file") return [{ type: "copyFile", path: "DESIGN.md", from: d.value }];
  const ops = [];
  let origen;
  if (d.kind === "tokens") {
    const dest = `design/tokens${extname(d.value) || ".txt"}`;
    ops.push({ type: "copyFile", path: dest, from: d.value });
    origen = `tokens en \`${dest}\` (pasarlos a las tablas de abajo)`;
  } else if (d.kind === "figma") {
    origen = `Figma: ${d.value}`;
  } else {
    origen = "pendiente: elegir con el usuario una referencia de getdesign.md y adaptarla";
  }
  ops.push({ type: "file", path: "DESIGN.md", content: tpl.replace(/^# DESIGN\.md\n/, `# DESIGN.md\n\n> **Origen de este proyecto:** ${origen}\n`) });
  return ops;
}

/** Lista de operaciones. No toca el disco salvo para leer plantillas del paquete. */
export function buildOps(config, catalog, { root, version }) {
  const ops = [];
  ops.push({ type: "file", path: "AGENTS.md", content: agentsMd(config, catalog, version) });
  ops.push({ type: "file", path: "CLAUDE.md", content: "@AGENTS.md\n" });
  ops.push({ type: "file", path: "memory/MEMORY.md", content: readFileSync(join(root, "plantillas/memory/MEMORY.md"), "utf8").replace("(fecha de creación)", `(${config.date})`) });
  ops.push({ type: "file", path: "memory/pending.md", content: pendingMd(config, catalog, root) });
  ops.push({ type: "file", path: "memory/lessons.md", content: readFileSync(join(root, "plantillas/memory/lessons.md"), "utf8") });
  ops.push({ type: "file", path: "memory/topics/.gitkeep", content: "" });
  ops.push({ type: "file", path: "memory/handovers-archive/.gitkeep", content: "" });
  ops.push({ type: "lines", path: ".gitignore", lines: GITIGNORE });
  if (config.modules.includes("diseno")) ops.push(...designOps(config, root));
  for (const id of config.modules) {
    ops.push({ type: "copyFile", path: `docs/toolkit/modulos/${id}.md`, from: join(root, "modulos", id, "MODULO.md") });
  }

  const own = config.skills.filter((s) => s.scope === "proyecto" && catalog.skills[s.id].origen === "propia");
  for (const s of own) ops.push({ type: "copyDir", path: `.agents/skills/${s.id}`, from: join(root, "assets/skills", s.id) });
  // Claude lee .claude/skills: enlace relativo dentro del repo, viaja con él
  ops.push({ type: "symlink", path: ".claude/skills", target: "../.agents/skills" });
  // Claude Code: el brief llega solo al abrir sesión. Si ya hay settings, no se toca.
  ops.push({ type: "file", ifMissing: true, path: ".claude/settings.json", content: JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "command -v tk >/dev/null 2>&1 && tk start || true" }] }] },
  }, null, 2) + "\n" });
  // Hermes lee .hermes/skills (una entrada por skill, como hace `npx skills`)
  if (config.agents.includes("hermes-agent")) {
    for (const s of own) ops.push({ type: "symlink", path: `.hermes/skills/${s.id}`, target: `../../.agents/skills/${s.id}` });
  }

  const lock = {
    toolkit: version,
    creado: config.date,
    arquitectura: config.architecture,
    modulos: config.modules,
    opciones: config.options ?? {},
    agentes: config.agents,
    perfil: config.profile?.nombre ?? null,
    git: config.identity ? { cuenta: config.identity.label, motivo: config.identityReason } : null,
    diseno: config.modules.includes("diseno") ? { origen: config.design?.kind ?? "reference" } : null,
    skills: config.skills.map((s) => {
      const c = catalog.skills[s.id];
      const base = { id: s.id, scope: s.scope, origen: c.origen, nivel: c.nivel };
      if (c.origen === "propia") return { ...base, version, hash: s.scope === "proyecto" ? hashDir(join(root, "assets/skills", s.id)) : null };
      return { ...base, repo: c.repo, estado: s.estado };
    }),
  };
  ops.push({ type: "file", path: "toolkit.lock.json", content: JSON.stringify(lock, null, 2) + "\n" });
  return ops;
}

function backup(abs, stamp) {
  const to = `${abs}.bak-toolkit-${stamp}`;
  renameSync(abs, to);
  return basename(to);
}

/** Aplica las operaciones en cwd. Devuelve líneas de informe. Con dryRun no escribe nada. */
export function applyOps(cwd, ops, { dryRun = false, stamp }) {
  const report = [];
  const say = (sym, path, note = "") => report.push(`  ${sym} ${path}${note ? `  (${note})` : ""}`);
  for (const op of ops) {
    const abs = join(cwd, op.path);
    const exists = existsSync(abs) || (() => { try { lstatSync(abs); return true; } catch { return false; } })();
    if (op.type === "lines") {
      const current = existsSync(abs) ? readFileSync(abs, "utf8").split("\n") : [];
      const missing = op.lines.filter((l) => !current.includes(l));
      if (!missing.length) { say("=", op.path); continue; }
      say(exists ? "~" : "+", op.path, exists ? `añade ${missing.length} línea(s)` : "");
      if (!dryRun) {
        const sep = exists && current.at(-1) !== "" ? "\n" : "";
        appendFileSync(abs, sep + missing.join("\n") + "\n");
      }
      continue;
    }
    if (op.type === "symlink") {
      if (exists) {
        const same = lstatSync(abs).isSymbolicLink() && readlinkSync(abs) === op.target;
        say(same ? "=" : "!", op.path, same ? "" : "ya existe y no es el enlace esperado: no se toca");
        continue;
      }
      say("+", op.path, `enlace a ${op.target}`);
      if (!dryRun) { mkdirSync(dirname(abs), { recursive: true }); symlinkSync(op.target, abs); }
      continue;
    }
    if (op.type === "copyDir") {
      if (exists) {
        say("↻", op.path, dryRun ? "se guardaría copia" : `copia en ${backup(abs, stamp)}`);
      } else say("+", op.path);
      if (!dryRun) { mkdirSync(dirname(abs), { recursive: true }); cpSync(op.from, abs, { recursive: true }); }
      continue;
    }
    const content = op.type === "copyFile" ? readFileSync(op.from) : Buffer.from(op.content);
    if (exists && readFileSync(abs).equals(content)) { say("=", op.path); continue; }
    if (exists && op.ifMissing) { say("!", op.path, "ya existe: no se toca; añade el hook a mano si lo quieres"); continue; }
    if (exists) say("↻", op.path, dryRun ? "se guardaría copia" : `copia en ${backup(abs, stamp)}`);
    else say("+", op.path);
    if (!dryRun) { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, content); }
  }
  return report;
}
