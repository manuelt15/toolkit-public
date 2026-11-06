---
id: agentes-ia
title: Agentes IA
when: Apps con agentes o funciones de IA
gives: Agentes durables con eve o llamadas a modelos con AI SDK, con la skill de cada uno
costs: Pago por uso del proveedor de modelos; cuenta en Vercel si usas eve o AI Gateway; obligaciones de transparencia del AI Act
requires: []
conflicts: []
options:
  eve: [eve]
  ai-sdk: [ai-sdk]
skills: []
---

# Módulo: agentes IA

## Qué incluye
| Pieza | Tipo | Para qué |
|---|---|---|
| eve (Vercel) | Framework | Agentes durables: sesiones, herramientas, skills, sandboxes, schedules |
| eve-software-factory-template | Plantilla | "Foreman": de issue de GitHub/Linear a PR en borrador con 4 agentes |
| AI SDK | Librería | Llamadas a modelos, streaming, tool calling |

## Cuándo
Apps con agentes o funciones de IA. La plantilla de fábrica es laboratorio.

## Instalación
- eve: https://eve.dev/docs (seguir la guía de inicio de la versión actual).
- Software factory: botón "Deploy with Vercel" en
  https://github.com/vercel-labs/eve-software-factory-template.

## Cumplimiento (IA)
Avisar qué se envía al modelo, salida validada con esquema, límite por usuario,
transparencia (AI Act). Ver `seguridad-rgpd`.
