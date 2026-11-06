#!/bin/bash
# Gate contra secretos y datos personales. Lo usa el pre-commit y, en F6, el publish.
#   scripts/audit.sh --staged     lo que va a entrar en el commit
#   scripts/audit.sh <carpeta>    un directorio (por ejemplo, el tarball de npm pack extraído)
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
  echo "$hits" | cut -c1-200 >&2
  fail=1
fi

[ $fail = 0 ] && echo "audit: limpio" || echo "audit: BLOQUEADO" >&2
exit $fail
