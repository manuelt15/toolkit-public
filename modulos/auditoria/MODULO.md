---
id: auditoria
title: Auditoría de seguridad
when: Antes de lanzar y tras cambios grandes de auth, pagos o datos
gives: Auditoría en 6 fases con informe REPORT.md y avisos de seguridad mientras programas
costs: Sin cuenta ni dinero; la auditoría ejecuta código del repo, mejor en sandbox
requires: []
conflicts: []
skills: [security-audit, security-guidance]
---

# Módulo: auditoría

## Qué incluye
| Pieza | Tipo | Para qué |
|---|---|---|
| `security-audit` (Cloudflare) | Skill | Auditoría en 6 fases con verificación adversarial; genera `REPORT.md` |
| `security-guidance` | Plugin oficial de Claude | Avisos de seguridad mientras se programa |

## Cuándo
Antes de lanzar (lo exige `seguridad-rgpd`) y tras cambios grandes de auth, pagos o datos.

## Instalación
```bash
npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit -a <agente>
```
Claude: `/plugin install security-guidance@claude-plugins-official`.

## Notas
- La auditoría de Cloudflare puede ejecutar código del repo: hacerlo en sandbox.
