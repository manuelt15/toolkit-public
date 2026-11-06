---
id: ingenieria
title: Ingeniería
when: Proyectos medianos o grandes
gives: Método de trabajo con skills pequeñas (spec, tickets, tdd, review, diagnóstico)
costs: Nada en dinero; elegir una sola colección, se solapan
requires: []
conflicts: []
options:
  mattpocock: [mattpocock-skills]
  addyosmani: [addyosmani-agent-skills]
skills: [finishing-a-development-branch]
---

# Módulo: ingeniería

## Opción por defecto: Matt Pocock
Skills pequeñas y combinables: `grill-me`, `tdd`, `diagnosing-bugs`, `to-spec`,
`to-tickets`, `implement`, `improve-codebase-architecture`, `code-review`, `handoff`.

```bash
npx skills@latest add mattpocock/skills -a <agente>
```
Claude: `claude plugin install mattpocock-skills@claude-plugins-official` (no instalar
también las skills: se duplican). Después, una vez por repo: `/setup-matt-pocock-skills`.

## Alternativa para probar: Addy Osmani
25 skills y comandos `/spec`, `/plan`, `/build`, `/test`, `/review`, `/ship`.
```bash
npx skills add addyosmani/agent-skills -a <agente>
```
Claude: `/plugin marketplace add addyosmani/agent-skills` y `/plugin install agent-skills@addy-agent-skills`.

**No instalar las dos colecciones en el mismo proyecto:** se solapan (TDD, review, spec) y el
agente recibe instrucciones que compiten.

## Otros del marketplace oficial de Claude
`code-review`, `pr-review-toolkit`, `feature-dev`, `commit-commands`, `typescript-lsp`.
