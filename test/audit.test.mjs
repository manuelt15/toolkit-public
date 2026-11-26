// Regresión de scripts/audit.sh: un patrón de la denylist que no compila no puede acabar
// en "audit: limpio". Ningún test depende de que gitleaks esté instalado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = () => mkdtempSync(join(tmpdir(), "toolkit-audit-"));

// El audit exige que gitleaks exista antes de validar la denylist: se le pone un
// sustituto en el PATH para que el test funcione en CI, donde no está instalado.
function gitleaksFalso(dir) {
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "gitleaks"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return bin;
}

function audit(denylist, bin) {
  return spawnSync("bash", [join(ROOT, "scripts/audit.sh"), "--staged"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, TOOLKIT_DENYLIST: denylist, PATH: `${bin}:${process.env.PATH}` },
  });
}

test("audit: un patrón que no compila bloquea con un mensaje claro, no con limpio", () => {
  const dir = tmp();
  const denylist = join(dir, "denylist.txt");
  writeFileSync(denylist, "[\n");
  try {
    const r = audit(denylist, gitleaksFalso(dir));
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /no compila/);
    assert.doesNotMatch(r.stdout, /audit: limpio/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("audit: una denylist válida no avisa de patrones rotos", () => {
  const dir = tmp();
  const denylist = join(dir, "denylist.txt");
  writeFileSync(denylist, "patron-que-no-aparece-123\n");
  try {
    const r = audit(denylist, gitleaksFalso(dir));
    assert.doesNotMatch(r.stderr, /no compila/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
