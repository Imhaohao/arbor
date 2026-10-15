#!/bin/zsh
cd ~/.arbor-bench/v3
AUTHOR_BACKEND=cursor AUTHOR_MODEL=gemini-4-argon-high ./author-loop.sh k1 12 "dynamic programming (interval/tree/bitmask/digit DP, DP optimizations)" &
AUTHOR_BACKEND=cursor AUTHOR_MODEL=gemini-4-argon-high ./author-loop.sh k2 12 "graphs (flows, matchings, 2-SAT, shortest paths with twists)" &
AUTHOR_BACKEND=cursor AUTHOR_MODEL=gemini-4-argon-high ./author-loop.sh k3 12 "strings and data structures (suffix structures, automata, lazy segment trees, offline queries)" &
AUTHOR_BACKEND=cursor AUTHOR_MODEL=gemini-4-argon-high ./author-loop.sh k4 12 "combinatorics, number theory and games (inclusion-exclusion, Mobius, Sprague-Grundy)" &
AUTHOR_BACKEND=cursor AUTHOR_MODEL=grok-4.7-high ./author-loop.sh k5 12 "trees (rerooting, centroid decomposition, small-to-large merging)" &
AUTHOR_BACKEND=cursor AUTHOR_MODEL=grok-4.7-high ./author-loop.sh k6 12 "greedy, scheduling and geometry (exchange arguments, sweeps, convex hulls)" &
AUTHOR_BACKEND=codex ./author-loop.sh m1 12 "dynamic programming and data structures (DP optimizations, segment trees)" &
AUTHOR_BACKEND=codex ./author-loop.sh m2 12 "graphs, strings and combinatorics" &
wait
echo done > logs/V5_AUTHORS_DONE
