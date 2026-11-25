// Hallazgo 001 del informe sellado: el lock deja constancia de qué revisión se instaló de
// cada skill externa, sin fijarla en el catálogo. Resolvedor inyectado: ningún test sale a la red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { revisionOf } from "../src/external.mjs";
import { configFromFlags, execute } from "../src/new.mjs";
import { addSkill, doctor } from "../src/maintain.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(ROOT, "catalogo/catalog.json"), "utf8"));
const tmp = () => mkdtempSync(join(tmpdir(), "toolkit-test-"));
const quiet = () => {};
const SHA = "0123456789abcdef0123456789abcdef01234567";
const AHORA = "2026-11-25T09:30:00.000Z";
const sinRed = () => { throw new Error("sin red"); };
const lockDe = (cwd) => JSON.parse(readFileSync(join(cwd, "toolkit.lock.json"), "utf8"));
const externa = (cwd, id) => lockDe(cwd).skills.find((s) => s.id === id);
const montar = (cwd, opts = {}) => execute(configFromFlags(catalog,
  { preset: "landing", modules: ["testing"], options: {}, skills: ["tdd"], alsoInProject: [], description: "Web de prueba", design: { kind: "reference" } },
  { agents: ["claude-code", "codex", "hermes-agent"], globalSkills: {} }, { chosen: null }),
  catalog, { cwd, root: ROOT, version: "0.0.0-test", dryRun: false, consent: "ninguno", runner: () => true, lsRemote: sinRed, log: quiet, ...opts });

test("la revisión sale de git ls-remote HEAD y sin red es null", () => {
  const visto = [];
  assert.equal(revisionOf("mattpocock/skills", { lsRemote: (u) => { visto.push(u); return `${SHA}\tHEAD\n`; } }), SHA);
  assert.deepEqual(visto, ["https://github.com/mattpocock/skills.git"]);
  assert.equal(revisionOf("mattpocock/skills", { lsRemote: sinRed }), null);
  assert.equal(revisionOf("mattpocock/skills", { lsRemote: () => "no es un sha" }), null);
});

test("instalar una externa sin red no rompe: revision null e instalado con fecha", () => {
  const cwd = tmp(), avisos = [];
  montar(cwd, { consent: "todos", lsRemote: sinRed, now: () => AHORA, log: (l) => avisos.push(l) });
  const tdd = externa(cwd, "tdd");
  assert.equal(tdd.estado, "instalada");
  assert.equal(tdd.revision, null);
  assert.equal(tdd.instalado, AHORA);
  assert.match(avisos.join("\n"), /tdd: sin revisión del repo/);
});

test("instalar una externa con red anota el commit en el lock", () => {
  const cwd = tmp();
  montar(cwd, { consent: "todos", lsRemote: () => `${SHA}\tHEAD\n`, now: () => AHORA });
  const tdd = externa(cwd, "tdd");
  assert.equal(tdd.revision, SHA);
  assert.equal(tdd.instalado, AHORA);
});

test("tk skills add anota la revisión de lo que instala, también sin red", () => {
  const conRed = tmp();
  montar(conRed, {});
  addSkill(conRed, "tdd", { catalog, root: ROOT, version: "0.0.0-test", consent: true, runner: () => true, lsRemote: () => `${SHA}\tHEAD\n`, now: () => AHORA, log: quiet });
  assert.equal(externa(conRed, "tdd").revision, SHA);
  assert.equal(externa(conRed, "tdd").instalado, AHORA);

  const sin = tmp();
  montar(sin, {});
  assert.doesNotThrow(() => addSkill(sin, "tdd", { catalog, root: ROOT, version: "0.0.0-test", consent: true, runner: () => true, lsRemote: sinRed, now: () => AHORA, log: quiet }));
  assert.equal(externa(sin, "tdd").revision, null);
});

test("doctor avisa de una externa instalada sin revisión (lock antiguo) y calla si la tiene", () => {
  const cwd = tmp();
  montar(cwd, {});
  const p = join(cwd, "toolkit.lock.json");
  const lock = lockDe(cwd);
  const tdd = lock.skills.find((s) => s.id === "tdd");
  tdd.estado = "instalada";
  delete tdd.revision;
  delete tdd.instalado;
  mkdirSync(join(cwd, ".agents/skills/tdd"), { recursive: true });
  writeFileSync(join(cwd, ".agents/skills/tdd/SKILL.md"), "x\n");
  writeFileSync(p, JSON.stringify(lock));
  const r = doctor(cwd, { catalog, root: ROOT, version: "0.0.0-test" });
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /tdd.*revisión/.test(w)), r.warnings.join("\n"));

  tdd.revision = SHA;
  writeFileSync(p, JSON.stringify(lock));
  assert.ok(!doctor(cwd, { catalog, root: ROOT, version: "0.0.0-test" }).warnings.some((w) => /tdd/.test(w)));
});
