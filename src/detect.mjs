// Detección silenciosa antes de preguntar nada. Solo lee: nunca escribe ni usa la red.
// `home` y `cwd` se inyectan para que los tests no toquen el HOME real.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const AGENTS = {
  "claude-code": ".claude",
  codex: ".codex",
  "hermes-agent": ".hermes",
};

// Carpetas donde viven las skills globales de cada agente
const SKILL_DIRS = [".claude/skills", ".agents/skills", ".codex/skills"];

const IGNORABLE = new Set([".DS_Store", ".git"]);

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

export function detectFolder(cwd) {
  const entries = existsSync(cwd) ? readdirSync(cwd) : [];
  return {
    empty: entries.every((e) => IGNORABLE.has(e)),
    git: existsSync(join(cwd, ".git")),
    packageJson: existsSync(join(cwd, "package.json")),
    toolkitLock: existsSync(join(cwd, "toolkit.lock.json")),
  };
}

export function detectAgents(home) {
  return Object.entries(AGENTS)
    .filter(([, dir]) => isDir(join(home, dir)))
    .map(([id]) => id);
}

// id de skill -> { dirs: ["~/.claude/skills", ...], source: "owner/repo" | null }
export function detectGlobalSkills(home) {
  const found = {};
  for (const rel of SKILL_DIRS) {
    const dir = join(home, rel);
    if (!isDir(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      if (!existsSync(join(dir, name, "SKILL.md"))) continue; // statSync sigue enlaces
      (found[name] ??= { dirs: [], source: null }).dirs.push(`~/${rel}`);
    }
  }
  // El lock de `npx skills` dice de qué repo salió cada una
  try {
    const lock = JSON.parse(readFileSync(join(home, ".agents", ".skill-lock.json"), "utf8"));
    for (const [id, info] of Object.entries(lock.skills ?? {})) {
      if (found[id]) found[id].source = info.source ?? null;
    }
  } catch { /* sin lock: no pasa nada */ }
  return found;
}

export function detect({ home, cwd }) {
  return {
    node: process.versions.node,
    folder: detectFolder(cwd),
    agents: detectAgents(home),
    globalSkills: detectGlobalSkills(home),
  };
}
