// Sesión: `tk start` (brief al empezar) y `tk close` (lo mecánico del cierre).
// El juicio (qué se hizo, qué queda, qué se decidió) lo pone el agente con la skill `cierre`:
// close deja huecos marcados y `close --commit` se niega a commitear mientras quede alguno.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, appendFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";

export const HUECO = "<!-- tk:rellenar -->";

function git(cwd, args) {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
}

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");

function readLock(cwd) {
  const p = join(cwd, "toolkit.lock.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

// Viñetas de «⏳ Abierto» más los títulos de otras secciones abiertas
export function openItems(pendingText) {
  const items = [];
  const sections = pendingText.split(/^(?=## )/m).slice(1);
  for (const sec of sections) {
    const [title, ...rest] = sec.split("\n");
    if (title.startsWith("## ⏳ Abierto")) {
      for (const l of rest) if (/^- /.test(l)) items.push(l.slice(2).trim());
    } else if (!title.startsWith("## ⛔ Decidido") && !/[✅⛔]/.test(title)) {
      items.push(title.replace(/^## /, "").trim());
    }
  }
  return items;
}

function lastLesson(text) {
  const heads = text.split("\n").filter((l) => /^(## |- )/.test(l));
  return heads.length ? heads.at(-1).replace(/^(## |- )/, "").trim() : null;
}

// Del más antiguo al más reciente: por la fecha del nombre y, el mismo día, por modificación
function handovers(cwd) {
  const dir = join(cwd, "memory/handovers-archive");
  if (!existsSync(dir)) return [];
  const day = (f) => f.slice(9, 19);
  return readdirSync(dir).filter((f) => /^HANDOVER-.*\.md$/.test(f))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => day(a.f).localeCompare(day(b.f)) || a.t - b.t)
    .map((x) => x.f);
}

// ── start ───────────────────────────────────────────────────────────────────

export function startBrief(cwd) {
  const lock = readLock(cwd);
  if (!lock) return null; // no es un proyecto del toolkit: el hook no dice nada
  const agents = read(join(cwd, "AGENTS.md"));
  const desc = agents.match(/## Este proyecto\n([^\n]+)/)?.[1]?.trim();
  const items = openItems(read(join(cwd, "memory/pending.md")));
  const lesson = lastLesson(read(join(cwd, "memory/lessons.md")).split("\n").slice(3).join("\n"));
  const ho = handovers(cwd).at(-1);
  const pendingSkills = (lock.skills ?? []).filter((s) => s.estado === "pendiente").length;

  const L = [`═══ tk start: ${basename(cwd)} ═══`];
  L.push(`Proyecto: ${desc ?? "(sin descripción en AGENTS.md)"}`);
  L.push(`Tipo: ${lock.arquitectura}; módulos: ${lock.modulos.join(", ") || "ninguno"}`);
  L.push(items.length ? `Pendiente (${Math.min(3, items.length)} de ${items.length}):` : "Pendiente: nada abierto en memory/pending.md");
  items.slice(0, 3).forEach((t, i) => L.push(`  ${i + 1}. ${t.length > 140 ? t.slice(0, 139) + "…" : t}`));
  L.push(`Última lección: ${lesson ?? "ninguna todavía"}`);
  L.push(`Último handover: ${ho ? `memory/handovers-archive/${ho}` : "ninguno todavía"}`);
  const branch = git(cwd, ["branch", "--show-current"]);
  if (branch !== null) {
    const dirty = (git(cwd, ["status", "--porcelain"]) ?? "").split("\n").filter(Boolean).length;
    const last = git(cwd, ["log", "-1", "--format=%h %s"]);
    L.push(`Git: rama ${branch || "(sin rama)"}; ${dirty} cambio(s) sin commitear; último commit: ${last ?? "ninguno"}`);
  }
  if (pendingSkills) L.push(`Skills pendientes de instalar: ${pendingSkills} (ver memory/pending.md)`);
  L.push("Al terminar con cambios: skill `cierre` (usa `tk close`).");
  return L.join("\n");
}

// ── poda de pending (antes podar-pending.py) ───────────────────────────────

const ARCHIVE_HEAD = "# Pendientes archivados\n\n> Lo vivo está en [pending.md](pending.md). Aquí, lo cerrado, en el orden en que se archivó.\n";

export function prunePending(memDir, today) {
  const pending = join(memDir, "pending.md");
  if (!existsSync(pending)) return [];
  const text = readFileSync(pending, "utf8");
  const [intro, ...sections] = text.split(/^(?=## )/m);
  const isClosed = (h) => !h.startsWith("## ⛔ Decidido") && !h.startsWith("## ⏳ Abierto") && /[✅⛔]/.test(h);
  const moved = sections.filter((s) => isClosed(s.split("\n", 1)[0]));
  if (!moved.length) return [];
  const keep = sections.filter((s) => !moved.includes(s));
  const archive = join(memDir, "pending-archive.md");
  let body = moved.join("");
  if (!body.endsWith("\n")) body += "\n";
  const stamp = `\n<!-- archivado ${today} desde pending.md -->\n\n`;
  if (existsSync(archive)) appendFileSync(archive, stamp + body);
  else writeFileSync(archive, ARCHIVE_HEAD + stamp + body);
  writeFileSync(pending, (intro + keep.join("")).replace(/\n+$/, "") + "\n");
  return moved.map((s) => s.split("\n", 1)[0]);
}

// ── checklist según módulos ─────────────────────────────────────────────────

// Dependencia npm -> módulo que debería estar activo
const DEP_MODULE = [
  [/^(stripe|@stripe\/)/, "pagos"],
  [/^(resend|react-email|@react-email\/)/, "email"],
  [/^better-auth$/, "auth"],
  [/^(@neondatabase\/|drizzle-orm$|@libsql\/client$|mongoose$|mongodb$)/, "datos"],
  [/^(ai$|@ai-sdk\/)/, "agentes-ia"],
  [/^(maplibre-gl$|@mapcn\/)/, "mapas"],
];
const CON_DATOS_PERSONALES = ["auth", "email", "pagos", "datos", "agentes-ia"];

export function checklist(cwd, lock) {
  const out = [];
  const tracked = (git(cwd, ["ls-files"]) ?? "").split("\n");
  const envs = tracked.filter((f) => /(^|\/)\.env($|\.)/.test(f) && !f.endsWith(".env.example"));
  out.push(envs.length ? { ok: false, text: `Ficheros .env en git: ${envs.join(", ")}. Sácalos y rota lo que contengan.` } : { ok: true, text: "Ningún .env en git" });

  let deps = [];
  try {
    const pkg = JSON.parse(read(join(cwd, "package.json")) || "{}");
    deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  } catch { /* package.json roto: no se comprueba */ }
  const active = new Set(lock.modulos);
  for (const d of deps) {
    const hit = DEP_MODULE.find(([re]) => re.test(d));
    if (hit && !active.has(hit[1])) out.push({ ok: false, text: `Hay "${d}" en package.json pero el módulo ${hit[1]} no está activo: revisa docs y seguridad-rgpd, y anótalo en el lock.` });
  }
  if (lock.modulos.some((m) => CON_DATOS_PERSONALES.includes(m))) {
    const has = (lock.skills ?? []).some((s) => s.id === "seguridad-rgpd");
    out.push(has
      ? { ok: true, text: "Datos personales: repasa seguridad-rgpd si esta sesión añadió un proveedor o datos nuevos" }
      : { ok: false, text: "El proyecto trata datos personales y no tiene la skill seguridad-rgpd" });
  }
  const pend = (lock.skills ?? []).filter((s) => s.estado === "pendiente").map((s) => s.id);
  if (pend.length) out.push({ ok: false, text: `Skills pendientes de instalar: ${pend.join(", ")}` });
  return out;
}

// ── close ───────────────────────────────────────────────────────────────────

const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "sesion";

function changesSinceLastClose(cwd) {
  // El último cierre es el último commit que trajo un handover (no el .gitkeep de la carpeta)
  const base = git(cwd, ["log", "-1", "--format=%H", "--", "memory/handovers-archive/HANDOVER-*.md"]) || null;
  const range = base ? [`${base}..HEAD`] : [];
  const commits = (git(cwd, ["log", "--format=%h %s", ...range]) ?? "").split("\n").filter(Boolean);
  const stat = git(cwd, ["diff", "--stat", ...(base ? [base] : [])]) ?? "";
  const status = (git(cwd, ["status", "--porcelain"]) ?? "").split("\n").filter(Boolean)
    .filter((l) => !l.slice(3).startsWith("memory/"));
  return { base, commits, stat, status };
}

export function close(cwd, { slug, today, log = console.log }) {
  const lock = readLock(cwd);
  if (!lock) throw new Error("No hay toolkit.lock.json: no es un proyecto del toolkit. Usa la skill cierre a mano.");
  const memDir = join(cwd, "memory");
  const existing = handovers(cwd).find((f) => read(join(memDir, "handovers-archive", f)).includes(HUECO));
  const ch = changesSinceLastClose(cwd);

  if (!existing && !ch.commits.length && !ch.status.length) {
    log("Nada que cerrar: sin commits ni cambios desde el último cierre. No se escribe nada.");
    return { nothing: true };
  }

  let file = existing;
  if (!file) {
    const branch = git(cwd, ["branch", "--show-current"]);
    const s = slugify(slug ?? (branch && !["main", "master"].includes(branch) ? branch : "sesion"));
    file = `HANDOVER-${today}-${s}.md`;
    for (let i = 2; existsSync(join(memDir, "handovers-archive", file)); i++) file = `HANDOVER-${today}-${s}-${i}.md`;
    const body = [
      `# Handover ${today}: ${s}`, "",
      "## Qué se hizo", HUECO, "",
      "## Qué queda", HUECO, "",
      "## Decisiones", `${HUECO} (o "ninguna")`, "",
      "## Cambios (generado por tk close)", "",
      ch.commits.length ? "Commits desde el último cierre:" : "Sin commits desde el último cierre.",
      ...ch.commits.map((c) => `- ${c}`),
      ...(ch.status.length ? ["", `Sin commitear: ${ch.status.length} fichero(s) fuera de memory/.`] : []),
      ...(ch.stat ? ["", "```", ch.stat, "```"] : []),
      "",
    ].join("\n");
    mkdirSync(join(memDir, "handovers-archive"), { recursive: true });
    writeFileSync(join(memDir, "handovers-archive", file), body);
    const idx = join(memDir, "MEMORY.md");
    const line = `- [Handover ${today}: ${s}](handovers-archive/${file}) - ${HUECO}`;
    const text = read(idx);
    writeFileSync(idx, text.replace(/\n*$/, "\n") + line + "\n");
    log(`+ memory/handovers-archive/${file}`);
    log("+ línea en memory/MEMORY.md");
  } else {
    log(`= memory/handovers-archive/${file} (ya existía con huecos sin rellenar)`);
  }

  const moved = prunePending(memDir, today);
  log(moved.length ? `~ pending.md: ${moved.length} sección(es) cerrada(s) a pending-archive.md` : "= pending.md: nada cerrado que archivar");

  log("\nChecklist:");
  for (const c of checklist(cwd, lock)) log(`  ${c.ok ? "✓" : "!"} ${c.text}`);

  log(`\nAhora, el agente (skill cierre):
  1. Rellena las marcas ${HUECO} de memory/handovers-archive/${file} y de memory/MEMORY.md.
  2. En memory/pending.md marca con ✅ (hecho) o ⛔ (descartado) lo que se cerró, y añade lo nuevo.
  3. Si hubo una corrección real, añádela a memory/lessons.md.
  4. Ejecuta: tk close --commit`);
  return { file };
}

export function commitClose(cwd, { today, log = console.log }) {
  const memDir = join(cwd, "memory");
  const pend = [];
  for (const f of handovers(cwd)) if (read(join(memDir, "handovers-archive", f)).includes(HUECO)) pend.push(`memory/handovers-archive/${f}`);
  if (read(join(memDir, "MEMORY.md")).includes(HUECO)) pend.push("memory/MEMORY.md");
  if (pend.length) throw new Error(`Quedan huecos sin rellenar (${HUECO}) en: ${pend.join(", ")}`);
  const moved = prunePending(memDir, today);
  if (moved.length) log(`~ pending.md: ${moved.length} sección(es) archivada(s)`);
  if (git(cwd, ["rev-parse", "--git-dir"]) === null) { log("No es un repo git: memoria escrita, sin commit."); return { committed: false }; }
  git(cwd, ["add", "memory/"]);
  const staged = git(cwd, ["diff", "--cached", "--name-only", "--", "memory/"]);
  if (!staged) { log("Nada nuevo en memory/ que commitear."); return { committed: false }; }
  // El título sale del handover que entra en este commit, no del último por nombre
  const stagedHo = staged.split("\n").map((f) => f.match(/handovers-archive\/(HANDOVER-[^/]+\.md)$/)?.[1]).filter(Boolean);
  const ho = stagedHo.at(-1) ?? handovers(cwd).at(-1) ?? "";
  const subject = ho.replace(/^HANDOVER-\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "").replace(/-/g, " ") || "cierre";
  // Solo memory/: el resto del trabajo lo commitea quien lo hizo, con su mensaje
  try {
    execFileSync("git", ["commit", "-q", "-m", `docs(memory): update - ${subject}`, "--", "memory/"], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    throw new Error(`git commit falló: ${(e.stderr ?? "").toString().trim() || e.message}`);
  }
  log(`+ commit ${git(cwd, ["log", "-1", "--format=%h %s"])} (sin push)`);
  return { committed: true };
}
