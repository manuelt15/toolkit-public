// Mantenimiento de un proyecto ya montado: `tk skills` (catálogo con estado y add) y
// `tk doctor` (lock contra disco; --fix repara lo local). Todo parte de toolkit.lock.json.
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, symlinkSync, lstatSync, readlinkSync, rmSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { agentsMd, hashDir } from "./project.mjs";
import { externalSteps, runSteps, knownAgents } from "./external.mjs";

const lockPath = (cwd) => join(cwd, "toolkit.lock.json");
// El lock viaja con el repo: puede venir de otra persona. Un id solo vale si está en el
// catálogo y tiene forma de nombre de skill; origen y scope salen del catálogo, no del lock.
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;
const trusted = (catalog, id) => typeof id === "string" && SAFE_ID.test(id) && Object.hasOwn(catalog.skills, id);
export function readLock(cwd) {
  if (!existsSync(lockPath(cwd))) throw new Error("No hay toolkit.lock.json: este no es un proyecto montado con tk.");
  return JSON.parse(readFileSync(lockPath(cwd), "utf8"));
}
const writeLock = (cwd, lock) => writeFileSync(lockPath(cwd), JSON.stringify(lock, null, 2) + "\n");
const hasSkillMd = (cwd, id) => existsSync(join(cwd, ".agents/skills", id, "SKILL.md"));
const isLink = (p, target) => { try { return lstatSync(p).isSymbolicLink() && readlinkSync(p) === target; } catch { return false; } };
const exists = (p) => { try { lstatSync(p); return true; } catch { return false; } };

// Config mínima para regenerar el bloque público de AGENTS.md desde el lock
function configFromLock(lock) {
  return {
    architecture: lock.arquitectura,
    modules: lock.modulos,
    options: lock.opciones,
    skills: lock.skills.map((s) => ({ id: s.id, scope: s.scope, estado: s.estado })),
    description: "",
  };
}

// Reescribe solo el bloque <!-- toolkit:public --> de AGENTS.md; el resto no se toca
export function refreshAgentsPublic(cwd, lock, catalog, version) {
  const p = join(cwd, "AGENTS.md");
  if (!existsSync(p)) return "AGENTS.md no existe";
  const current = readFileSync(p, "utf8");
  const re = /<!-- toolkit:public[^>]*-->[\s\S]*?<!-- \/toolkit:public -->/;
  if (!re.test(current)) return "AGENTS.md sin marcadores toolkit:public: no se toca";
  const fresh = agentsMd(configFromLock(lock), catalog, version).match(re)[0];
  if (fresh === current.match(re)[0]) return null;
  writeFileSync(p, current.replace(re, fresh));
  return null;
}

// ── tk skills ───────────────────────────────────────────────────────────────

function groupOf(catalog, s) {
  if (s.origen === "propia") return "Flujo (propias)";
  if (s.scope === "global") return "De máquina (global)";
  if (s.cuando?.siempre) return "Calidad y método";
  const m = s.cuando?.modulos?.[0];
  return m ? `Módulo ${catalog.modules[m]?.title ?? m}` : "Otras";
}

export function listSkills(catalog, { cwd, globalSkills }) {
  const lock = existsSync(lockPath(cwd)) ? readLock(cwd) : null;
  const inLock = new Map((lock?.skills ?? []).map((s) => [s.id, s]));
  const groups = new Map();
  for (const s of Object.values(catalog.skills)) {
    const l = inLock.get(s.id);
    let mark = "○", note = "";
    if (l?.scope === "proyecto" && hasSkillMd(cwd, s.id)) mark = "✓";
    else if (globalSkills[s.id]) mark = "●"; // instalada en global después de anotarla como pendiente
    else if (l?.estado === "pendiente") { mark = "…"; note = "pendiente de instalar"; }
    const g = groupOf(catalog, s);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(`   ${mark} ${s.id.padEnd(34)} ${s.para_que}${note ? `  (${note})` : ""}${s.aviso ? `\n     aviso: ${s.aviso}` : ""}`);
  }
  const out = [];
  for (const [g, lines] of groups) out.push(`  ${g.toUpperCase()}`, ...lines, "");
  out.push("  ✓ en el proyecto   ● global, no en el proyecto   … pendiente   ○ sin instalar");
  out.push("  tk skills add <id>   añade una al proyecto (te avisa si ya la tienes en global)");
  return out.join("\n");
}

export function addSkill(cwd, id, { catalog, root, version, globalSkills = {}, consent = false, runner, log = console.log }) {
  const lock = readLock(cwd);
  const s = trusted(catalog, id) ? catalog.skills[id] : null;
  if (!s) throw new Error(`"${id}" no está en el catálogo. Mira \`tk skills\` o busca con la skill find-skills.`);
  const prev = lock.skills.find((x) => x.id === id);
  if (prev?.scope === "proyecto" && (prev.origen === "propia" ? hasSkillMd(cwd, id) : prev.estado === "instalada")) {
    log(`= ${id} ya está en el proyecto.`);
    return { changed: false };
  }
  if (s.aviso) log(`! aviso de ${id}: ${s.aviso}`);
  if (globalSkills[id]) log(`· ${id} ya está en global (${globalSkills[id].dirs.join(", ")}); se añade también al proyecto, para que viaje con el repo.`);

  let entry;
  if (s.origen === "propia") {
    const dest = join(cwd, ".agents/skills", id);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(root, "assets/skills", id), dest, { recursive: true });
    if ((lock.agentes ?? []).includes("hermes-agent") && !exists(join(cwd, ".hermes/skills", id))) {
      mkdirSync(join(cwd, ".hermes/skills"), { recursive: true });
      symlinkSync(`../../.agents/skills/${id}`, join(cwd, ".hermes/skills", id));
    }
    entry = { id, scope: "proyecto", origen: "propia", nivel: s.nivel, version, hash: hashDir(join(root, "assets/skills", id)) };
    log(`+ .agents/skills/${id}`);
  } else {
    const steps = externalSteps(catalog, [{ id }], lock.agentes ?? []);
    for (const m of steps.filter((x) => x.kind === "manual")) log(`· paso manual: ${m.text}`);
    const run = steps.filter((x) => x.kind === "run");
    let ok = false;
    if (run.length && consent) ok = runSteps(run, { cwd, runner }).every((r) => r.ok);
    else for (const r of run) log(`· comando (no ejecutado, usa --install): ${r.text}`);
    entry = { id, scope: s.scope, origen: "externa", nivel: s.nivel, repo: s.repo, estado: ok ? "instalada" : "pendiente" };
    if (!ok && run.length) appendPending(cwd, `- Instalar la skill \`${id}\`: \`${run[0].text}\``);
    log(ok ? `+ ${id} instalada` : `… ${id} queda pendiente (apuntada en memory/pending.md)`);
  }
  lock.skills = [...lock.skills.filter((x) => x.id !== id), entry];
  writeLock(cwd, lock);
  const warn = refreshAgentsPublic(cwd, lock, catalog, version);
  if (warn) log(`! ${warn}`);
  return { changed: true, entry };
}

// Quita una skill del proyecto. Las incluidas y obligatorias no se quitan (son el flujo).
export function removeSkill(cwd, id, { catalog, version, consent = false, runner, log = console.log }) {
  const lock = readLock(cwd);
  const s = trusted(catalog, id) ? catalog.skills[id] : null;
  if (!s) throw new Error(`"${id}" no está en el catálogo.`);
  const prev = lock.skills.find((x) => x.id === id);
  if (!prev) { log(`= ${id} no está en este proyecto.`); return { changed: false }; }
  if (s.nivel === "incluida" || (s.nivel === "obligatoria" && s.origen === "propia")) {
    throw new Error(`${id} es parte del flujo (${s.nivel}) y no se quita.`);
  }
  if (s.origen === "propia") {
    rmSync(join(cwd, ".agents/skills", id), { recursive: true, force: true });
    const hermes = join(cwd, ".hermes/skills", id);
    if (isLink(hermes, `../../.agents/skills/${id}`)) unlinkSync(hermes);
    log(`- .agents/skills/${id}`);
  } else if (prev.estado === "instalada") {
    // La instaló `npx skills`: la quita la misma herramienta (también sus enlaces por agente)
    const argv = ["npx", "skills", "remove", id, ...(s.scope === "global" ? ["-g"] : []), "-y"];
    if (!consent) {
      log(`· comando (no ejecutado, usa --install todos): ${argv.join(" ")}`);
      return { changed: false };
    }
    const [r] = runSteps([{ id, kind: "run", argv, text: argv.join(" ") }], { cwd, runner });
    if (!r.ok) throw new Error(`Falló: ${argv.join(" ")}`);
  }
  lock.skills = lock.skills.filter((x) => x.id !== id);
  writeLock(cwd, lock);
  const warn = refreshAgentsPublic(cwd, lock, catalog, version);
  if (warn) log(`! ${warn}`);
  log(`- ${id} quitada del proyecto`);
  return { changed: true };
}

function appendPending(cwd, line) {
  const p = join(cwd, "memory/pending.md");
  if (!existsSync(p)) return;
  const t = readFileSync(p, "utf8");
  if (t.includes(line)) return;
  writeFileSync(p, t.includes("## ⏳ Abierto\n") ? t.replace("## ⏳ Abierto\n", `## ⏳ Abierto\n${line}\n`) : t + `\n${line}\n`);
}

// ── tk doctor ───────────────────────────────────────────────────────────────

const HOOK = "command -v tk >/dev/null 2>&1 && tk start || true";

export function doctor(cwd, { catalog, root, version, fix = false, hasTk = true }) {
  const res = { errors: [], warnings: [], fixed: [], ok: [] };
  let lock;
  try { lock = readLock(cwd); } catch (e) { res.errors.push(e.message); return res; }

  const agentsPath = join(cwd, "AGENTS.md");
  const agents = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
  if (/<!-- toolkit:public[^>]*-->[\s\S]*<!-- \/toolkit:public -->/.test(agents)) res.ok.push("AGENTS.md con el bloque del toolkit");
  else res.errors.push("AGENTS.md no tiene el bloque <!-- toolkit:public --> (el flujo de sesión no llega a los agentes)");

  if (lock.perfil && !new RegExp(`<!-- toolkit:profile ${String(lock.perfil).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} -->`).test(agents)) {
    res.warnings.push(`AGENTS.md no tiene el bloque del perfil ${lock.perfil}`);
  }

  for (const f of ["memory/MEMORY.md", "memory/pending.md"]) {
    if (existsSync(join(cwd, f))) continue;
    if (fix) { mkdirSync(join(cwd, "memory"), { recursive: true }); cpSync(join(root, "plantillas", f), join(cwd, f)); res.fixed.push(`${f} recreado desde la plantilla`); }
    else res.errors.push(`Falta ${f}`);
  }

  const lockSkills = Array.isArray(lock.skills) ? lock.skills : [];
  for (const s of lockSkills.filter((x) => !trusted(catalog, x?.id))) {
    res.errors.push(`El lock nombra una skill que no está en el catálogo o con un id no válido: ${JSON.stringify(String(s?.id)).slice(0, 60)}. No se toca.`);
  }
  for (const s of lockSkills.filter((x) => trusted(catalog, x?.id))) {
    if (s.scope !== "proyecto") continue;
    if (catalog.skills[s.id].origen === "propia") {
      const dir = join(cwd, ".agents/skills", s.id);
      if (!hasSkillMd(cwd, s.id)) {
        if (fix) { cpSync(join(root, "assets/skills", s.id), dir, { recursive: true }); res.fixed.push(`.agents/skills/${s.id} repuesta`); }
        else res.errors.push(`Falta la skill ${s.id} en .agents/skills`);
        continue;
      }
      if (s.hash && hashDir(dir) !== s.hash) res.warnings.push(`${s.id} cambió respecto a la versión instalada (editada a mano); doctor no la pisa`);
      else res.ok.push(`${s.id} intacta`);
      if (s.version && s.version !== version) res.warnings.push(`${s.id} es de tk ${s.version}; este tk es ${version}`);
    } else if (s.estado === "instalada" && !hasSkillMd(cwd, s.id)) {
      const step = externalSteps(catalog, [{ id: s.id }], lock.agentes ?? []).find((x) => x.kind === "run");
      res.errors.push(`Falta la skill ${s.id}, que el lock da por instalada${step ? `. Reinstalar: ${step.text}` : ""}`);
    } else if (s.estado === "pendiente") {
      res.warnings.push(`Skill ${s.id} pendiente de instalar`);
    }
  }

  const agentes = knownAgents(lock.agentes);
  if (agentes.includes("claude-code")) {
    const link = join(cwd, ".claude/skills");
    if (isLink(link, "../.agents/skills")) res.ok.push(".claude/skills enlazado");
    else if (!exists(link) && fix) { mkdirSync(join(cwd, ".claude"), { recursive: true }); symlinkSync("../.agents/skills", link); res.fixed.push(".claude/skills enlazado de nuevo"); }
    else res.errors.push(exists(link) ? ".claude/skills existe pero no apunta a ../.agents/skills" : "Falta el enlace .claude/skills");

    const settings = join(cwd, ".claude/settings.json");
    const text = existsSync(settings) ? readFileSync(settings, "utf8") : "";
    if (text.includes("tk start")) res.ok.push("Hook de Claude con tk start");
    else if (!text && fix) { writeFileSync(settings, JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: HOOK }] }] } }, null, 2) + "\n"); res.fixed.push(".claude/settings.json con el hook"); }
    else res.warnings.push(text ? ".claude/settings.json sin hook de tk start: añádelo a mano si quieres el brief automático" : "Falta .claude/settings.json con el hook de tk start");
  }
  if (agentes.includes("hermes-agent")) {
    for (const s of lockSkills.filter((x) => trusted(catalog, x?.id) && x.scope === "proyecto" && catalog.skills[x.id].origen === "propia")) {
      const link = join(cwd, ".hermes/skills", s.id), target = `../../.agents/skills/${s.id}`;
      if (isLink(link, target)) continue;
      if (!exists(link) && fix) { mkdirSync(dirname(link), { recursive: true }); symlinkSync(target, link); res.fixed.push(`.hermes/skills/${s.id} enlazado`); }
      else res.errors.push(`.hermes/skills/${s.id} no enlaza a ${target}`);
    }
  }
  if (!hasTk) res.warnings.push("`tk` no está en el PATH: los hooks no darán el brief (instálalo globalmente)");
  return res;
}
