---
id: landing
title: Landing
for: Web de marketing o estática
recommended: [repo-seguridad, diseno, next-react, legal]
optional: [email, mapas]
---

# Arquitectura: landing

Web de marketing o contenido, sin cuentas de usuario.

## Stack base
Next.js (App Router, páginas estáticas) + TypeScript, desplegado en Vercel.

## Estructura
```
app/                  # Páginas, casi todo estático
components/ui/        # shadcn
content/              # Textos o MDX
docs/decisions/
memory/
```

## Reglas
- Sin cookies no técnicas: si hace falta analítica, sin cookies (sin banner).
- Formularios de contacto: zod en servidor, límite de uso, y aviso de privacidad junto al formulario.
- Rendimiento y accesibilidad por encima de efectos.

## Módulos
- **Recomendados:** repo-seguridad, diseno, next-react, legal
- **Opcionales:** email (formulario de contacto), mapas
