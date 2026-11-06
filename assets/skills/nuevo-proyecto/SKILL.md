---
name: nuevo-proyecto
description: Arranca un proyecto nuevo con el toolkit. Pregunta qué se va a crear, propone arquitectura y módulos (completo, mínimo o a la carta), instala solo lo elegido para el agente en uso y crea memoria, AGENTS.md y DESIGN.md. Usar cuando el usuario empieza un proyecto o pide "nuevo proyecto".
---

# Nuevo proyecto

El toolkit vive en `~/.toolkit`. Todo lo de esta skill son **propuestas**: nada se instala
ni se escribe sin que el usuario lo confirme. Si pide algo que no está en el toolkit, se usa
eso y punto; al final se le ofrece guardarlo con `anadir-al-toolkit`.

## Paso 0. Skills externas del core

Comprueba si están instaladas para el agente en uso las de `~/.toolkit/core/EXTERNAS.md`
(`grill-me`, `find-skills`, `humanizer`). Si falta alguna, di cuáles y ofrece instalarlas
con el comando de ese archivo. Se instalan una vez por máquina y agente (en global), no
por proyecto. Si el usuario dice que no, sigue sin ellas.

## Paso 1. Entender qué se va a crear

1. Pregunta en una frase qué es el proyecto y para quién.
2. Si la skill `grill-me` está instalada, úsala para cerrar las decisiones abiertas. Si no,
   haz tú las preguntas que falten: ¿tiene usuarios?, ¿cobra?, ¿envía correos?, ¿usa IA?,
   ¿qué datos guarda?, ¿web, API o agente?
3. Comprueba la carpeta: ¿está vacía?, ¿es repo git?, ¿hay vault de Obsidian cerca? (lo dice
   el arranque).

## Paso 2. Arquitectura

Lista `~/.toolkit/arquitecturas/*.md`, lee la que encaje y propónla con su motivo. Si
ninguna encaja, dilo y trabaja sin arquitectura base. Cada arquitectura trae su lista de
módulos recomendados.

## Paso 3. Módulos

Ofrece tres arranques:

- **Completo:** todos los módulos que la arquitectura marca como recomendados u opcionales.
- **Mínimo:** solo el core (ya está instalado globalmente: arranque, cierre, seguridad-rgpd).
- **A la carta:** enseña la tabla de `~/.toolkit/modulos/README.md` y el usuario elige.

Preselecciona los recomendados por la arquitectura. Para cada módulo elegido, lee su
`MODULO.md`: ahí están las decisiones que hay que tomar (por ejemplo, en `datos`: Mongo,
Neon o Turso) y los comandos de instalación.

## Paso 4. Instalar

Detecta el agente en uso para el flag `-a` de `npx skills`:

| Agente | `-a` |
|---|---|
| Claude Code | `claude-code` |
| Codex | `codex` |
| Hermes | `hermes-agent` |
| Otro | ver `npx skills add --help` |

Reglas:
- Skills de terceros: **en el proyecto** (sin `-g`), para que cada proyecto lleve solo lo suyo.
  Si el usuario trabaja con varios agentes en el proyecto, repite `-a` por cada uno.
- Si una herramienta ofrece plugin de Claude Code **y** skills, en Claude usa el plugin y no
  instales también las skills (quedarían duplicadas).
- Dependencias npm (`npm i ...`): enséñalas todas juntas y pide confirmación antes de instalar.
- MCP con OAuth (Stripe, Neon, Resend...): explica qué da acceso a qué; la autenticación la
  hace el usuario.
- Comandos marcados "sin verificar" en un `MODULO.md`: comprueba la fuente antes de ejecutarlos.

## Paso 5. Escribir la base del proyecto

Pide confirmación y crea:

1. **`AGENTS.md` del proyecto** (y `CLAUDE.md` con una sola línea `@AGENTS.md`): qué es el
   proyecto, arquitectura elegida, stack, módulos activos, comandos (dev, test, lint, build),
   y dónde está la memoria y el vault. Corto: reglas y enlaces, no documentación.
2. **Memoria:** copia `~/.toolkit/plantillas/memory/` a `memory/` (o deja que lo haga la
   skill `cierre` en el primer cierre si el usuario prefiere). Primera entrada de
   `pending.md`: los puntos de `seguridad-rgpd` que aplican.
3. **`DESIGN.md`** si hay módulo `diseno`: copia `~/.toolkit/plantillas/DESIGN.md` y
   rellénalo con el usuario (o parte de un DESIGN.md de getdesign.md como referencia).
4. **`docs/decisions/`** con un ADR por cada decisión tomada en el paso 1 a 3 (base de
   datos, auth, etc.): contexto, decisión, alternativas descartadas.
5. **Identidad de git:** fíjala en el repo antes del primer commit (`git config user.email`).
   Si el usuario tiene varias identidades (personal y trabajo) y nada en su configuración
   decide cuál toca, pregúntale. Nunca la deduzcas de la cuenta de la app.
6. **Vault de Obsidian:** si no existe, ofrécelo como describe la skill `cierre` (symlink
   relativo de la memoria al vault, un vault por proyecto).

## Paso 6. Cerrar

Resume: arquitectura, módulos instalados (y para qué agente), lo que quedó pendiente de
decidir y el primer paso de desarrollo. Si se usó algo que no estaba en el toolkit, ofrece
`anadir-al-toolkit`.
