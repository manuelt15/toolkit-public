// Perfil del usuario: vive fuera del paquete (repo privado) y tk solo lo lee.
// Dónde se busca: --profile <ruta>, TOOLKIT_PROFILE, o ~/.config/tk/profile.json.
// Formato:
//   { "nombre": "...", "agents_md": "AGENTS.md",
//     "identidades": [ { "cuenta": "personal", "github": "user", "email": "..." },
//                      { "cuenta": "trabajo", "github": "user2", "detectar": "global" } ] }
// Lo que aporta: un bloque <!-- toolkit:profile --> en AGENTS.md y nombres claros para las
// identidades de git. El email nunca se escribe en el proyecto (ni en el lock).
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";

export function loadProfile({ home, flag, env = process.env }) {
  const path = flag ?? env.TOOLKIT_PROFILE ?? join(home, ".config/tk/profile.json");
  if (!existsSync(path)) {
    if (flag || env.TOOLKIT_PROFILE) throw new Error(`No encuentro el perfil: ${path}`);
    return null;
  }
  const real = realpathSync(path); // los ficheros del perfil son relativos a donde vive de verdad
  const p = JSON.parse(readFileSync(real, "utf8"));
  if (!p.nombre) throw new Error(`El perfil ${path} no tiene "nombre"`);
  const mdPath = p.agents_md ? join(dirname(real), p.agents_md) : null;
  if (mdPath && !existsSync(mdPath)) throw new Error(`El perfil apunta a ${p.agents_md}, que no existe`);
  return {
    nombre: p.nombre,
    block: mdPath ? readFileSync(mdPath, "utf8").trim() : null,
    identidades: p.identidades ?? [],
  };
}

const labelFor = (i) => (i.github ? `${i.cuenta} (${i.github})` : i.cuenta);

// Pone nombre de cuenta a las identidades detectadas y añade las del perfil que falten
export function applyProfileToIdentities(detected, profile) {
  if (!profile?.identidades?.length) return detected;
  const candidates = detected.candidates.map((c) => ({ ...c }));
  const fallbackName = candidates.find((c) => c.name)?.name ?? null;
  for (const i of profile.identidades) {
    const hit = candidates.find((c) => (i.email && c.email === i.email) || (i.detectar && c.label === i.detectar));
    if (hit) hit.label = labelFor(i);
    else if (i.email) candidates.push({ label: labelFor(i), name: fallbackName, email: i.email, sources: ["perfil"] });
  }
  // "Única identidad" deja de valer si el perfil añade otra; una regla gitdir sigue decidiendo
  const byRule = detected.decided && detected.candidates.length > 1;
  let decided = detected.decided && (byRule || candidates.length === 1)
    ? candidates.find((c) => c.email === detected.decided.email) ?? null : null;
  let reason = decided ? detected.reason : "hay varias identidades y nada decide cuál";
  if (!decided && candidates.length === 1) { decided = candidates[0]; reason = "única identidad (con el perfil)"; }
  return { candidates, decided, reason };
}
