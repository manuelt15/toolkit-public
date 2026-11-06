---
id: agente-ia
title: Agente IA
for: App centrada en agentes o IA
recommended: [repo-seguridad, agentes-ia, next-react, datos, auditoria]
optional: [auth, diseno, email, pagos, testing]
---

# Arquitectura: agente IA

App cuyo núcleo es un agente o funciones de IA (chat, automatizaciones, tareas largas).

## Stack base
eve o AI SDK sobre Next.js/Vercel. eve si hay sesiones durables, schedules o subagentes;
AI SDK solo si son llamadas puntuales dentro de una app normal.

## Reglas
- Herramientas mínimas: el agente solo tiene las que necesita.
- Salidas validadas con esquema antes de usarlas.
- Límite de uso por usuario y por coste.
- Avisar al usuario de qué datos se envían al modelo (AI Act).
- Ninguna acción irreversible sin confirmación humana.

## Módulos
- **Recomendados:** repo-seguridad, agentes-ia, next-react, datos, auditoria
- **Opcionales:** auth, diseno, email, pagos, testing
