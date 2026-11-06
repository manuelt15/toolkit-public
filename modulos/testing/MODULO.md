---
id: testing
title: Testing
when: Si hay usuarios (tests mínimos de aislamiento) o el proyecto lo pide
gives: Vitest de base y, a elegir, Playwright, Gherkin y Stryker; ciclo rojo-verde con el agente
costs: Dependencias de desarrollo; Stryker es lento, solo en lógica crítica
requires: []
conflicts: []
skills: [tdd, playwright]
---

# Módulo: testing

Todo es opcional: se elige lo que el proyecto necesita. Vitest es la base por defecto.

## Qué incluye
| Pieza | Tipo | Para qué |
|---|---|---|
| Vitest | Librería | Tests de lógica y unidades (por defecto en proyectos Vite/Next) |
| Jest | Librería | Alternativa a Vitest si el proyecto ya lo usa. **No usar los dos** |
| Playwright | Librería + plugin/MCP | Tests end to end del flujo principal |
| Gherkin + Cucumber.js | Librería | Especificaciones ejecutables en lenguaje natural |
| StrykerJS | Librería | Mutation testing: comprueba que los tests detectan fallos de verdad |
| `tdd` (Matt Pocock) | Skill | Ciclo rojo-verde con el agente (módulo `ingenieria`) |

## Cuándo
- **Mínimo si hay usuarios:** test de aislamiento A≠B, IDOR y borrado total (los exige
  `seguridad-rgpd`).
- **Flujo spec-driven** (idea de Uncle Bob: el humano escribe la especificación, la IA
  genera el código y los tests automáticos validan): Gherkin para las especificaciones,
  Vitest para unidades y Stryker para medir si los tests sirven. Útil cuando el agente
  escribe casi todo el código y quieres confiar en él sin leer cada línea.
- **Stryker:** en lógica crítica (precios, permisos, cálculos), no en todo el proyecto:
  es lento.

## Instalación
```bash
npm install -D vitest
npm init playwright@latest
```

Cucumber.js con TypeScript (compila al vuelo con tsx):
```bash
npm install -D @cucumber/cucumber tsx
npx cucumber-js --require-module tsx/cjs --require 'features/step-definitions/**/*.ts'
```
En proyectos ESM: crear `tsx-register.js` con `import { register } from 'tsx/esm/api'; register()`
y ejecutar `npx cucumber-js --import ./tsx-register.js --import 'features/step-definitions/**/*.ts'`.

StrykerJS con Vitest:
```bash
npm init stryker@latest
npm i -D @stryker-mutator/vitest-runner
npx stryker run
```
En `stryker.config.mjs`: `"testRunner": "vitest"`. Limitaciones: no soporta el Browser Mode
de Vitest.

Playwright para agentes: plugin `playwright` del marketplace oficial de Claude o el MCP
`@playwright/mcp` (sin verificar comandos).

## Estructura sugerida (spec-driven)
```
features/                    # .feature en Gherkin (lo escribes tú)
  step-definitions/          # Pasos en TypeScript (los escribe el agente)
src/**/*.test.ts             # Vitest
stryker.config.mjs
```
