#!/bin/zsh
# Adversarial authoring loop for bank v3.
# usage: author-loop.sh <author-id> <count> <topic text...>
# For each problem: Codex writes and validates it (sandboxed, no network);
# this script probes it with the screener (outside the sandbox); if the
# screener solved it, the same Codex session is resumed with the screener's
# program and asked for a harder revision, up to HARDEN_ROUNDS times.
set -u
AUTHOR=$1; COUNT=$2; shift 2; TOPIC="$*"
BASE=$HOME/.arbor-bench/v3
REPO=/Users/yanzihao/Documents/miyohacks-research
GRADER=$REPO/lib/swarm/bench-grader.py
SCREENER=cursor:gemini-3.7-flash-high
HARDEN_ROUNDS=3
DIR=$BASE/staging/$AUTHOR
LOG=$BASE/logs/$AUTHOR.log
mkdir -p "$DIR" "$BASE/codex-author-home"
[ -e "$BASE/codex-author-home/auth.json" ] || ln -s "$HOME/.codex/auth.json" "$BASE/codex-author-home/auth.json"
export CODEX_HOME=$BASE/codex-author-home
CODEX_ARGS=(-m gpt-6.1-sol -c 'model_provider="caveman"'
  -c 'model_providers.caveman={name="Caveman",base_url="http://127.0.0.1:8787/chatgpt",wire_api="responses",requires_openai_auth=true}'
  -c model_reasoning_effort=high -c 'sandbox_mode="workspace-write"' --skip-git-repo-check)

brief_for() {
  sed -e "s|{TOPIC}|$TOPIC|g" -e "s|{COUNT}|1|g" -e "s|{LAST}|$1|g" -e "s|{GRADER}|$GRADER|g" \
      -e "s|t01, t02, ... t$1|t$1|" -e 's|"author": "codex:gpt-6.1-sol"|"author": "codex:gpt-6.1-sol+probe"|' "$BASE/brief.txt"
}

probe() {
  (cd $REPO && npx tsx scripts/bench.ts probe --task "$1" --screener $SCREENER 2>/dev/null | tail -1)
}

cd "$DIR"
for i in $(seq 1 $COUNT); do
  NN=$(printf '%02d' $i)
  [ -f "$DIR/t$NN/.kept" ] && continue
  OUT=$(codex exec "${CODEX_ARGS[@]}" "$(brief_for $NN)" 2>&1); echo "$OUT" >> $LOG
  SESSION=$(echo "$OUT" | grep -m1 -o 'session id: [0-9a-f-]*' | cut -d' ' -f3)
  for round in $(seq 0 $HARDEN_ROUNDS); do
    RESULT=$(probe "$DIR/t$NN"); echo "probe t$NN round $round: $(echo $RESULT | head -c 300)" >> $LOG
    VALID=$(echo "$RESULT" | python3 -c 'import json,sys
try: print(json.loads(sys.stdin.read()).get("valid"))
except Exception: print("error")')
    PASSED=$(echo "$RESULT" | python3 -c 'import json,sys
try: print(json.loads(sys.stdin.read()).get("passed"))
except Exception: print("error")')
    if [ "$VALID" = "True" ] && [ "$PASSED" = "False" ]; then touch "$DIR/t$NN/.kept"; echo "t$NN kept after $round harden rounds" >> $LOG; break; fi
    [ "$round" = "$HARDEN_ROUNDS" ] && { echo "t$NN gave up" >> $LOG; break; }
    [ -z "$SESSION" ] && { echo "t$NN no session id" >> $LOG; break; }
    if [ "$VALID" != "True" ]; then
      FEEDBACK="Validation of t$NN failed: $(echo $RESULT | head -c 1500). Fix t$NN and re-run the validator until ok."
    else
      CODE=$(echo "$RESULT" | python3 -c 'import json,sys; print(json.loads(sys.stdin.read()).get("code") or "")')
      FEEDBACK="A strong AI model solved t$NN: its program below passes every hidden test. Revise t$NN so that this program's approach is wrong or too slow, while the problem stays natural, fully specified and solvable by the intended algorithm. Prefer adding a genuine extra insight over adding wording traps. Keep all files consistent, keep naive.py failing, and re-run the validator until ok.

\`\`\`python
$CODE
\`\`\`"
    fi
    OUT=$(codex exec resume "${CODEX_ARGS[@]}" "$SESSION" "$FEEDBACK" 2>&1); echo "$OUT" >> $LOG
  done
done
echo "author $AUTHOR done" >> $LOG
