---
id: analisis
title: Análisis de código
when: Repos grandes o heredados que hay que entender rápido
gives: Grafo de conocimiento del código, docs y SQL en local con Graphify
costs: Python 3.10+ y uv instalados; sin cuenta; la parte local es gratis
requires: []
conflicts: []
skills: [graphify]
---

# Módulo: análisis de código

## Qué incluye
| Pieza | Tipo | Para qué |
|---|---|---|
| Graphify | CLI Python + skill | Grafo de conocimiento del codebase (código, docs, SQL, PDFs) en local |

## Cuándo
Repos grandes o heredados que hay que entender rápido.

## Instalación
```bash
uv tool install graphifyy
graphify install
```
Luego, en el agente: `/graphify .`. Requiere Python 3.10+. El paquete lleva doble "y".
Tiene oferta de pago aparte (Graphify Cloud); la parte local es suficiente.
