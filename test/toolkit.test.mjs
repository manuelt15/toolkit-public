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

test("diseno trae diseno-propio como obligatoria y Taste solo como opcional con aviso", () => {
  const p = planSkills(catalog, { modules: ["diseno"] });
  assert.ok(ids(p.byLevel.obligatoria).includes("diseno-propio"));
  const taste = p.byLevel.opcional.find((s) => s.id === "design-taste-frontend");
  assert.ok(taste, "Taste sigue disponible como opcional");
  assert.match(taste.aviso, /riesgo crítico/);
  assert.ok(!ids(p.byLevel.recomendada).includes("design-taste-frontend"));
});

test("el aviso de una skill se enseña antes de ejecutar su comando", () => {
  const cwd = tmp();
  const lines = [];
  const cfg = newConfig({ skills: ["design-taste-frontend"] });
  execute(cfg, catalog, { cwd, ...ROOTS, dryRun: true, log: (l) => lines.push(l) });
  const out = lines.join("\n");
  assert.ok(out.indexOf("aviso de design-taste-frontend") < out.indexOf("ejecutaría: npx skills add Leonxlnx"), out);
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

test("consentimiento: solo proyecto deja fuera los globales (-g)", () => {
  const cwd = tmp();
  const ran = [];
  execute(newConfig(), catalog, { cwd, ...ROOTS, dryRun: false, consent: "proyecto", runner: (a) => { ran.push(a.join(" ")); return true; }, log: quiet });
  assert.ok(ran.length > 0);
  assert.ok(ran.every((c) => !c.includes(" -g ")), ran.join("\n"));
  const lock = JSON.parse(readFileSync(join(cwd, "toolkit.lock.json"), "utf8"));
  assert.equal(lock.skills.find((s) => s.id === "grill-me").estado, "pendiente");
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

// ── sesión: start y close ───────────────────────────────────────────────────

import { startBrief, close, commitClose, prunePending, HUECO } from "../src/session.mjs";

function projectWithCommit() {
  const cwd = tmp();
  execute(newConfig(), catalog, { cwd, ...ROOTS, dryRun: false, log: quiet });
  spawnSync("git", ["add", "-A"], { cwd });
  spawnSync("git", ["commit", "-qm", "inicio"], { cwd });
  return cwd;
}
const gitOut = (cwd, args) => spawnSync("git", args, { cwd, encoding: "utf8" }).stdout.trim();

test("start: fuera de un proyecto del toolkit no dice nada", () => {
  assert.equal(startBrief(tmp()), null);
});

test("start: brief con proyecto, pendientes y git", () => {
  const cwd = projectWithCommit();
  const b = startBrief(cwd);
  assert.match(b, /Proyecto: Web de prueba/);
  assert.match(b, /Pendiente \(3 de \d+\):\n  1\. Completar `DESIGN\.md`/);
  assert.match(b, /Git: rama main; 0 cambio\(s\) sin commitear; último commit: \w+ inicio/);
  assert.match(b, /tk close/);
});

test("close: en un proyecto recién montado y commiteado, la primera sesión sí se cierra", () => {
  const cwd = projectWithCommit(); // el primer commit incluye memory/handovers-archive/.gitkeep
  const r = close(cwd, { today: "2026-11-07", slug: "primera", log: quiet });
  assert.notEqual(r.nothing, true);
  assert.match(readFileSync(join(cwd, "memory/handovers-archive/HANDOVER-2026-11-07-primera.md"), "utf8"), /inicio/);
});

test("close: sin cambios no escribe nada", () => {
  const cwd = projectWithCommit();
  spawnSync("git", ["commit", "-q", "--allow-empty", "-m", "x", "--", "memory/"], { cwd });
  // primer cierre real para tener base
  writeFileSync(join(cwd, "app.js"), "1\n");
  close(cwd, { today: "2026-11-07", slug: "base", log: quiet });
  const ho = join(cwd, "memory/handovers-archive/HANDOVER-2026-11-07-base.md");
  writeFileSync(ho, readFileSync(ho, "utf8").replaceAll(HUECO, "hecho"));
  writeFileSync(join(cwd, "memory/MEMORY.md"), readFileSync(join(cwd, "memory/MEMORY.md"), "utf8").replaceAll(HUECO, "gancho"));
  spawnSync("git", ["add", "app.js"], { cwd }); spawnSync("git", ["commit", "-qm", "app"], { cwd });
  commitClose(cwd, { today: "2026-11-07", log: quiet });
  const lines = [];
  const r = close(cwd, { today: "2026-11-08", log: (l) => lines.push(l) });
  assert.equal(r.nothing, true);
  assert.equal(handovers(cwd).length, 1);
});
const handovers = (cwd) => readdirSync(join(cwd, "memory/handovers-archive")).filter((f) => f.startsWith("HANDOVER-"));

test("close: crea handover con huecos y --commit se niega hasta rellenarlos; solo commitea memory/", () => {
  const cwd = projectWithCommit();
  writeFileSync(join(cwd, "app.js"), "console.log(1)\n");
  spawnSync("git", ["add", "app.js"], { cwd }); spawnSync("git", ["commit", "-qm", "feat: app"], { cwd });
  writeFileSync(join(cwd, "sin-commitear.js"), "x\n");
  close(cwd, { today: "2026-11-07", slug: "Primera sesión", log: quiet });
  const file = join(cwd, "memory/handovers-archive/HANDOVER-2026-11-07-primera-sesion.md");
  const body = readFileSync(file, "utf8");
  assert.match(body, /feat: app/);
  assert.match(body, /Sin commitear: 1 fichero/);
  assert.ok(body.includes(HUECO));
  assert.match(readFileSync(join(cwd, "memory/MEMORY.md"), "utf8"), /HANDOVER-2026-11-07-primera-sesion\.md/);

  assert.throws(() => commitClose(cwd, { today: "2026-11-07", log: quiet }), /Quedan huecos/);
  writeFileSync(file, body.replaceAll(HUECO, "relleno"));
  assert.throws(() => commitClose(cwd, { today: "2026-11-07", log: quiet }), /MEMORY\.md/);
  const idx = join(cwd, "memory/MEMORY.md");
  writeFileSync(idx, readFileSync(idx, "utf8").replaceAll(HUECO, "primera sesión"));
  commitClose(cwd, { today: "2026-11-07", log: quiet });
  assert.equal(gitOut(cwd, ["log", "-1", "--format=%s"]), "docs(memory): update - primera sesion");
  assert.deepEqual(gitOut(cwd, ["show", "--name-only", "--format=", "HEAD"]).split("\n").every((f) => f.startsWith("memory/")), true);
  assert.match(gitOut(cwd, ["status", "--porcelain"]), /\?\? sin-commitear\.js/);
  assert.equal(gitOut(cwd, ["remote"]), "", "no hay remoto: no puede haber push");
});

test("dos cierres el mismo día: el commit lleva el título del handover que entra", () => {
  const cwd = projectWithCommit();
  const cerrar = (slug, fichero) => {
    writeFileSync(join(cwd, fichero), slug + "\n");
    spawnSync("git", ["add", fichero], { cwd }); spawnSync("git", ["commit", "-qm", fichero], { cwd });
    close(cwd, { today: "2026-11-07", slug, log: quiet });
    for (const f of [join(cwd, `memory/handovers-archive/HANDOVER-2026-11-07-${slug}.md`), join(cwd, "memory/MEMORY.md")]) {
      writeFileSync(f, readFileSync(f, "utf8").replaceAll(HUECO, "ok"));
    }
    commitClose(cwd, { today: "2026-11-07", log: quiet });
    return gitOut(cwd, ["log", "-1", "--format=%s"]);
  };
  assert.equal(cerrar("zeta", "a.txt"), "docs(memory): update - zeta");
  assert.equal(cerrar("alfa", "b.txt"), "docs(memory): update - alfa");
  assert.match(startBrief(cwd), /Último handover: memory\/handovers-archive\/HANDOVER-2026-11-07-alfa\.md/);
});

test("poda: las secciones con ✅ o ⛔ van a pending-archive.md", () => {
  const dir = tmp();
  writeFileSync(join(dir, "pending.md"), "# Pendientes\n\n## ⏳ Abierto\n- a\n\n## ✅ Hecho X\ndetalle\n\n## Otra abierta\n\n## ⛔ Decidido: no volver a proponer\n");
  const moved = prunePending(dir, "2026-11-07");
  assert.deepEqual(moved, ["## ✅ Hecho X"]);
  assert.doesNotMatch(readFileSync(join(dir, "pending.md"), "utf8"), /Hecho X/);
  assert.match(readFileSync(join(dir, "pending-archive.md"), "utf8"), /## ✅ Hecho X\ndetalle/);
});

test("checklist: avisa de un .env en git y de una dependencia sin su módulo", () => {
  const cwd = projectWithCommit();
  writeFileSync(join(cwd, ".env.local"), "X=1\n");
  spawnSync("git", ["add", "-f", ".env.local"], { cwd });
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { stripe: "1.0.0" } }));
  const lines = [];
  close(cwd, { today: "2026-11-07", log: (l) => lines.push(l) });
  const out = lines.join("\n");
  assert.match(out, /! Ficheros \.env en git: \.env\.local/);
  assert.match(out, /! Hay "stripe" en package\.json pero el módulo pagos no está activo/);
});

test("el proyecto trae el hook de Claude y no pisa un settings.json existente", () => {
  const cwd = tmp();
  execute(newConfig(), catalog, { cwd, ...ROOTS, dryRun: false, log: quiet });
  const hook = JSON.parse(readFileSync(join(cwd, ".claude/settings.json"), "utf8"));
  assert.match(hook.hooks.SessionStart[0].hooks[0].command, /tk start/);
  const cwd2 = tmp();
  mkdirSync(join(cwd2, ".claude"));
  writeFileSync(join(cwd2, ".claude/settings.json"), "{\"mio\":true}\n");
  const lines = [];
  execute(newConfig(), catalog, { cwd: cwd2, ...ROOTS, dryRun: false, log: (l) => lines.push(l) });
  assert.equal(readFileSync(join(cwd2, ".claude/settings.json"), "utf8"), "{\"mio\":true}\n");
  assert.match(lines.join("\n"), /! \.claude\/settings\.json/);
});

// ── skills y doctor ─────────────────────────────────────────────────────────

import { doctor, addSkill, removeSkill, listSkills } from "../src/maintain.mjs";
const MAINT = { catalog, root: ROOT, version: "0.0.0-test" };

test("doctor: verde en un proyecto recién montado", () => {
  const cwd = tmp();
  execute(newConfig(), catalog, { cwd, ...ROOTS, dryRun: false, log: quiet });
  const r = doctor(cwd, MAINT);
  assert.deepEqual(r.errors, []);
});

test("doctor: borrar una skill a mano lo hace fallar y --fix la repone igual que estaba", () => {
  const cwd = tmp();
  execute(newConfig(), catalog, { cwd, ...ROOTS, dryRun: false, log: quiet });
  rmSync(join(cwd, ".agents/skills/cierre"), { recursive: true });
  rmSync(join(cwd, ".claude/skills"));
  const r = doctor(cwd, MAINT);
  assert.ok(r.errors.some((e) => /Falta la skill cierre/.test(e)));
  assert.ok(r.errors.some((e) => /Falta el enlace \.claude\/skills/.test(e)));
  assert.ok(!existsSync(join(cwd, ".agents/skills/cierre")), "sin --fix no escribe");
  const f = doctor(cwd, { ...MAINT, fix: true });
  assert.deepEqual(f.errors, []);
  assert.deepEqual(doctor(cwd, MAINT).errors, []);
  assert.deepEqual(doctor(cwd, MAINT).warnings.filter((w) => /cierre/.test(w)), []);
});

test("doctor: una skill propia editada a mano se avisa y no se pisa", () => {
  const cwd = tmp();
  execute(newConfig(), catalog, { cwd, ...ROOTS, dryRun: false, log: quiet });
  const p = join(cwd, ".agents/skills/cierre/SKILL.md");
  writeFileSync(p, "mi versión\n");
  const r = doctor(cwd, { ...MAINT, fix: true });
  assert.ok(r.warnings.some((w) => /cierre cambió/.test(w)));
  assert.equal(readFileSync(p, "utf8"), "mi versión\n");
});

test("doctor: sin lock falla y no escribe nada", () => {
  const cwd = tmp();
  const r = doctor(cwd, MAINT);
  assert.match(r.errors[0], /toolkit\.lock\.json/);
  assert.deepEqual(readdirSync(cwd), []);
});

test("doctor --fix no escribe fuera del proyecto con un lock manipulado", () => {
  const cwd = tmp();
  execute(newConfig(), catalog, { cwd, ...ROOTS, dryRun: false, log: quiet });
  const lockP = join(cwd, "toolkit.lock.json");
  const lock = JSON.parse(readFileSync(lockP, "utf8"));
  lock.skills.push({ id: "../../fuera", scope: "proyecto", origen: "propia" }, { id: "__proto__", scope: "proyecto", origen: "propia" });
  lock.agentes = ["claude-code", "--evil", "hermes-agent"];
  writeFileSync(lockP, JSON.stringify(lock));
  const r = doctor(cwd, { ...MAINT, fix: true });
  assert.equal(r.errors.filter((e) => /no está en el catálogo o con un id no válido/.test(e)).length, 2);
  assert.ok(!existsSync(join(cwd, "..", "fuera")));
  assert.ok(!existsSync(join(cwd, ".agents", "fuera")));
});

test("los agentes desconocidos nunca llegan a los argumentos de npx", () => {
  const steps = externalSteps(catalog, [{ id: "tdd" }], ["codex", "--evil", "-g"]);
  assert.deepEqual(steps[0].argv.filter((a, i, all) => all[i - 1] === "-a"), ["codex"]);
  assert.ok(!steps[0].argv.includes("--evil"));
  const cwd = tmp();
  execute(newConfig(), catalog, { cwd, ...ROOTS, dryRun: false, log: quiet });
  assert.throws(() => addSkill(cwd, "__proto__", { ...MAINT, log: quiet }), /no está en el catálogo/);
  assert.throws(() => addSkill(cwd, "../cierre", { ...MAINT, log: quiet }), /no está en el catálogo/);
});

test("skills add: externa sin --install queda pendiente en lock, pending y AGENTS.md", () => {
  const cwd = tmp();
  execute(newConfig(), catalog, { cwd, ...ROOTS, dryRun: false, log: quiet });
  const runner = () => assert.fail("sin consentimiento no se ejecuta");
  addSkill(cwd, "tdd", { ...MAINT, consent: false, runner, log: quiet });
  const lock = JSON.parse(readFileSync(join(cwd, "toolkit.lock.json"), "utf8"));
  assert.equal(lock.skills.find((s) => s.id === "tdd").estado, "pendiente");
  assert.match(readFileSync(join(cwd, "memory/pending.md"), "utf8"), /Instalar la skill `tdd`/);
  assert.match(readFileSync(join(cwd, "AGENTS.md"), "utf8"), /`tdd`: .*pendiente de instalar/);
  assert.match(readFileSync(join(cwd, "AGENTS.md"), "utf8"), /## Este proyecto\nWeb de prueba/, "el bloque del proyecto no se toca");
});

test("skills add: con consentimiento se ejecuta y queda instalada; desconocida da error claro", () => {
  const cwd = tmp();
  execute(newConfig(), catalog, { cwd, ...ROOTS, dryRun: false, log: quiet });
  const ran = [];
  addSkill(cwd, "tdd", { ...MAINT, consent: true, runner: (a) => { ran.push(a.join(" ")); return true; }, log: quiet });
  assert.match(ran[0], /mattpocock\/skills --skill tdd/);
  assert.throws(() => addSkill(cwd, "no-existe", { ...MAINT, log: quiet }), /no está en el catálogo/);
});

test("skills remove: externa instalada se quita con su comando y sale del lock y de AGENTS.md", () => {
  const cwd = tmp();
  execute(newConfig({ modules: ["testing"], skills: ["tdd"] }), catalog, { cwd, ...ROOTS, dryRun: false, consent: "todos", runner: () => true, log: quiet });
  const ran = [];
  removeSkill(cwd, "tdd", { ...MAINT, consent: true, runner: (a) => { ran.push(a.join(" ")); return true; }, log: quiet });
  assert.deepEqual(ran, ["npx skills remove tdd -y"]);
  const lock = JSON.parse(readFileSync(join(cwd, "toolkit.lock.json"), "utf8"));
  assert.ok(!lock.skills.some((s) => s.id === "tdd"));
  assert.doesNotMatch(readFileSync(join(cwd, "AGENTS.md"), "utf8"), /`tdd`/);
});

test("skills remove: las del flujo no se quitan y sin --install no ejecuta nada", () => {
  const cwd = tmp();
  execute(newConfig({ modules: ["testing"], skills: ["tdd"] }), catalog, { cwd, ...ROOTS, dryRun: false, consent: "todos", runner: () => true, log: quiet });
  assert.throws(() => removeSkill(cwd, "cierre", { ...MAINT, log: quiet }), /parte del flujo/);
  const r = removeSkill(cwd, "tdd", { ...MAINT, consent: false, runner: () => assert.fail("sin consentimiento"), log: quiet });
  assert.equal(r.changed, false);
});

test("skills: lista agrupada con estado", () => {
  const cwd = tmp();
  execute(newConfig(), catalog, { cwd, ...ROOTS, dryRun: false, log: quiet });
  const out = listSkills(catalog, { cwd, globalSkills: { humanizer: { dirs: ["~/.agents/skills"] } } });
  assert.match(out, /FLUJO \(PROPIAS\)\n\s+✓ cierre/);
  assert.match(out, /● humanizer/);
  assert.match(out, /… shadcn/);
  assert.match(out, /○ stripe/);
});

// ── perfil ──────────────────────────────────────────────────────────────────

import { loadProfile, applyProfileToIdentities } from "../src/profile.mjs";
import { pickIdentity } from "../src/identity.mjs";

function profileDir() {
  const dir = tmp();
  writeFileSync(join(dir, "profile.json"), JSON.stringify({ nombre: "yo", agents_md: "AGENTS.md", identidades: [
    { cuenta: "personal", github: "yo", email: "yo@example.org" },
    { cuenta: "trabajo", github: "yo-work", detectar: "global" },
  ] }));
  writeFileSync(join(dir, "AGENTS.md"), "## Reglas del autor\n- Sin raya larga.\n");
  return dir;
}

test("perfil: sin perfil no pasa nada; con --profile inexistente da error", () => {
  assert.equal(loadProfile({ home: tmp(), env: {} }), null);
  assert.throws(() => loadProfile({ home: tmp(), flag: "/no/existe.json", env: {} }), /No encuentro el perfil/);
});

test("perfil: se encuentra en ~/.config/tk/profile.json aunque sea un enlace", () => {
  const dir = profileDir(), home = tmp();
  mkdirSync(join(home, ".config/tk"), { recursive: true });
  symlinkSync(join(dir, "profile.json"), join(home, ".config/tk/profile.json"));
  const p = loadProfile({ home, env: {} });
  assert.equal(p.nombre, "yo");
  assert.match(p.block, /Reglas del autor/);
});

test("perfil: nombra las identidades y --git personal elige la del perfil", () => {
  const home = gitHome("[user]\n\tname = Yo\n\temail = work@example.org\n");
  const det = applyProfileToIdentities(detectIdentities({ home, cwd: tmp() }), loadProfile({ home, flag: join(profileDir(), "profile.json"), env: {} }));
  assert.deepEqual(det.candidates.map((c) => c.label), ["trabajo (yo-work)", "personal (yo)"]);
  assert.equal(det.decided, null, "dos identidades: hay que elegir");
  const c = pickIdentity(det, "personal");
  assert.equal(c.email, "yo@example.org");
  assert.equal(c.name, "Yo");
});

test("perfil: bloque propio en AGENTS.md, nombre en el lock y ningún email en el proyecto", () => {
  const cwd = tmp();
  const cfg = newConfig();
  cfg.profile = loadProfile({ home: tmp(), flag: join(profileDir(), "profile.json"), env: {} });
  execute(cfg, catalog, { cwd, ...ROOTS, dryRun: false, log: quiet });
  const agents = readFileSync(join(cwd, "AGENTS.md"), "utf8");
  assert.match(agents, /<!-- \/toolkit:public -->\n\n<!-- toolkit:profile yo -->\n## Reglas del autor[\s\S]*<!-- \/toolkit:profile -->\n\n<!-- toolkit:project -->/);
  assert.equal(JSON.parse(readFileSync(join(cwd, "toolkit.lock.json"), "utf8")).perfil, "yo");
  for (const f of ["AGENTS.md", "toolkit.lock.json"]) assert.ok(!readFileSync(join(cwd, f), "utf8").includes("@example.org"), f);
  assert.deepEqual(doctor(cwd, MAINT).warnings.filter((w) => /perfil/.test(w)), []);
  writeFileSync(join(cwd, "AGENTS.md"), agents.replace(/<!-- toolkit:profile[\s\S]*?<!-- \/toolkit:profile -->\n\n/, ""));
  assert.ok(doctor(cwd, MAINT).warnings.some((w) => /bloque del perfil yo/.test(w)));
});

// ── paquete ─────────────────────────────────────────────────────────────────

test("npm pack solo lleva lo de la allowlist", () => {
  const r = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  // npm 12 devuelve un objeto indexado por nombre de paquete; hasta npm 11, un array
  const salida = JSON.parse(r.stdout);
  const paquete = Array.isArray(salida) ? salida[0] : Object.values(salida)[0];
  const files = paquete.files.map((f) => f.path);
  for (const f of files) {
    assert.match(f, /^(bin|src|catalogo|modulos|arquitecturas|plantillas|assets)\/|^(package\.json|README\.md|LICENSE)$/, `no debería ir en el paquete: ${f}`);
  }
  assert.ok(files.includes("catalogo/catalog.json"));
});
