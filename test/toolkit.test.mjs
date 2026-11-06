// Tests con node:test. Ninguno toca el HOME real: todos usan carpetas temporales.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { detect } from "../src/detect.mjs";
import { planSkills, planForArchitecture, resolveModules } from "../src/plan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(ROOT, "catalogo", "catalog.json"), "utf8"));
const tmp = () => mkdtempSync(join(tmpdir(), "toolkit-test-"));
const ids = (list) => list.map((s) => s.id);

// ── build del catálogo ──────────────────────────────────────────────────────

test("catalog.json commiteado está al día", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/build-catalog.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

function copyRepo() {
  const dir = tmp();
  for (const d of ["modulos", "arquitecturas", "catalogo", "assets", "scripts"]) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
  symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"));
  return dir;
}
const build = (dir) => spawnSync(process.execPath, [join(dir, "scripts/build-catalog.mjs")], { encoding: "utf8" });

test("build falla si un módulo no tiene front-matter", () => {
  const dir = copyRepo();
  const p = join(dir, "modulos/legal/MODULO.md");
  writeFileSync(p, readFileSync(p, "utf8").replace(/^---\n[\s\S]*?\n---\n\n/, ""));
  const r = build(dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /legal.*sin front-matter/);
  rmSync(dir, { recursive: true });
});

test("build falla si un módulo cita una skill que no está en el catálogo", () => {
  const dir = copyRepo();
  const p = join(dir, "modulos/mapas/MODULO.md");
  writeFileSync(p, readFileSync(p, "utf8").replace("skills: [mapcn]", "skills: [mapcn, inventada]"));
  const r = build(dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /inventada no está en el catálogo/);
  rmSync(dir, { recursive: true });
});

// ── detección ───────────────────────────────────────────────────────────────

test("detecta agentes, skills globales y su origen sin salir del HOME dado", () => {
  const home = tmp(), cwd = tmp();
  mkdirSync(join(home, ".claude/skills/humanizer"), { recursive: true });
  writeFileSync(join(home, ".claude/skills/humanizer/SKILL.md"), "---\nname: humanizer\n---\n");
  mkdirSync(join(home, ".agents/skills/sin-skill-md"), { recursive: true }); // no cuenta: falta SKILL.md
  writeFileSync(join(home, ".agents/.skill-lock.json"), JSON.stringify({ skills: { humanizer: { source: "blader/humanizer" } } }));
  mkdirSync(join(home, ".codex"));
  const d = detect({ home, cwd });
  assert.deepEqual(d.agents, ["claude-code", "codex"]); // basta con que exista la carpeta del agente
  assert.deepEqual(Object.keys(d.globalSkills), ["humanizer"]);
  assert.deepEqual(d.globalSkills.humanizer, { dirs: ["~/.claude/skills"], source: "blader/humanizer" });
  assert.equal(d.folder.empty, true);
});

// ── plan ────────────────────────────────────────────────────────────────────

test("cierre va siempre y como incluida", () => {
  const p = planSkills(catalog, { modules: [] });
  assert.ok(ids(p.byLevel.incluida).includes("cierre"));
});

test("seguridad-rgpd es obligatoria con auth y no aparece en un proyecto solo de diseño", () => {
  assert.ok(ids(planSkills(catalog, { modules: ["auth"] }).byLevel.obligatoria).includes("seguridad-rgpd"));
  const soloDiseno = planSkills(catalog, { modules: ["diseno"] });
  assert.ok(!Object.values(soloDiseno.byLevel).flat().some((s) => s.id === "seguridad-rgpd"));
});

test("un módulo con opciones queda pendiente hasta elegir, y luego trae solo esa skill", () => {
  const sin = planSkills(catalog, { modules: ["datos"] });
  assert.deepEqual(sin.pendingOptions, [{ module: "datos", choices: ["neon", "turso", "mongodb"] }]);
  const con = planSkills(catalog, { modules: ["datos"], options: { datos: "turso" } });
  const all = ids(Object.values(con.byLevel).flat());
  assert.ok(all.includes("turso-db"));
  assert.ok(!all.includes("neon-postgres"));
});

test("la colección de Matt Pocock tapa grill-me y tdd sueltas", () => {
  const p = planSkills(catalog, { modules: ["ingenieria", "testing"], options: { ingenieria: "mattpocock" } });
  const all = ids([...Object.values(p.byLevel).flat(), ...p.global]);
  assert.ok(all.includes("mattpocock-skills"));
  assert.ok(!all.includes("grill-me") && !all.includes("tdd"));
});

test("mapas arrastra diseno por requires", () => {
  assert.deepEqual(resolveModules(catalog, ["mapas"]), ["diseno", "mapas"]);
});

test("marca las skills que ya están en global", () => {
  const p = planSkills(catalog, { modules: ["next-react"], globalSkills: { "next-best-practices": { dirs: ["~/.claude/skills"], source: null } } });
  const s = p.byLevel.recomendada.find((x) => x.id === "next-best-practices");
  assert.deepEqual(s.global.dirs, ["~/.claude/skills"]);
});

test("todas las arquitecturas producen un plan sin errores", () => {
  for (const a of Object.keys(catalog.architectures)) planForArchitecture(catalog, { architecture: a });
});

// ── CLI ─────────────────────────────────────────────────────────────────────

const cli = (args, cwd, home) => spawnSync(process.execPath, [join(ROOT, "bin/toolkit.mjs"), ...args], {
  cwd, encoding: "utf8", env: { ...process.env, TOOLKIT_HOME: home },
});

test("--dry-run enseña el plan y no escribe nada", () => {
  const cwd = tmp(), home = tmp();
  const r = cli(["--preset", "saas", "--option", "datos=neon", "--dry-run"], cwd, home);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /cierre/);
  assert.match(r.stdout, /dry-run: no se ha escrito nada/);
  assert.deepEqual(readdirSync(cwd), []);
  assert.deepEqual(readdirSync(home), []);
});

test("sin --dry-run se niega (esta versión no escribe)", () => {
  const cwd = tmp(), home = tmp();
  const r = cli(["--preset", "saas"], cwd, home);
  assert.equal(r.status, 2);
  assert.deepEqual(readdirSync(cwd), []);
});

test("el plan no muestra rutas absolutas del HOME", () => {
  const cwd = tmp(), home = tmp();
  mkdirSync(join(home, ".claude/skills/humanizer"), { recursive: true });
  writeFileSync(join(home, ".claude/skills/humanizer/SKILL.md"), "x");
  const r = cli(["--preset", "landing", "--dry-run"], cwd, home);
  assert.ok(!r.stdout.includes(home), "el HOME absoluto aparece en la salida");
});

// ── paquete ─────────────────────────────────────────────────────────────────

test("npm pack solo lleva lo de la allowlist", () => {
  const r = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const files = JSON.parse(r.stdout)[0].files.map((f) => f.path);
  for (const f of files) {
    assert.match(f, /^(bin|src|catalogo|modulos|arquitecturas|plantillas|assets)\/|^(package\.json|README\.md|LICENSE)$/, `no debería ir en el paquete: ${f}`);
  }
  assert.ok(files.includes("catalogo/catalog.json"));
});
