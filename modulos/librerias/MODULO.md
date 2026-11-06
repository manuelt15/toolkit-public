---
id: librerias
title: Librerías
when: Según necesidad
gives: Opción por defecto para cada necesidad (zod, Temporal, TanStack Table, Motion, nuqs...)
costs: Cada librería es una dependencia y se confirma antes de instalarla
requires: []
conflicts: []
skills: []
---

# Módulo: librerías

Catálogo por necesidad. No se instala en bloque: cuando el proyecto necesita algo de la
tabla, se usa esta opción por defecto (y se pregunta antes de añadir la dependencia).

| Necesidad | Librería | Paquete npm | Notas |
|---|---|---|---|
| Validación | zod | `zod` | Obligatoria en toda entrada (ver `seguridad-rgpd`) |
| Fechas | Temporal | `temporal-polyfill` o `@js-temporal/polyfill` | API estándar de JS; aún no es Baseline en todos los navegadores, así que con polyfill |
| Tablas | TanStack Table | `@tanstack/react-table` | Headless: el estilo lo pone tu sistema de diseño |
| Auth | Better Auth | `better-auth` | Ver módulo `auth` |
| Animaciones | Motion | `motion` | Con las skills de Emil (módulo `diseno`); respetar reduced-motion |
| Tipografías | Fontsource | `@fontsource/<fuente>` | Fuentes self-hosted, sin pedir a Google desde el navegador (RGPD) |
| Gráficas | Chart.js | `chart.js` | Para React: `react-chartjs-2` |
| Estado global | Zustand | `zustand` | Solo si el estado no cabe en servidor, URL o props |
| Drag & drop | Pragmatic drag and drop | `@atlaskit/pragmatic-drag-and-drop` | De Atlassian, ligero |
| Estado en la URL | nuqs | `nuqs` | Filtros, pestañas y paginación compartibles; Next >= 14.2 |

## Orden para elegir dónde vive el estado
Servidor (datos) > URL (nuqs) > estado local del componente > Zustand (global de cliente).

## Notas
- Fontsource en vez de Google Fonts desde el navegador: evita enviar la IP del usuario a
  Google (hay sentencias en la UE por esto).
- Comprueba la versión actual de cada paquete al instalar; esta tabla no fija versiones.
