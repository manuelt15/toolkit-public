// Tests con node:test. Ninguno toca el HOME real: todos usan carpetas temporales.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { detect } from "../src/detect.mjs";
import { planSkills, resolveModules } from "../src/plan.mjs";
import { configFromFlags, execute } from "../src/new.mjs";
import { externalSteps } from "../src/external.mjs";
import { detectIdentities } from "../src/identity.mjs";
import { existsSync, readlinkSync } from "node:fs";

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

test("todas las arquitecturas producen config con las opciones elegidas", () => {
  const det = { agents: [], globalSkills: {} };
  const opts = { datos: "neon", "agentes-ia": "ai-sdk", ingenieria: "mattpocock" };
  for (const a of Object.keys(catalog.architectures)) {
    configFromFlags(catalog, { preset: a, modules: [], options: opts, skills: [], alsoInProject: [] }, det, { chosen: null, reason: "" });
  }
});

test("sin elegir la opción de un módulo, el modo --yes falla y dice qué falta", () => {
  assert.throws(
    () => configFromFlags(catalog, { preset: "saas", modules: [], options: {}, skills: [], alsoInProject: [] }, { agents: [], globalSkills: {} }, { chosen: null }),
    /--option datos=<neon\|turso\|mongodb>/,
  );
});

// ── CLI ─────────────────────────────────────────────────────────────────────

const cli = (args, cwd, home) => spawnSync(process.execPath, [join(ROOT, "bin/tk.mjs"), ...args], {
  cwd, encoding: "utf8", env: { ...process.env, TOOLKIT_HOME: home },
});

test("--dry-run enseña el plan y no escribe nada", () => {
  const cwd = tmp(), home = tmp();
  const r = cli(["--preset", "saas", "--option", "datos=neon", "--dry-run"], cwd, home);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\.agents\/skills\/cierre/);
  assert.match(r.stdout, /dry-run: no se escribe nada/);
  assert.deepEqual(readdirSync(cwd), []);
  assert.deepEqual(readdirSync(home), []);
});

test("sin terminal y sin --yes ni --dry-run se niega", () => {
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

// ── escritura del proyecto ─────────────────────────────────────────────────

const ROOTS = { root: ROOT, version: "0.0.0-test" };
const quiet = () => {};
function newConfig(extra = {}) {
  const det = { agents: ["claude-code", "codex", "hermes-agent"], globalSkills: {} };
  return configFromFlags(catalog, { preset: "landing", modules: [], options: {}, skills: [], alsoInProject: [], description: "Web de prueba", design: { kind: "reference" }, ...extra }, det, { chosen: { label: "global", name: "Test", email: "test@example.org" }, reason: "única identidad detectada" });
}

test("aplica: ficheros, skills propias copiadas, enlaces relativos, git y lock", () => {
  const cwd = tmp();
  const runner = () => assert.fail("no debe ejecutar comandos de terceros sin consentimiento");
  execute(newConfig(), catalog, { cwd, ...ROOTS, dryRun: false, consent: "ninguno", runner, log: quiet });
  for (const f of ["AGENTS.md", "CLAUDE.md", "DESIGN.md", "memory/MEMORY.md", "memory/pending.md", "memory/lessons.md", "toolkit.lock.json", ".agents/skills/cierre/SKILL.md", ".gitignore"]) {
    assert.ok(existsSync(join(cwd, f)), `falta ${f}`);
  }
  assert.equal(readlinkSync(join(cwd, ".claude/skills")), "../.agents/skills");
  assert.equal(readlinkSync(join(cwd, ".hermes/skills/cierre")), "../../.agents/skills/cierre");
  const agents = readFileSync(join(cwd, "AGENTS.md"), "utf8");
  assert.match(agents, /<!-- toolkit:public v0\.0\.0-test -->[\s\S]*<!-- \/toolkit:public -->/);
  assert.match(agents, /No generes diseños genéricos de shadcn/);
  assert.match(agents, /--base radix/);
  const lock = JSON.parse(readFileSync(join(cwd, "toolkit.lock.json"), "utf8"));
  assert.equal(lock.arquitectura, "landing");
  assert.equal(lock.git.cuenta, "global");
  assert.ok(!JSON.stringify(lock).includes("test@example.org"), "el lock no guarda el email");
  assert.match(lock.skills.find((s) => s.id === "cierre").hash, /^sha256-/);
  assert.equal(lock.skills.find((s) => s.id === "shadcn").estado, "pendiente");
  const pending = readFileSync(join(cwd, "memory/pending.md"), "utf8");
  assert.match(pending, /Instalar la skill `shadcn`/);
  assert.match(agents, /`shadcn`: .*\(pendiente de instalar/);
  assert.doesNotMatch(agents, /`cierre`: .*pendiente de instalar/);
  const email = spawnSync("git", ["config", "user.email"], { cwd, encoding: "utf8" }).stdout.trim();
  assert.equal(email, "test@example.org");
});

test("repetir no duplica nada y lo que tocó el usuario se guarda como .bak", () => {
  const cwd = tmp();
  const cfg = () => newConfig();
  execute(cfg(), catalog, { cwd, ...ROOTS, dryRun: false, log: quiet });
  writeFileSync(join(cwd, "AGENTS.md"), "editado a mano\n");
  const lines = [];
  execute(cfg(), catalog, { cwd, ...ROOTS, dryRun: false, log: (l) => lines.push(l) });
  const out = lines.join("\n");
  assert.match(out, /↻ AGENTS\.md\s+\(copia en AGENTS\.md\.bak-toolkit-/);
  assert.match(out, /= memory\/lessons\.md/);
  assert.match(out, /= \.gitignore/);
  const bak = readdirSync(cwd).find((f) => f.startsWith("AGENTS.md.bak-toolkit-"));
  assert.equal(readFileSync(join(cwd, bak), "utf8"), "editado a mano\n");
});

test("consentimiento: solo obligatorios ejecuta solo esos y el lock dice qué se instaló", () => {
  const cwd = tmp();
  const ran = [];
  const runner = (argv) => { ran.push(argv.join(" ")); return true; };
  const cfg = newConfig({ preset: "saas", options: { datos: "neon" } });
  execute(cfg, catalog, { cwd, ...ROOTS, dryRun: false, consent: "obligatorios", runner, log: quiet });
  assert.equal(ran.length, 1);
  assert.match(ran[0], /better-auth-security-best-practices/);
  const lock = JSON.parse(readFileSync(join(cwd, "toolkit.lock.json"), "utf8"));
  assert.equal(lock.skills.find((s) => s.id === "better-auth-security-best-practices").estado, "instalada");
  assert.equal(lock.skills.find((s) => s.id === "resend").estado, "pendiente");
  const agents = readFileSync(join(cwd, "AGENTS.md"), "utf8");
  assert.doesNotMatch(agents, /`better-auth-security-best-practices`: .*pendiente de instalar/);
  assert.match(agents, /`resend`: .*pendiente/);
});

test("plugins de Claude: paso manual en Claude y la skill para los demás agentes", () => {
  const steps = externalSteps(catalog, [{ id: "stripe" }, { id: "security-guidance" }], ["claude-code", "codex"]);
  assert.deepEqual(steps.map((s) => [s.id, s.kind]), [["stripe", "manual"], ["stripe", "run"], ["security-guidance", "manual"]]);
  assert.ok(!steps.find((s) => s.kind === "run").argv.includes("claude-code"));
});

test("las skills que ya están en global no se reinstalan salvo que se pidan en el proyecto", () => {
  const det = { agents: ["codex"], globalSkills: { "next-best-practices": { dirs: ["~/.agents/skills"] } } };
  const base = { preset: "landing", modules: [], options: {}, skills: [], design: { kind: "reference" } };
  const a = configFromFlags(catalog, { ...base, alsoInProject: [] }, det, { chosen: null });
  assert.equal(a.skills.find((s) => s.id === "next-best-practices").scope, "global");
  const b = configFromFlags(catalog, { ...base, alsoInProject: ["next-best-practices"] }, det, { chosen: null });
  assert.equal(b.skills.find((s) => s.id === "next-best-practices").scope, "proyecto");
});

// ── identidad git ───────────────────────────────────────────────────────────

function gitHome(main, extra = {}) {
  const home = tmp();
  writeFileSync(join(home, ".gitconfig"), main);
  for (const [f, c] of Object.entries(extra)) writeFileSync(join(home, f), c);
  return home;
}

test("identidad: una sola se decide sola", () => {
  const home = gitHome("[user]\n\temail = a@example.org\n");
  const r = detectIdentities({ home, cwd: tmp() });
  assert.equal(r.decided.email, "a@example.org");
});

test("identidad: varias por remoto y sin remoto, no decide (pregunta)", () => {
  const home = gitHome('[user]\n\temail = work@example.org\n[includeIf "hasconfig:remote.*.url:https://github.com/yo/**"]\n\tpath = ~/.gitconfig-yo\n', { ".gitconfig-yo": "[user]\n\temail = yo@example.org\n" });
  const r = detectIdentities({ home, cwd: tmp() });
  assert.equal(r.decided, null);
  assert.deepEqual(r.candidates.map((c) => c.label), ["global", "github.com/yo"]);
});

test("identidad: una regla gitdir que coincide con la carpeta decide", () => {
  const cwd = tmp();
  const home = gitHome(`[user]\n\temail = work@example.org\n[includeIf "gitdir:${dirname(cwd)}/"]\n\tpath = ~/.gitconfig-p\n`, { ".gitconfig-p": "[user]\n\temail = p@example.org\n" });
  const r = detectIdentities({ home, cwd });
  assert.equal(r.decided.email, "p@example.org");
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
