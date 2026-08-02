#!/bin/zsh
# os-summarize — summarize whatever the cursor has highlighted, using Claude.
#
#   os-summarize.sh                 # summarize the highlighted text selection
#   os-summarize.sh screen          # summarize the whole current screen
#   os-summarize.sh region          # drag a box, summarize what is inside it
#   os-summarize.sh clipboard       # summarize the clipboard
#   cat file | os-summarize.sh -    # summarize stdin
#
# Output is always copied to the clipboard. Use --out to pick what else happens.

set -euo pipefail

SELF="${0:A}"
REPO="${SELF:h:h}"

MODEL="${OS_SUMMARIZE_MODEL:-claude-haiku-4-5-20251001}"
MAX_TOKENS="${OS_SUMMARIZE_MAX_TOKENS:-700}"
SOURCE="selection"
OUTPUT="auto"
EXTRA=""
KEEP_IMAGE=0
TMPDIR_="$(mktemp -d -t os-summarize)"

SYSTEM_PROMPT='You summarize content a macOS user just highlighted or captured from their screen.

Rules:
- Open with one sentence stating what this is and its gist.
- Then at most five bullets carrying the concrete substance: names, numbers, decisions, deadlines, asks, errors.
- For a screenshot, name the app and screen, and say what state it is in or what the user appears to be doing.
- No preamble, no "this text discusses", no headers, no markdown emphasis. Plain text, hyphen bullets.
- Under 150 words. If the content is already short, be shorter.'

cleanup() { [ "$KEEP_IMAGE" -eq 1 ] || rm -rf "$TMPDIR_"; }
trap cleanup EXIT

usage() {
  sed -n '2,10p' "$SELF" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Sources:
  selection   copy the current highlighted text (default; needs Accessibility)
  screen      capture the entire screen
  region      drag-select a screen region, then summarize it
  clipboard   whatever is on the clipboard right now
  -           read stdin

Options:
  -o, --out MODE     auto | stdout | dialog | notify | quiet   (default: auto)
  -m, --model ID     Claude model id (default: claude-haiku-4-5-20251001)
  -p, --prompt TEXT  extra instruction, e.g. "focus on the action items"
  -t, --max-tokens N response cap (default: 700)
      --keep         keep the captured screenshot and print its path
  -h, --help         this
EOF
}

die() {
  local msg="$1"
  case "$OUTPUT" in
    dialog) osascript - "$msg" <<'APPLESCRIPT' >/dev/null 2>&1 || true
on run argv
  display alert "Summarize with Claude" message (item 1 of argv) as critical buttons {"OK"} default button "OK"
end run
APPLESCRIPT
      ;;
    notify) notify "Summarize with Claude failed" "$msg" ;;
  esac
  print -u2 "os-summarize: $msg"
  exit 1
}

notify() {
  osascript - "$1" "$2" <<'APPLESCRIPT' >/dev/null 2>&1 || true
on run argv
  display notification (item 2 of argv) with title (item 1 of argv)
end run
APPLESCRIPT
}

while [ $# -gt 0 ]; do
  case "$1" in
    selection|screen|region|clipboard) SOURCE="$1" ;;
    -|stdin)                           SOURCE="stdin" ;;
    -o|--out)        OUTPUT="${2:-}"; shift ;;
    -m|--model)      MODEL="${2:-}"; shift ;;
    -p|--prompt)     EXTRA="${2:-}"; shift ;;
    -t|--max-tokens) MAX_TOKENS="${2:-}"; shift ;;
    --keep)          KEEP_IMAGE=1 ;;
    -h|--help)       usage; exit 0 ;;
    *) print -u2 "os-summarize: unknown argument: $1"; usage >&2; exit 2 ;;
  esac
  shift
done

if [ "$OUTPUT" = "auto" ]; then
  if [ -t 1 ]; then OUTPUT="stdout"; else OUTPUT="dialog"; fi
fi

# --- credentials --------------------------------------------------------------
# Services and Quick Actions start with a bare environment, so fall back to the
# repo's .env.local the same way the Next.js app does.
load_key() {
  local name="$1" line val envfile
  eval "val=\${$name:-}"
  if [ -z "$val" ]; then
    for envfile in "${OS_SUMMARIZE_ENV_FILE:-}" "$HOME/.config/os-summarize/env" "$REPO/.env.local"; do
      [ -n "$envfile" ] && [ -r "$envfile" ] || continue
      line="$(grep -m1 "^[[:space:]]*${name}=" "$envfile" || true)"
      [ -n "$line" ] || continue
      val="${line#*=}"
      val="${val%\"}"; val="${val#\"}"
      val="${val%\'}"; val="${val#\'}"
      break
    done
  fi
  print -r -- "$val"
}

ANTHROPIC_API_KEY="$(load_key ANTHROPIC_API_KEY)"
OPENROUTER_API_KEY="$(load_key OPENROUTER_API_KEY)"

if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENROUTER_API_KEY" ]; then
  die "No ANTHROPIC_API_KEY or OPENROUTER_API_KEY. Export one, or put it in ~/.config/os-summarize/env."
fi

# --- capture ------------------------------------------------------------------
TEXT=""
IMAGE=""

capture_selection() {
  local prev sentinel cur i
  prev="$(pbpaste 2>/dev/null || true)"
  sentinel="__os_summarize_$$__"
  printf '%s' "$sentinel" | pbcopy

  if ! osascript -e 'tell application "System Events" to keystroke "c" using command down' >/dev/null 2>&1; then
    printf '%s' "$prev" | pbcopy
    die "Could not send Cmd+C. Grant Accessibility to the app running this (System Settings > Privacy & Security > Accessibility)."
  fi

  cur="$sentinel"
  for i in {1..24}; do
    cur="$(pbpaste 2>/dev/null || true)"
    [ "$cur" != "$sentinel" ] && break
    sleep 0.05
  done

  printf '%s' "$prev" | pbcopy   # put the user's clipboard back

  [ "$cur" = "$sentinel" ] && die "Nothing is highlighted, or the front app does not support Copy."
  TEXT="$cur"
}

capture_image() {
  IMAGE="$TMPDIR_/capture.png"
  if [ "$SOURCE" = "region" ]; then
    screencapture -x -i -t png "$IMAGE" || true
    [ -s "$IMAGE" ] || die "Region capture cancelled."
  else
    screencapture -x -t png "$IMAGE" \
      || die "Screen capture failed. Grant Screen Recording in System Settings > Privacy & Security."
  fi
  # Retina grabs are ~3400px wide; 1568 is the largest edge Claude uses anyway.
  sips -Z 1568 "$IMAGE" >/dev/null 2>&1 || true
  base64 -i "$IMAGE" | tr -d '\n' > "$TMPDIR_/image.b64"
}

case "$SOURCE" in
  selection)      capture_selection ;;
  clipboard)      TEXT="$(pbpaste 2>/dev/null || true)"
                  [ -n "$TEXT" ] || die "Clipboard is empty." ;;
  stdin)          TEXT="$(cat)"
                  [ -n "$TEXT" ] || die "No input on stdin." ;;
  screen|region)  capture_image ;;
esac

# --- request ------------------------------------------------------------------
if [ -n "$IMAGE" ]; then
  INSTRUCTION="Summarize this screen capture."
else
  INSTRUCTION="Summarize the following highlighted content."
fi
[ -n "$EXTRA" ] && INSTRUCTION="$INSTRUCTION $EXTRA"

PAYLOAD="$TMPDIR_/payload.json"
if [ -n "$IMAGE" ]; then
  jq -n --arg model "$MODEL" --argjson max "$MAX_TOKENS" --arg sys "$SYSTEM_PROMPT" \
        --arg instr "$INSTRUCTION" --rawfile b64 "$TMPDIR_/image.b64" '
    {model:$model, max_tokens:$max, system:$sys,
     messages:[{role:"user", content:[
       {type:"image", source:{type:"base64", media_type:"image/png", data:($b64|rtrimstr("\n"))}},
       {type:"text", text:$instr}]}]}' > "$PAYLOAD"
else
  jq -n --arg model "$MODEL" --argjson max "$MAX_TOKENS" --arg sys "$SYSTEM_PROMPT" \
        --arg instr "$INSTRUCTION" --arg body "$TEXT" '
    {model:$model, max_tokens:$max, system:$sys,
     messages:[{role:"user", content:[
       {type:"text", text:($instr + "\n\n<content>\n" + $body + "\n</content>")}]}]}' > "$PAYLOAD"
fi

RESPONSE="$(curl -sS --max-time 90 -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  --data-binary @"$PAYLOAD" 2>&1)" || die "Request failed: $RESPONSE"

ERR="$(printf '%s' "$RESPONSE" | jq -r '.error.message // empty' 2>/dev/null || true)"
[ -n "$ERR" ] && die "Anthropic API error: $ERR"

SUMMARY="$(printf '%s' "$RESPONSE" | jq -r '[.content[]? | select(.type=="text") | .text] | join("\n")' 2>/dev/null || true)"
[ -n "$SUMMARY" ] || die "Empty response from the model."

# --- output -------------------------------------------------------------------
printf '%s' "$SUMMARY" | pbcopy

case "$OUTPUT" in
  stdout) print -r -- "$SUMMARY" ;;
  quiet)  : ;;
  notify) notify "Summarized (copied)" "${SUMMARY%%$'\n'*}" ;;
  dialog)
    osascript - "$SUMMARY" <<'APPLESCRIPT' >/dev/null 2>&1 || true
on run argv
  display alert "Summary" message (item 1 of argv) buttons {"Done"} default button "Done"
end run
APPLESCRIPT
    ;;
  *) print -r -- "$SUMMARY" ;;
esac

[ "$KEEP_IMAGE" -eq 1 ] && [ -n "$IMAGE" ] && print -u2 "capture: $IMAGE"
exit 0
