#!/bin/zsh
# usage: adapt.sh <source key, e.g. 2245F> <codex|cursor>
# Adapts one Codeforces problem into staging/x<key>/t01 under ~/.arbor-bench/v3.
set -u
KEY=$1; BACKEND=${2:-cursor}
BASE=$HOME/.arbor-bench/v5-cf
STAGE=$HOME/.arbor-bench/v3/staging/x$KEY
GRADER=/Users/yanzihao/Documents/miyohacks-research/lib/swarm/bench-grader.py
LOG=$BASE/logs/$KEY.log
mkdir -p $STAGE $BASE/logs
cp $BASE/raw/$KEY.json $STAGE/source.json
PROMPT=$(sed -e "s|{GRADER}|$GRADER|g" -e "s|{SOURCE}|cf$KEY|g" $BASE/adapt-brief.txt)
cd $STAGE
if [ "$BACKEND" = codex ]; then
  CODEX_HOME=$HOME/.arbor-bench/v3/codex-author-home codex exec --skip-git-repo-check -m gpt-6.1-sol \
    -c 'model_provider="caveman"' \
    -c 'model_providers.caveman={name="Caveman",base_url="http://127.0.0.1:8787/chatgpt",wire_api="responses",requires_openai_auth=true}' \
    -c model_reasoning_effort=high -c 'sandbox_mode="workspace-write"' "$PROMPT" > $LOG 2>&1
else
  cursor-agent -p --trust --force --model gemini-4-argon-high "$PROMPT" < /dev/null > $LOG 2>&1
fi
echo "exit $?" >> $LOG
# Mark a validated adaptation so the v5 cycle collects it.
python3 $GRADER validate $STAGE/t01 2>/dev/null | tail -1 | grep -q '"ok": true' && touch $STAGE/t01/.kept && echo "adapted ok" >> $LOG
