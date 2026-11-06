# Módulos

Opciones, no obligaciones. Cada uno tiene su `MODULO.md` con qué incluye, cuándo usarlo,
decisiones, instalación y puntos de cumplimiento. La skill `nuevo-proyecto` lee esta tabla.

| Módulo | Qué trae | Cuándo |
|---|---|---|
| [diseno](diseno/MODULO.md) | Tu sistema de diseño primero, shadcn/ui sobre Radix, Taste, Emil, `@shadcn/lint`, DESIGN.md | Cualquier proyecto con UI |
| [mapas](mapas/MODULO.md) | mapcn | Si hay mapas |
| [next-react](next-react/MODULO.md) | `next-best-practices`, `vercel-react-best-practices` | Proyectos Next |
| [datos](datos/MODULO.md) | MongoDB, Neon o Turso; Drizzle para SQL | Si hay persistencia |
| [auth](auth/MODULO.md) | Better Auth + skills | Si hay usuarios |
| [email](email/MODULO.md) | React Email + Resend | Si se envían correos |
| [pagos](pagos/MODULO.md) | Stripe | Si se cobra |
| [testing](testing/MODULO.md) | Vitest, Playwright, Cucumber, Stryker, `tdd` | Si el proyecto lo pide |
| [librerias](librerias/MODULO.md) | zod, Temporal, TanStack Table, Motion, nuqs... | Según necesidad |
| [repo-seguridad](repo-seguridad/MODULO.md) | gh-secure, Gitleaks | Al crear el repo en GitHub |
| [ingenieria](ingenieria/MODULO.md) | Matt Pocock (o Addy Osmani) | Proyectos medianos o grandes |
| [auditoria](auditoria/MODULO.md) | `security-audit`, `security-guidance` | Antes de lanzar |
| [legal](legal/MODULO.md) | Plantillas legales base | Si hay usuarios |
| [agentes-ia](agentes-ia/MODULO.md) | eve, software factory, AI SDK | Apps con agentes o IA |
| [analisis](analisis/MODULO.md) | Graphify | Repos grandes o heredados |

Para añadir uno: skill `anadir-al-toolkit`.
