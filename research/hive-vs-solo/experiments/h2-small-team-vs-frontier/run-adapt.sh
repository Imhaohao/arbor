#!/bin/zsh
# Adapt every saved source not yet started, 4 at a time, alternating backends.
# Keeps watching for new sources until raw/ALL_SAVED exists and the queue is empty.
BASE=$HOME/.arbor-bench/v5-cf
i=0
while :; do
  started=0
  for f in $BASE/raw/*.json(N); do
    key=${f:t:r}
    [ -e $BASE/logs/$key.log ] && continue
    while [ $(pgrep -f 'v5-cf/adapt.sh' | wc -l) -ge 4 ]; do sleep 20; done
    backend=$([ $((i % 2)) -eq 0 ] && echo codex || echo cursor); i=$((i+1))
    mkdir -p $BASE/logs; : > $BASE/logs/$key.log
    nohup $BASE/adapt.sh $key $backend > /dev/null 2>&1 &
    started=1; sleep 2
  done
  [ $started -eq 0 ] && [ -e $BASE/raw/ALL_SAVED ] && [ $(pgrep -f 'v5-cf/adapt.sh' | wc -l) -eq 0 ] && break
  sleep 60
done
echo done > $BASE/logs/ADAPT_DONE
