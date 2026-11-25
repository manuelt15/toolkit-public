// Hallazgo 002 del informe sellado: tk no puede escribir fuera de la carpeta del proyecto,
// ni siquiera cuando un enlace simbólico del repo apunta fuera. Enlaces reales en temporales.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyOps, isInside, resolveInside } from "../src/project.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "toolkit-test-"));
const stamp = "20261125-1000";

test("applyOps escribe dentro del proyecto y resuelve la ruta real", () => {
  const cwd = tmp();
  applyOps(cwd, [{ type: "file", path: "memory/MEMORY.md", content: "memoria\n" }], { stamp });
  assert.equal(readFileSync(join(cwd, "memory/MEMORY.md"), "utf8"), "memoria\n");
  assert.equal(resolveInside(cwd, "memory/MEMORY.md"), join(cwd, "memory/MEMORY.md"));
  assert.ok(isInside(realpathSync(cwd), realpathSync(join(cwd, "memory/MEMORY.md"))));
});

test("applyOps no escribe fuera cuando memory/ es un enlace a otra carpeta", () => {
  const cwd = tmp(), fuera = tmp();
  symlinkSync(fuera, join(cwd, "memory"));
  assert.throws(
    () => applyOps(cwd, [{ type: "file", path: "memory/MEMORY.md", content: "memoria\n" }], { stamp }),
    (e) => e.message.includes(realpathSync(fuera)) && /sale del proyecto/.test(e.message),
  );
  assert.deepEqual(readdirSync(fuera), []);
});

test("applyOps no toca un .gitignore enlazado a un fichero de fuera", () => {
  const cwd = tmp(), fuera = tmp();
  const externo = join(fuera, "zshrc");
  writeFileSync(externo, "export PATH=x\n");
  symlinkSync(externo, join(cwd, ".gitignore"));
  assert.throws(
    () => applyOps(cwd, [{ type: "lines", path: ".gitignore", lines: ["node_modules/"] }], { stamp }),
    (e) => e.message.includes(realpathSync(externo)),
  );
  assert.equal(readFileSync(externo, "utf8"), "export PATH=x\n");
});

test("un enlace relativo que no sale del proyecto sigue funcionando", () => {
  const cwd = tmp();
  mkdirSync(join(cwd, ".agents/skills/cierre"), { recursive: true });
  mkdirSync(join(cwd, ".claude"));
  symlinkSync("../.agents/skills", join(cwd, ".claude/skills"));
  applyOps(cwd, [{ type: "file", path: ".claude/skills/cierre/NOTAS.md", content: "dentro\n" }], { stamp });
  assert.equal(readFileSync(join(cwd, ".agents/skills/cierre/NOTAS.md"), "utf8"), "dentro\n");
  assert.equal(readFileSync(join(cwd, ".claude/skills/cierre/NOTAS.md"), "utf8"), "dentro\n");
});
