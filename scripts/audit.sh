#!/bin/bash
# Gate contra secretos y datos personales. Lo usa el pre-commit y, en F6, el publish.
#   scripts/audit.sh --staged     lo que va a entrar en el commit
#   scripts/audit.sh <carpeta>    un directorio
#   scripts/audit.sh --pack       el paquete tal cual se publicaría (npm pack, extraído aparte)
# La denylist vive en el repo privado; si no se encuentra, el audit falla (nunca pasa a ciegas).
set -u
DENY="${TOOLKIT_DENYLIST:-$HOME/.toolkit/privado/denylist.txt}"
fail=0

if [ ! -f "$DENY" ]; then
  echo "audit: no encuentro la denylist ($DENY). Define TOOLKIT_DENYLIST." >&2
  exit 1
fi
command -v gitleaks >/dev/null || { echo "audit: falta gitleaks (brew install gitleaks)" >&2; exit 1; }
PATTERNS="$(grep -vE '^\s*(#|$)' "$DENY")"

if [ "${1:-}" = "--pack" ]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  # --dry-run=false: dentro de `npm publish --dry-run` npm hereda dry_run y no escribiría el tgz
  npm pack --silent --dry-run=false --pack-destination "$tmp" >/dev/null || { echo "audit: npm pack falló" >&2; exit 1; }
  mkdir "$tmp/x" && tar -xzf "$tmp"/*.tgz -C "$tmp/x"
  set -- "$tmp/x/package"
  # Estilo del autor: sin raya larga en nada de lo que se publica
  dashes="$(grep -rlF "$(printf '\342\200\224')" "$1" 2>/dev/null)"
  if [ -n "$dashes" ]; then echo "audit: raya larga en: $dashes" >&2; fail=1; fi
fi

if [ "${1:-}" = "--staged" ]; then
  gitleaks git --pre-commit --staged --redact --no-banner -v || fail=1
  # Solo líneas añadidas, sin cabeceras de diff
  hits="$(git diff --cached -U0 --no-color | grep -E '^\+[^+]' | grep -inE -f <(echo "$PATTERNS"))"
else
  dir="${1:?uso: audit.sh --staged | <carpeta>}"
  gitleaks dir "$dir" --redact --no-banner -v || fail=1
  hits="$(grep -rinE -f <(echo "$PATTERNS") "$dir")"
fi

if [ -n "$hits" ]; then
  echo "audit: datos personales o privados encontrados:" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    # En CI solo fichero y línea: el log no puede repetir el dato que se quiere proteger
    echo "$hits" | cut -d: -f1-2 >&2
  else
    echo "$hits" | cut -c1-200 >&2
  fi
  fail=1
fi

[ $fail = 0 ] && echo "audit: limpio" || echo "audit: BLOQUEADO" >&2
exit $fail
