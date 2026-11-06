---
id: email
title: Email
when: El proyecto envía correos
gives: Plantillas con React Email y envío con Resend
costs: Cuenta en Resend (capa gratis); dominio verificado con DNS; DPA aceptado
requires: []
conflicts: []
skills: [resend, react-email, email-best-practices]
---

# Módulo: email

## Qué incluye
| Pieza | Tipo | Para qué |
|---|---|---|
| React Email | Librería + skill | Plantillas de correo en React |
| Resend | Servicio + skills + MCP | Envío de correos |

Son pareja: React Email diseña, Resend envía.

## Cuándo
El proyecto envía correos (transaccionales, códigos de acceso, avisos).

## Instalación (verificado)
```bash
npx skills add resend/resend-skills -a <agente>
```
Incluye `resend`, `react-email`, `email-best-practices`, `resend-cli` y `agent-email-inbox`.
El repo también es plugin de Claude Code (registra el MCP). MCP oficial:
https://mcp.resend.com/mcp (OAuth). En Claude, plugin **o** skills, no ambos.

## Cumplimiento
- DPA de Resend aceptado y listado en privacidad.
- Región UE para el dominio si tu cuenta lo permite (sin verificar: comprobar al crear el dominio).
- `RESEND_API_KEY` solo en variables de entorno; claves distintas para desarrollo y producción.
- Correos de marketing: consentimiento aparte y baja en un clic.
