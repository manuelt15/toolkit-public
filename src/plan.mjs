// Del catálogo + lo elegido + lo detectado, a qué módulos y skills tocan. Lógica pura:
// sin E/S, para poder testearla entera.

export const NIVELES = ["incluida", "obligatoria", "recomendada", "opcional"];

// Módulos de una arquitectura más los que estos requieren (mapas requiere diseno...)
export function resolveModules(catalog, ids) {
  const out = [];
  const visit = (id) => {
    if (out.includes(id)) return;
    const m = catalog.modules[id];
    if (!m) throw new Error(`módulo desconocido: ${id}`);
    for (const r of m.requires ?? []) visit(r);
    out.push(id);
  };
  ids.forEach(visit);
  return out;
}

/**
 * @param catalog   catalog.json
 * @param modules   ids de módulos elegidos (ya resueltos)
 * @param options   { datos: "neon", ... } opción elegida en módulos con varias
 * @param globalSkills  resultado de detectGlobalSkills
 */
export function planSkills(catalog, { modules, options = {}, globalSkills = {} }) {
  const pendingOptions = [];
  for (const id of modules) {
    const opts = catalog.modules[id].options;
    if (opts && !options[id]) pendingOptions.push({ module: id, choices: Object.keys(opts) });
  }

  const picked = Object.values(catalog.skills).filter((s) => {
    const c = s.cuando ?? {};
    if (c.siempre) return true;
    const hit = (c.modulos ?? []).filter((m) => modules.includes(m));
    if (!hit.length) return false;
    if (c.opcion) return hit.some((m) => options[m] === c.opcion);
    return true;
  });

  // Una colección elegida tapa a las sueltas que ya trae (mattpocock-skills incluye grill-me y tdd)
  const covered = new Set(picked.flatMap((s) => s.incluye ?? []));

  const entry = (s) => ({
    id: s.id,
    para_que: s.para_que,
    nivel: s.nivel,
    scope: s.scope,
    origen: s.origen,
    instalar: s.instalar,
    plugin_claude: s.plugin_claude,
    licencia: s.licencia,
    verificado: s.verificado ?? null,
    aviso: s.aviso ?? null,
    porModulos: (s.cuando?.modulos ?? []).filter((m) => modules.includes(m)),
    global: globalSkills[s.id] ?? null,
  });

  const kept = picked.filter((s) => !covered.has(s.id));
  const project = kept.filter((s) => s.scope === "proyecto").map(entry);
  const global = kept.filter((s) => s.scope === "global").map(entry);
  const byLevel = Object.fromEntries(NIVELES.map((n) => [n, project.filter((s) => s.nivel === n)]));
  return { byLevel, global, pendingOptions, covered: [...covered] };
}
