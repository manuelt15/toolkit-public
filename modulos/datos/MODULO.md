---
id: datos
title: Datos
when: Si hay persistencia
gives: Base de datos elegida (Neon, Turso o MongoDB) con su ORM, sus skills y región UE
costs: Cuenta en el proveedor (todos tienen capa gratis); DPA aceptado; backups a probar
requires: []
conflicts: []
options:
  neon: [neon-postgres]
  turso: [turso-db]
  mongodb: [mongodb-connection, mongodb-schema-design]
skills: []
---

# Módulo: datos

## Decisión principal: qué base de datos

| Opción | Cuándo | ORM / cliente |
|---|---|---|
| **MongoDB** | Datos con forma variable o documentos anidados | **Mongoose** |
| **Neon** (Postgres serverless) | Datos relacionales, consultas complejas, integridad fuerte, ramas de BD por preview | **Drizzle** |
| **Turso** (SQLite/libSQL) | Proyectos pequeños o medianos, latencia baja, réplicas cerca del usuario, coste mínimo | **Drizzle** |

Regla rápida: si dudas entre relacional o documento, Neon. Si es pequeño y quieres coste
casi cero, Turso. Mongo cuando el modelo de datos de verdad es de documentos.
La decisión se apunta como ADR en `docs/decisions/`.

## Instalación

### Neon (verificado)
```bash
npx skills add neondatabase/agent-skills -a <agente>
```
En Claude, mejor el plugin (incluye el MCP): `/plugin marketplace add neondatabase/agent-skills`
y `/plugin install neon-postgres@neon`. MCP oficial: https://mcp.neon.tech (OAuth).
Drizzle: guía oficial https://orm.drizzle.team/docs/get-started/neon-new (sin verificar URL).

### Turso (sin verificar)
Guía Drizzle + Turso: https://orm.drizzle.team/docs/get-started/turso-new (sin verificar URL).
Skills oficiales: comprobar en https://docs.turso.tech al usarlo.

### MongoDB (sin verificar)
MCP oficial: paquete `mongodb-mcp-server`; skills oficiales: comprobar en la documentación
de MongoDB al usarlo.

## Cumplimiento
- Región UE (Neon: eu-central-1 Frankfurt; Turso y Atlas permiten región UE) y DPA aceptado.
- Backups con restauración probada.
- Aislamiento por usuario en las consultas (test A≠B).

## Notas
- Con Mongo, Mongoose es la opción por defecto.
  Esquemas de Mongoose para el modelo y zod para validar entradas: no son lo mismo.
- Una sola herramienta de migraciones por proyecto (drizzle-kit en Neon/Turso).
