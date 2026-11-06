---
id: auth
title: Autenticación
when: Proyectos con usuarios
gives: Login con Better Auth (OAuth, enlace por correo, 2FA, organizaciones) y sus buenas prácticas de seguridad
costs: Dependencia better-auth; app OAuth en cada proveedor que uses; secreto en variables de entorno
requires: [datos]
conflicts: []
skills: [better-auth-best-practices, better-auth-security-best-practices, organization-best-practices]
---

# Módulo: auth

## Qué incluye
| Pieza | Tipo | Para qué |
|---|---|---|
| Better Auth | Librería | Auth en TypeScript, con OAuth, magic link, 2FA, organizaciones |
| Skills de Better Auth | Skills | `best-practices`, `create-auth`, `emailAndPassword`, `organization`, `twoFactor`, `security` |

## Cuándo
Proyectos con usuarios.

## Decisiones
- Método: OAuth o código/enlace por correo antes que contraseña (ver `seguridad-rgpd`).
- ¿Organizaciones/equipos? Entonces skill `organization`.

## Instalación
```bash
npx skills add better-auth/skills -a <agente>        # (sin verificar: el repo no trae README)
npx skills add https://github.com/better-auth/skills --skill better-auth-security-best-practices -a <agente>
```
En Claude existe el marketplace `better-auth-agent-skills` con el plugin `auth-skills`
(solo `create-auth` y `best-practices`).

## Cumplimiento
- `BETTER_AUTH_SECRET` solo en variables de entorno.
- MFA en cuentas de administración.
- Borrado total de cuenta desde la app.
