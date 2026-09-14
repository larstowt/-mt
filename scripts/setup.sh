#!/usr/bin/env bash
# Opsaetning af AI-medarbejdere: tjekker Node, laver .env, beder om API-noegle og starter.
set -euo pipefail

cd "$(dirname "$0")/.."

bold=$'\033[1m'; dim=$'\033[2m'; red=$'\033[31m'; green=$'\033[32m'; yellow=$'\033[33m'; off=$'\033[0m'
say() { printf '%s\n' "$*"; }

say ""
say "${bold}AI-medarbejdere – opsætning${off}"
say ""

# ---------------------------------------------------------------- 1. Node-tjek
if ! command -v node > /dev/null 2>&1; then
  say "${red}Node er ikke installeret.${off}"
  say "Hent LTS-versionen på https://nodejs.org og kør dette script igen."
  exit 1
fi

node_version="$(node -v)"
if ! node -e 'const [maj, min] = process.versions.node.split(".").map(Number); process.exit(maj > 20 || (maj === 20 && min >= 12) ? 0 : 1)'; then
  say "${red}Node ${node_version} er for gammel – der skal bruges 20.12 eller nyere.${off}"
  say "Hent LTS-versionen på https://nodejs.org og kør dette script igen."
  exit 1
fi
say "${green}✓${off} Node ${node_version}"

# ------------------------------------------------------------------- 2. .env
if [ ! -f .env ]; then
  cp .env.example .env
  say "${green}✓${off} Oprettede .env"
else
  say "${green}✓${off} .env findes allerede"
fi
chmod 600 .env 2>/dev/null || true

# Skriver en noegle ind i .env uden at aendre resten af filen.
set_key() {
  local name="$1" value="$2" tmp
  tmp="$(mktemp)"
  awk -v k="$name" -v v="$value" '
    BEGIN { done = 0 }
    $0 ~ "^" k "=" { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' .env > "$tmp"
  mv "$tmp" .env
  chmod 600 .env 2>/dev/null || true
}

has_key() {
  grep -Eq '^(ANTHROPIC_API_KEY|XAI_API_KEY|OPENAI_API_KEY)=.+' .env
}

# ---------------------------------------------------------------- 3. API-nøgle
if [ ! -t 0 ]; then
  say "${dim}(ikke en terminal – springer spørgsmålene over)${off}"
elif has_key; then
  say "${green}✓${off} Der er allerede en API-nøgle i .env"
else
  say ""
  say "${bold}Hvilken model skal medarbejderne bruge?${off}"
  say "  1) Anthropic – Claude      ${dim}console.anthropic.com${off}"
  say "  2) xAI – Grok              ${dim}console.x.ai${off}"
  say "  3) OpenAI eller lignende   ${dim}platform.openai.com${off}"
  say "  4) Spring over – kør i demo-tilstand med simulerede svar"
  say ""
  printf 'Vælg [1-4]: '
  read -r choice

  case "$choice" in
    1) key_name="ANTHROPIC_API_KEY" ;;
    2) key_name="XAI_API_KEY" ;;
    3) key_name="OPENAI_API_KEY" ;;
    *) key_name="" ;;
  esac

  if [ -n "$key_name" ]; then
    printf 'Indsæt din nøgle (den vises ikke mens du skriver): '
    read -rs key_value
    printf '\n'
    if [ -n "${key_value// /}" ]; then
      set_key "$key_name" "$key_value"
      say "${green}✓${off} Gemte ${key_name} i .env"
    else
      say "${yellow}!${off} Ingen nøgle indtastet – kører i demo-tilstand"
    fi
  else
    say "${yellow}!${off} Kører i demo-tilstand. Du kan altid sætte en nøgle i .env senere."
  fi
fi

# ------------------------------------------------------------------- 4. Start
port="${PORT:-4173}"
url="http://127.0.0.1:${port}"

say ""
if [ ! -t 0 ]; then
  say "${green}Klar.${off} Start med:  ${bold}npm start${off}   (så ligger den på ${url})"
  exit 0
fi

say "${green}Klar.${off} Starter på ${bold}${url}${off}  ${dim}(Ctrl+C for at stoppe)${off}"
say ""

# Åbn browseren når serveren svarer – i baggrunden, så den ikke blokerer.
(
  for _ in $(seq 1 40); do
    if node -e "fetch('${url}/api/state').then(() => process.exit(0), () => process.exit(1))" > /dev/null 2>&1; then
      if command -v open > /dev/null 2>&1; then open "$url"
      elif command -v xdg-open > /dev/null 2>&1; then xdg-open "$url" > /dev/null 2>&1
      fi
      exit 0
    fi
    sleep 0.25
  done
) &

exec npm start
