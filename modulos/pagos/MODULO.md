---
id: pagos
title: Pagos
when: El proyecto cobra
gives: Cobros, suscripciones y facturación con Stripe, decididos por webhook
costs: Cuenta en Stripe y comisión por cobro; webhooks que mantener; DPA aceptado
requires: []
conflicts: []
skills: [stripe]
---

# Módulo: pagos

## Qué incluye
| Pieza | Tipo | Para qué |
|---|---|---|
| Stripe | Servicio + plugin + skills + MCP | Cobros, suscripciones, facturación |

## Cuándo
El proyecto cobra.

## Decisiones
- Checkout (página de Stripe) o Elements (embebido). Por defecto Checkout: menos código y
  menos superficie.
- ¿Pago único o suscripción? ¿Customer Portal para que el usuario gestione su plan?

## Instalación (verificado)
Claude: `claude plugin install stripe@claude-plugins-official`
Otros agentes:
```bash
npx skills add https://docs.stripe.com -a <agente>
```
Todo en uno (plugin + MCP + skills): `npm install -g @stripe/cli@latest` y `stripe agent setup`.
MCP oficial: https://mcp.stripe.com (OAuth). Aviso de Stripe: desde diciembre de 2026 el MCP
no acepta claves secretas completas ni restringidas sin etiqueta Agent.

## Cumplimiento y seguridad
- Los datos de tarjeta nunca pasan por tu servidor (Checkout o Elements).
- Webhooks con verificación de firma; el estado del pago se decide por webhook, no por la
  redirección del navegador.
- Claves test y live separadas, solo en variables de entorno.
- DPA de Stripe aceptado y listado.
