# DESIGN.md

> Estructura basada en el formato de getdesign.md. Rellenar con el usuario al crear el
> proyecto; es la referencia visual que siguen los agentes.
>
> Origen: el sistema de diseño del usuario (DESIGN.md propio, tokens o Figma). Si no tiene,
> una referencia de getdesign.md adaptada con él. Nunca el tema por defecto de shadcn.
>
> Regla para agentes: toda UI sale de este fichero. Si falta un token, pregunta en vez de
> inventarlo. Componentes shadcn sobre Radix, restilados con estos tokens.

## Esencia
Qué tiene que transmitir la interfaz, en tres palabras y una frase.

## Color
| Token | Valor claro | Valor oscuro | Uso |
|---|---|---|---|
| `--background` | | | Fondo |
| `--foreground` | | | Texto principal |
| `--primary` | | | Acción principal |
| `--muted` | | | Superficies secundarias |
| `--border` | | | Bordes |
| `--destructive` | | | Errores y acciones destructivas |

Contraste mínimo WCAG 2.2 AA.

## Tipografía
Familias, escala (tamaños y alturas de línea), pesos y tracking.

## Espaciado y layout
Escala de espaciado, radios, ancho máximo, rejilla, breakpoints.

## Componentes
Botones, inputs, tarjetas, navegación: variantes y estados (hover, foco, deshabilitado, error).

## Movimiento
Duraciones, curvas, qué se anima y qué no. Respeta `prefers-reduced-motion`.

## Iconografía e imagen
Librería de iconos, estilo de ilustración o foto.

## Voz
Tono de los textos. Sin raya larga, sin relleno.

## Qué no hacer
Lista de cosas que rompen el estilo.
