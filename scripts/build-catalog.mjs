#!/usr/bin/env node
// Genera catalogo/catalog.json desde el front-matter de modulos/ y arquitecturas/ y desde
// catalogo/skills.yaml. Valida que todo cuadre y falla si no. `--check` no escribe: solo
// comprueba que el catalog.json commiteado está al día (lo usan los tests).
import { readFileSync, writeFileSync, readdirSync, existsSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "catalogo", "catalog.json");
const NIVELES = ["incluida", "obligatoria", "recomendada", "opcional"];
const errors = [];

function frontMatter(path) {
  const text = readFileSync(path, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) { errors.push(`${path.replace(ROOT + "/", "")}: sin front-matter`); return null; }
  return { data: parse(m[1]), body: text.slice(m[0].length) };
}

export function build(root = ROOT) {
  const modules = {};
  for (const dir of readdirSync(join(root, "modulos"), { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const fm = frontMatter(join(root, "modulos", dir.name, "MODULO.md"));
    if (!fm) continue;
    const m = fm.data;
    for (const f of ["id", "title", "when", "gives", "costs", "requires", "skills"]) {
      if (!(f in m)) errors.push(`módulo ${dir.name}: falta ${f}`);
    }
    if (m.id !== dir.name) errors.push(`módulo ${dir.name}: id "${m.id}" no coincide con la carpeta`);
    modules[dir.name] = { conflicts: [], options: null, ...m };
  }

  const architectures = {};
  for (const file of readdirSync(join(root, "arquitecturas"))) {
    if (!file.endsWith(".md") || file === "README.md") continue;
    const fm = frontMatter(join(root, "arquitecturas", file));
    if (!fm) continue;
    const a = fm.data, id = file.replace(/\.md$/, "");
    if (a.id !== id) errors.push(`arquitectura ${id}: id "${a.id}" no coincide con el fichero`);
    for (const mk of [...(a.recommended ?? []), ...(a.optional ?? [])]) {
      if (!modules[mk]) errors.push(`arquitectura ${id}: el módulo ${mk} no existe`);
    }
    // El texto legible y el front-matter no pueden divergir
    const list = (label) => (fm.body.match(new RegExp(`\\*\\*${label}:\\*\\* (.*)`))?.[1] ?? "")
      .split(/,\s*/).map((x) => x.match(/^[\w-]+/)?.[0]).filter(Boolean);
    if (list("Recomendados").join() !== (a.recommended ?? []).join()) errors.push(`arquitectura ${id}: recomendados del texto y del front-matter no coinciden`);
    if (list("Opcionales").join() !== (a.optional ?? []).join()) errors.push(`arquitectura ${id}: opcionales del texto y del front-matter no coinciden`);
    architectures[id] = a;
  }

  const skillsList = parse(readFileSync(join(root, "catalogo", "skills.yaml"), "utf8"));
  const skills = {};
  for (const s of skillsList) {
    if (skills[s.id]) errors.push(`skill ${s.id}: id repetido`);
    for (const f of ["id", "para_que", "origen", "scope", "cuando", "nivel", "licencia"]) {
      if (!(f in s)) errors.push(`skill ${s.id}: falta ${f}`);
    }
    if (!NIVELES.includes(s.nivel)) errors.push(`skill ${s.id}: nivel desconocido "${s.nivel}"`);
    if (s.origen === "externa" && !s.repo) errors.push(`skill ${s.id}: externa sin repo`);
    if (s.origen === "propia" && !existsSync(join(root, "assets", "skills", s.id, "SKILL.md"))) {
      errors.push(`skill ${s.id}: propia pero falta assets/skills/${s.id}/SKILL.md`);
    }
    if (s.verificado instanceof Date) s.verificado = s.verificado.toISOString().slice(0, 10);
    skills[s.id] = { conflicts_with: [], plugin_claude: null, instalar: null, ...s };
  }

  for (const [k, m] of Object.entries(modules)) {
    for (const r of m.requires ?? []) if (!modules[r]) errors.push(`módulo ${k}: requires ${r} no existe`);
    for (const id of m.skills ?? []) {
      if (!skills[id]) { errors.push(`módulo ${k}: la skill ${id} no está en el catálogo`); continue; }
      const c = skills[id].cuando;
      if (!c.siempre && !(c.modulos ?? []).includes(k)) errors.push(`skill ${id}: no lista el módulo ${k} en cuando`);
    }
    for (const [op, ids] of Object.entries(m.options ?? {})) {
      for (const id of ids) {
        if (!skills[id]) { errors.push(`módulo ${k}/${op}: la skill ${id} no está en el catálogo`); continue; }
        if (skills[id].cuando.opcion !== op) errors.push(`skill ${id}: cuando.opcion debería ser ${op}`);
      }
    }
  }
  for (const s of Object.values(skills)) {
    for (const c of s.conflicts_with) if (!skills[c]) errors.push(`skill ${s.id}: conflicts_with ${c} no existe`);
    for (const c of s.incluye ?? []) if (!skills[c]) errors.push(`skill ${s.id}: incluye ${c} no existe`);
    for (const mk of s.cuando?.modulos ?? []) {
      const m = modules[mk];
      if (!m) { errors.push(`skill ${s.id}: el módulo ${mk} no existe`); continue; }
      const listed = [...(m.skills ?? []), ...Object.values(m.options ?? {}).flat()];
      // Las skills propias transversales (seguridad-rgpd) se activan por módulo sin que el módulo las liste
      if (s.origen !== "propia" && !listed.includes(s.id)) errors.push(`skill ${s.id}: el módulo ${mk} no la lista`);
    }
  }

  return { version: 1, modules, architectures, skills };
}

// realpath: en macOS /var es un enlace a /private/var y las rutas no coincidirían
const isMain = process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) {
  const catalog = build();
  if (errors.length) {
    console.error(`build: ${errors.length} error(es) en el catálogo:\n  ` + errors.join("\n  "));
    process.exit(1);
  }
  const json = JSON.stringify(catalog, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    if (current !== json) { console.error("build: catalog.json no está al día. Ejecuta npm run build."); process.exit(1); }
    console.log("build: catalog.json al día");
  } else {
    writeFileSync(OUT, json);
    const n = (o) => Object.keys(o).length;
    console.log(`build: ${n(catalog.modules)} módulos, ${n(catalog.architectures)} arquitecturas, ${n(catalog.skills)} skills`);
  }
}

export { errors };
