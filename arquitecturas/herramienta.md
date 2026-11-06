---
id: herramienta
title: Herramienta
for: Uso personal o interno, pocos usuarios
recommended: [repo-seguridad, next-react, datos]
optional: [diseno, auth, testing, analisis]
---

# Arquitectura: herramienta

Uso personal o interno, pocos usuarios conocidos. Prioriza rapidez sobre escala.

## Stack base
Next.js + TypeScript. Base de datos ligera (Turso) si hace falta persistencia.

## Reglas
- Si hay más usuarios que tú: auth y aislamiento igualmente.
- Aunque sea interna, secretos en variables de entorno y nada de datos reales en el repo.

## Módulos
- **Recomendados:** repo-seguridad, next-react, datos
- **Opcionales:** diseno, auth, testing, analisis
