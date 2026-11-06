---
id: api
title: API
for: Backend sin interfaz
recommended: [repo-seguridad, datos, testing, auditoria]
optional: [auth, email, pagos, ingenieria]
---

# Arquitectura: API

Backend sin interfaz: servicio para otras apps, integraciones o webhooks.

## Stack base
TypeScript en Vercel Functions (Next route handlers o un framework backend como Hono).

## Reglas
- zod en cada entrada y respuesta tipada.
- Autenticación por token o OAuth; límites de uso por cliente.
- Protección SSRF si la API hace peticiones a URLs que le pasan.
- Logs sin datos sensibles.

## Módulos
- **Recomendados:** repo-seguridad, datos, testing, auditoria
- **Opcionales:** auth, email, pagos, ingenieria
