#!/bin/zsh
# Repeats: collect loop-kept tasks -> validate -> seal into the Argon screen
# bank -> bench screen (re-screens no_code) -> count v4-eligible survivors.
# Stops at TARGET survivors or at the 20:00 PDT cutoff (protocol amendment).
set -u
BASE=$HOME/.arbor-bench/v3
REPO=/Users/yanzihao/Documents/miyohacks-research
C=$BASE/argon-candidates
TARGET=30
V3_DEV="c3-t01 c7-t03 c8-t03 d2-t01 d7-t03 e1-t05 e1-t06 e8-t01"
LOG=$BASE/logs/v4-cycle.log

eligible() {
  python3 - "$V3_DEV" <<'EOF'
import json, os, sys
excluded = set(sys.argv[1].split())
latest = {}
for line in open(os.path.expanduser('~/.arbor-bench/v3/screen-argon/screen.jsonl')):
    row = json.loads(line); latest[row['task']] = row
keep = sorted(t for t, r in latest.items() if not r['passed'] and r['verdict'] != 'no_code' and t not in excluded)
print(len(keep), ' '.join(keep))
EOF
}

while :; do
  for k in $BASE/staging/[fgh]*/t*/.kept(N); do
    d=${k:h}; a=${d:h:t}; t=${d:t}
    [ -e $C/$a/$t ] && continue
    python3 $REPO/lib/swarm/bench-grader.py validate $d 2>/dev/null | tail -1 | grep -q '"ok": true' || continue
    mkdir -p $C/$a; ln -sfn $d $C/$a/$t; echo "$(date +%T) candidate $a/$t" >> $LOG
  done
  (cd $REPO && npx tsx scripts/bench.ts seal --staging $C --bank $BASE/screen-bank-argon --key $BASE/bench-key/screen-key 2>/dev/null | tail -2 | head -1) >> $LOG
  (cd $REPO && npx tsx scripts/bench.ts screen --bank $BASE/screen-bank-argon --key $BASE/bench-key/screen-key --out $BASE/screen-argon --screener cursor:gemini-4-argon-medium --tasks 5 >> $BASE/screen-argon/screen.log 2>&1)
  RESULT=$(eligible); echo "$(date +%T) eligible: $RESULT" >> $LOG
  [ "${RESULT%% *}" -ge $TARGET ] && { echo "$(date +%T) target reached" >> $LOG; break; }
  [ "$(date +%H%M)" -ge 2000 ] && { echo "$(date +%T) cutoff reached" >> $LOG; break; }
  sleep 600
done
echo done > $BASE/logs/V4_CYCLE_DONE
