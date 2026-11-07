// Wizard interactivo. Solo recoge decisiones y devuelve la misma config que configFromFlags:
// todo lo que escribe lo hace execute(), igual que en modo --yes.
import * as p from "@clack/prompts";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { resolveModules } from "./plan.mjs";
import { skillChoices, resolveSkills, today } from "./new.mjs";

const cut = (s, n = 70) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function ask(v) {
  if (p.isCancel(v)) { p.cancel("Cancelado. No se ha escrito nada."); process.exit(0); }
  return v;
}

export async function runWizard(catalog, detected, identity) {
  p.intro("tk: proyecto nuevo");
  const f = detected.folder;
  p.note([
    `Carpeta: ${f.empty ? "vacía" : "con contenido (lo que se sustituya se guarda como .bak-toolkit)"}${f.git ? ", repo git" : ""}`,
    `Agentes: ${detected.agents.join(", ") || "ninguno detectado"}`,
    `Skills globales: ${Object.keys(detected.globalSkills).length}`,
  ].join("\n"), "Detectado");

  const description = ask(await p.text({
    message: "¿Qué vas a construir? (una frase: qué es y para quién)",
    placeholder: "Reservas online para clínicas pequeñas",
  }));

  const architecture = ask(await p.select({
    message: "Tipo de proyecto",
    options: Object.values(catalog.architectures).map((a) => ({ value: a.id, label: a.title, hint: a.for })),
  }));
  const arch = catalog.architectures[architecture];

  const order = [...arch.recommended, ...arch.optional, ...Object.keys(catalog.modules).filter((m) => !arch.recommended.includes(m) && !arch.optional.includes(m))];
  const picked = ask(await p.multiselect({
    message: "Módulos (espacio marca, enter acepta). Marcados: los recomendados",
    options: order.map((id) => {
      const m = catalog.modules[id];
      const tag = arch.recommended.includes(id) ? "" : arch.optional.includes(id) ? "opcional · " : "otro · ";
      return { value: id, label: m.title, hint: cut(`${tag}da: ${m.gives} | cuesta: ${m.costs}`, 110) };
    }),
    initialValues: arch.recommended,
    required: false,
  }));
  const modules = resolveModules(catalog, picked);
  const added = modules.filter((m) => !picked.includes(m));
  if (added.length) p.log.info(`Añadido por dependencia: ${added.join(", ")}`);

  const options = {};
  for (const id of modules) {
    const opts = catalog.modules[id].options;
    if (!opts) continue;
    options[id] = ask(await p.select({
      message: `${catalog.modules[id].title}: ¿cuál?`,
      options: Object.keys(opts).map((k) => ({ value: k, label: k, hint: opts[k].join(", ") })),
    }));
  }

  const choices = skillChoices(catalog, { modules, options, globalSkills: detected.globalSkills });
  p.note(choices.fixed.map((s) => `${s.id}: ${cut(s.para_que, 80)}${s.porModulos.length ? `  (por ${s.porModulos.join(", ")})` : ""}`).join("\n"), "Incluidas y obligatorias (no se quitan)");

  const elegibles = [...choices.recomendadas, ...choices.opcionales];
  const chosen = elegibles.length ? ask(await p.multiselect({
    message: "Skills para el proyecto. Marcadas: las recomendadas",
    options: elegibles.map((s) => ({
      value: s.id,
      label: s.id,
      hint: cut(`${s.nivel === "opcional" ? "opcional · " : ""}${s.para_que}${s.global ? " · ya global" : ""}${s.verificado === false ? " · sin verificar" : ""}`, 110),
    })),
    initialValues: choices.recomendadas.map((s) => s.id),
    required: false,
  })) : [];

  const sugeridas = choices.recomendadas.filter((s) => !chosen.includes(s.id));
  if (sugeridas.length) {
    const add = ask(await p.multiselect({
      message: "Quitaste estas recomendadas. ¿Recuperas alguna?",
      options: sugeridas.map((s) => ({ value: s.id, label: s.id, hint: cut(s.para_que) })),
      required: false,
    }));
    chosen.push(...add);
  }

  const yaGlobales = elegibles.filter((s) => chosen.includes(s.id) && s.global);
  let alsoInProject = [];
  if (yaGlobales.length) {
    alsoInProject = ask(await p.multiselect({
      message: "Estas ya las tienes en global. ¿Cuáles quieres también en el proyecto? (viajan con el repo y las ve cualquier agente)",
      options: yaGlobales.map((s) => ({ value: s.id, label: s.id, hint: s.global.dirs.join(", ") })),
      required: false,
    }));
  }
  const faltanGlobales = choices.global.filter((s) => !s.global);
  if (faltanGlobales.length) p.log.info(`Skills de máquina que no tienes: ${faltanGlobales.map((s) => s.id).join(", ")}. Se ofrecen al final.`);

  let design = null;
  if (modules.includes("diseno")) {
    const kind = ask(await p.select({
      message: "Sistema de diseño (para que el agente no se lo invente)",
      options: [
        { value: "file", label: "Tengo un DESIGN.md", hint: "se copia al proyecto" },
        { value: "tokens", label: "Tengo tokens", hint: "JSON o CSS con colores, tipografía, radios..." },
        { value: "figma", label: "Lo tengo en Figma", hint: "enlace" },
        { value: "reference", label: "No tengo", hint: "se parte de una referencia de getdesign.md, nunca del tema por defecto" },
      ],
    }));
    design = { kind, value: null };
    if (kind === "file" || kind === "tokens") {
      const path = ask(await p.text({
        message: "Ruta del fichero",
        validate: (v) => (!v || !existsSync(resolve(v)) || statSync(resolve(v)).isDirectory() ? "No encuentro ese fichero" : undefined),
      }));
      design.value = resolve(path);
    } else if (kind === "figma") {
      design.value = ask(await p.text({ message: "Enlace de Figma", validate: (v) => (/^https:\/\/(www\.)?figma\.com\//.test(v ?? "") ? undefined : "Tiene que ser un enlace de figma.com") }));
    }
  }

  let chosenIdentity = identity.detected.decided;
  let reason = identity.detected.reason;
  if (chosenIdentity) {
    p.log.info(`Git: ${chosenIdentity.label} <${chosenIdentity.email}> (${reason})`);
  } else if (identity.detected.candidates.length) {
    const v = ask(await p.select({
      message: "¿Con qué identidad de git?",
      options: [
        ...identity.detected.candidates.map((c) => ({ value: c.email, label: `${c.label}`, hint: c.email })),
        { value: "", label: "Ahora no", hint: "queda en pending.md" },
      ],
    }));
    chosenIdentity = identity.detected.candidates.find((c) => c.email === v) ?? null;
    reason = "elegida en el arranque";
  }
  if (chosenIdentity && !chosenIdentity.name) chosenIdentity = { ...chosenIdentity, name: identity.detected.candidates.find((c) => c.name)?.name ?? null };

  return {
    description,
    architecture,
    modules,
    options,
    skills: resolveSkills(catalog, choices, chosen, alsoInProject),
    design,
    identity: chosenIdentity,
    identityReason: reason,
    agents: detected.agents,
    date: today(),
  };
}

export async function confirmApply(summary) {
  p.note(summary, "Resumen");
  return ask(await p.confirm({ message: "¿Aplicar?", initialValue: true }));
}

export async function askConsent(steps) {
  const run = steps.filter((s) => s.kind === "run");
  if (!run.length) return "ninguno";
  p.note(run.map((s) => `${s.obligatoria ? "[obligatoria] " : ""}${s.text}`).join("\n"), "Comandos de terceros (código de sus repos)");
  return ask(await p.select({
    message: `¿Ejecuto estos ${run.length} comandos?`,
    options: [
      { value: "todos", label: "Todos" },
      { value: "obligatorios", label: "Solo los obligatorios" },
      { value: "ninguno", label: "Ninguno", hint: "quedan apuntados en memory/pending.md" },
    ],
  }));
}

export const outro = (msg) => p.outro(msg);
