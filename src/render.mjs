// Texto del plan para la terminal. Sin colores: se lee igual en CI y en un log.
import { NIVELES } from "./plan.mjs";

const TITULOS = {
  incluida: "INCLUIDAS (parte del flujo, no se pueden quitar)",
  obligatoria: "OBLIGATORIAS POR TUS MÓDULOS",
  recomendada: "RECOMENDADAS",
  opcional: "OPCIONALES",
};

function line(s) {
  const marks = [];
  if (s.porModulos.length) marks.push(`por: ${s.porModulos.join(", ")}`);
  if (s.verificado === false) marks.push("sin verificar");
  if (s.global) marks.push(`ya global en ${s.global.dirs.join(", ")}`);
  const tail = marks.length ? `   (${marks.join("; ")})` : "";
  return `   ${s.id.padEnd(34)} ${s.para_que}${tail}`;
}

export function renderPlan({ plan, detected }) {
  const out = [];
  const f = detected.folder;
  out.push(`Detectado: Node ${detected.node}; carpeta ${f.empty ? "vacía" : "con contenido"}${f.git ? ", repo git" : ""}${f.toolkitLock ? ", ya tiene toolkit.lock.json" : ""}`);
  out.push(`Agentes: ${detected.agents.length ? detected.agents.join(", ") : "ninguno detectado"}`);
  out.push(`Skills globales encontradas: ${Object.keys(detected.globalSkills).length}`);
  out.push("");
  out.push(`Arquitectura: ${plan.architecture.title} (${plan.architecture.for})`);
  out.push(`Módulos: ${plan.modules.join(", ")}`);
  if (plan.optionalModules.length) out.push(`Opcionales (con --modules): ${plan.optionalModules.join(", ")}`);
  for (const p of plan.pendingOptions) out.push(`Falta elegir en ${p.module}: ${p.choices.join(" | ")}  (--option ${p.module}=<opción>)`);
  out.push("");
  out.push("Skills para el proyecto");
  for (const n of NIVELES) {
    const list = plan.byLevel[n];
    if (!list.length) continue;
    out.push(`  ${TITULOS[n]}`);
    list.forEach((s) => out.push(line(s)));
  }
  if (plan.global.length) {
    out.push("");
    out.push("Skills globales (una vez por máquina)");
    plan.global.forEach((s) => out.push(line(s)));
  }
  if (plan.covered.length) out.push(`\nNo se ofrecen sueltas porque ya vienen en una colección: ${plan.covered.join(", ")}`);
  out.push("\n(dry-run: no se ha escrito nada)");
  return out.join("\n");
}
