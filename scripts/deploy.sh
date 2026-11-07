#!/usr/bin/env bash
# One-shot deploy for Dhruv's Exam Center.
# Reads secrets from ./.env (see .env.example). Safe to re-run: every step is idempotent.
#   bash scripts/deploy.sh            # everything
#   bash scripts/deploy.sh supabase   # database + functions + users only
#   bash scripts/deploy.sh github     # site only
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Missing .env — copy .env.example to .env and fill it in"; exit 1; }
set -a; . ./.env; set +a
WHAT="${1:-all}"
API=https://api.supabase.com/v1
REF="${SUPABASE_PROJECT_REF:?set SUPABASE_PROJECT_REF}"
AUTH=(-H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN}" -H "Content-Type: application/json")
jsonstr() { node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0,"utf8")))'; }

run_sql_file() {
  echo "  → $1"
  local body; body=$(printf '{"query": %s}' "$(jsonstr < "$1")")
  local out; out=$(curl -sS -X POST "$API/projects/$REF/database/query" "${AUTH[@]}" -d "$body")
  if echo "$out" | grep -q '"message"'; then
    if echo "$out" | grep -qi 'already exists'; then echo "    (already applied)"; else echo "    SQL error: $out"; exit 1; fi
  fi
}

if [ "$WHAT" = all ] || [ "$WHAT" = supabase ]; then
  echo "▶ 1/5 Database schema + syllabus"
  node scripts/build-seed.mjs >/dev/null
  run_sql_file supabase/migrations/20261101000000_init.sql
  run_sql_file supabase/migrations/20261101000100_seed.sql

  echo "▶ 2/5 Auth: turn off public sign-ups"
  curl -sS -X PATCH "$API/projects/$REF/config/auth" "${AUTH[@]}" -d '{"disable_signup": true}' >/dev/null && echo "  sign-ups disabled"

  echo "▶ 3/5 Secrets + edge functions"
  [ -n "${ANTHROPIC_API_KEY:-}" ] && npx --yes supabase@2 secrets set --project-ref "$REF" ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
    ${GEN_MODEL:+GEN_MODEL=$GEN_MODEL} ${GRADE_MODEL:+GRADE_MODEL=$GRADE_MODEL} ${GODMODE_MODEL:+GODMODE_MODEL=$GODMODE_MODEL} ${TUTOR_MODEL:+TUTOR_MODEL=$TUTOR_MODEL} >/dev/null || echo "  (Anthropic key already stored in Supabase)"
  for f in generate-exam grade-attempt ingest-handout tutor; do
    npx --yes supabase@2 functions deploy "$f" --project-ref "$REF" --no-verify-jwt --use-api >/dev/null 2>&1 \
      || npx --yes supabase@2 functions deploy "$f" --project-ref "$REF" --no-verify-jwt
    echo "  deployed $f"
  done

  echo "▶ 4/5 Logins for Dhruv and Parent"
  KEYS=$(curl -sS "$API/projects/$REF/api-keys?reveal=true" "${AUTH[@]}")
  SERVICE=$(echo "$KEYS" | node -e 'const k=JSON.parse(require("fs").readFileSync(0));const s=k.find(x=>x.name==="service_role")||k.find(x=>x.type==="secret");process.stdout.write(s.api_key)')
  ANON=$(echo "$KEYS" | node -e 'const k=JSON.parse(require("fs").readFileSync(0));const s=k.find(x=>x.name==="anon")||k.find(x=>x.type==="publishable");process.stdout.write(s.api_key)')
  URL="https://$REF.supabase.co"
  mkuser() { # email password name
    local out; out=$(curl -sS -X POST "$URL/auth/v1/admin/users" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" -H "Content-Type: application/json" \
      -d "{\"email\":\"$1\",\"password\":\"$2\",\"email_confirm\":true,\"user_metadata\":{\"display_name\":\"$3\"}}")
    if echo "$out" | grep -q '"id"'; then echo "  created $3 ($1)"; elif echo "$out" | grep -qi 'already'; then echo "  $3 already exists (password unchanged)"; else echo "  user error: $out"; exit 1; fi
  }
  mkuser "${PARENT_EMAIL:-dpatodia@gmail.com}" "${PARENT_PASSWORD:?set PARENT_PASSWORD}" "Parent"
  mkuser "${DHRUV_EMAIL:-dpatodia+dhruv@gmail.com}" "${DHRUV_PASSWORD:?set DHRUV_PASSWORD}" "Dhruv"

  echo "▶ Writing web/src/config.js"
  node -e '
    const fs=require("fs"); const p="web/src/config.js"; let s=fs.readFileSync(p,"utf8");
    s=s.replace(/SUPABASE_URL = .*;/, `SUPABASE_URL = ${JSON.stringify(process.argv[1])};`)
       .replace(/SUPABASE_ANON_KEY = .*;/, `SUPABASE_ANON_KEY = ${JSON.stringify(process.argv[2])};`);
    fs.writeFileSync(p,s);' "$URL" "$ANON"
fi

if [ "$WHAT" = all ] || [ "$WHAT" = github ]; then
  echo "▶ 5/5 GitHub repo + Pages"
  : "${GITHUB_TOKEN:?set GITHUB_TOKEN}"; : "${GITHUB_REPO:?set GITHUB_REPO like dpatodia/dhruv-exam-center}"
  GH=(-H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json")
  NAME="${GITHUB_REPO#*/}"
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "${GH[@]}" "https://api.github.com/repos/$GITHUB_REPO")" != 200 ]; then
    curl -sS -X POST "${GH[@]}" https://api.github.com/user/repos -d "{\"name\":\"$NAME\",\"private\":false,\"description\":\"Dhruv's Exam Center\"}" >/dev/null && echo "  repo created"
  fi
  TMP=$(mktemp -d)
  git -C "$TMP" init -q -b main
  tar --exclude=./node_modules --exclude=./dist --exclude=./.env --exclude=./.git --exclude="*.tgz" -cf - . | tar -xf - -C "$TMP"
  git -C "$TMP" add -A
  git -C "$TMP" -c user.name="Exam Center" -c user.email="${PARENT_EMAIL:-dpatodia@gmail.com}" commit -qm "Deploy $(date -u +%F\ %H:%M)" || true
  git -C "$TMP" push -q -f "https://x-access-token:$GITHUB_TOKEN@github.com/$GITHUB_REPO.git" main && echo "  pushed"
  rm -rf "$TMP"
  curl -sS -X POST "${GH[@]}" "https://api.github.com/repos/$GITHUB_REPO/pages" -d '{"build_type":"workflow"}' >/dev/null || true
  OWNER="${GITHUB_REPO%%/*}"
  echo "  Site (live in ~2 min): https://$OWNER.github.io/$NAME/"
fi
echo "✅ Done"
