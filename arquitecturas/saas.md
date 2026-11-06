---
id: saas
title: SaaS
for: App con usuarios, cuentas y pagos
recommended: [librerias, repo-seguridad, diseno, next-react, datos, auth, email, pagos, testing, auditoria, legal]
optional: [ingenieria, agentes-ia, mapas]
---

# Arquitectura: SaaS

App web con usuarios, datos propios por usuario y, normalmente, pagos.

## Stack base
Next.js (App Router) + TypeScript, desplegado en Vercel.

## Estructura
```
app/
  (marketing)/        # Páginas públicas y legales
  (app)/              # Zona autenticada
  api/                # Route handlers (webhooks de Stripe, etc.)
lib/
  db/                 # Esquema, cliente y consultas (Drizzle o Mongo)
  auth/               # Configuración de Better Auth
  validation/         # Esquemas zod compartidos
components/ui/        # shadcn
emails/               # Plantillas React Email
docs/decisions/       # ADRs
memory/               # Memoria del proyecto (arranque y cierre)
```

## Reglas
- Toda consulta filtra por el usuario de la sesión en el servidor. Test A≠B obligatorio.
- zod en cada entrada: formularios, route handlers, server actions, webhooks.
- El estado de pago lo decide el webhook de Stripe, no la redirección.
- Secretos solo en variables de entorno (`vercel env`).

## Módulos
- **Recomendados:** librerias, repo-seguridad, diseno, next-react, datos, auth, email, pagos, testing, auditoria, legal
- **Opcionales:** ingenieria, agentes-ia, mapas
