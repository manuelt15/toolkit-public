# toolkit

Un comando para empezar un proyecto con agentes de IA (Claude Code, Codex, Hermes): te
pregunta qué vas a construir, propone módulos y skills explicando para qué sirve cada una,
y deja el proyecto con un flujo de sesión (arranque y cierre) que cualquier agente sigue.

**Estado:** en desarrollo. Todavía no está publicado en npm.

## Qué hace (cuando esté listo)

- **Arranque:** detecta tus agentes y las skills que ya tienes en global, y te guía por
  arquitectura, módulos (qué te dan y qué te cuestan) y skills.
- **Proyecto:** escribe `AGENTS.md`, `DESIGN.md` si hay interfaz, la memoria del proyecto y
  un `toolkit.lock.json` con lo instalado.
- **Sesión:** `start` da el contexto al empezar; `close` deja handover y pendientes para que
  la siguiente sesión, con el agente que sea, sepa qué seguir.

## Condiciones

- Se ofrece tal cual (as-is), sin soporte ni plazos. No se aceptan PRs de módulos.
- Las skills de terceros no se incluyen: se instalan desde su origen, con su licencia, y
  siempre enseñando el comando antes.
- Sin telemetría y sin scripts de instalación (`postinstall`).
- Una versión publicada en npm no se puede reemplazar. Si alguna vez se filtrara un secreto,
  se rota; borrar el paquete no lo arregla.

## Licencia

MIT
