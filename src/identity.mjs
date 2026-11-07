// Identidad de git por detección. Solo pregunta si hay varias y nada decide.
// Lee ~/.gitconfig y los ficheros de sus includeIf. No usa la red.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

function gitConfig(file, args) {
  if (!existsSync(file)) return "";
  try {
    return execFileSync("git", ["config", "--file", file, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch { return ""; } // git config sale con 1 si no hay coincidencias
}

const expand = (p, home) => (p.startsWith("~/") ? join(home, p.slice(2)) : p);

function readUser(file) {
  const get = (k) => gitConfig(file, ["--get", k]).trim() || null;
  return { name: get("user.name"), email: get("user.email") };
}

// "https://github.com/manuelt15/**" o "git@github.com:manuelt15/**" -> "github.com/manuelt15"
function accountFromUrlPattern(pattern) {
  const m = pattern.match(/([\w.-]+\.\w+)[/:]([\w.-]+)\//);
  return m ? `${m[1]}/${m[2]}` : pattern;
}

function gitdirMatches(pattern, cwd, home) {
  let p = expand(pattern, home).replace(/\*\*\/?$/, "");
  if (!p.endsWith("/")) p += "/";
  return (resolve(cwd) + "/").startsWith(p);
}

/**
 * @returns {{ candidates: Array<{label, name, email, source}>, decided: object|null, reason: string }}
 */
export function detectIdentities({ home, cwd }) {
  const main = join(home, ".gitconfig");
  const candidates = [];
  const add = (c) => {
    if (!c.email) return;
    const same = candidates.find((x) => x.email === c.email);
    if (same) { same.sources.push(c.source); return same; }
    const entry = { ...c, sources: [c.source] };
    candidates.push(entry);
    return entry;
  };

  const global = readUser(main);
  add({ label: "global", ...global, source: "~/.gitconfig" });

  let byPath = null;
  for (const line of gitConfig(main, ["--get-regexp", "^includeif\\."]).split("\n").filter(Boolean)) {
    const [key, path] = line.split(/\s+/, 2);
    const cond = key.replace(/^includeif\./i, "").replace(/\.path$/, "");
    const user = readUser(expand(path, home));
    if (!user.email) continue;
    if (cond.startsWith("hasconfig:remote.*.url:")) {
      add({ label: accountFromUrlPattern(cond.slice("hasconfig:remote.*.url:".length)), ...user, source: path });
    } else if (cond.startsWith("gitdir:") || cond.startsWith("gitdir/i:")) {
      const pattern = cond.replace(/^gitdir(\/i)?:/, "");
      const c = add({ label: `carpeta ${pattern}`, ...user, source: path });
      if (gitdirMatches(pattern, cwd, home)) byPath = c;
    }
  }

  if (byPath) return { candidates, decided: byPath, reason: "la carpeta coincide con un includeIf gitdir" };
  if (candidates.length === 1) return { candidates, decided: candidates[0], reason: "única identidad detectada" };
  if (!candidates.length) return { candidates, decided: null, reason: "no hay ninguna identidad configurada" };
  return { candidates, decided: null, reason: "hay varias identidades y nada decide cuál" };
}

// --git acepta el email exacto o la etiqueta (global, github.com/usuario...)
export function pickIdentity(detected, wanted) {
  if (!wanted) return detected.decided;
  const c = detected.candidates.find((x) => x.email === wanted || x.label === wanted || x.label.endsWith(`/${wanted}`));
  if (!c) throw new Error(`--git ${wanted}: no coincide con ninguna identidad detectada (${detected.candidates.map((x) => x.label).join(", ") || "ninguna"})`);
  return c;
}
