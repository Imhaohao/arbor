"""Prompts for the solo and team arms. The solo prompt mirrors the Vals IOI v2 setup."""

SOLO = """You are a contestant at the International Olympiad in Informatics (IOI), solving the task "{name}" in C++.

Your current directory is your workspace. It contains:
- statement.pdf: the official English problem statement (read it fully, including constraints and subtasks)
- cpp/: the task header, an example implementation, the sample grader, and compile/run scripts
- examples/: sample inputs and outputs for the sample grader

Rules:
- Write your final solution to ./solution.cpp (workspace root). It must implement the functions declared in the task header and must NOT contain a main function; the official grader provides main.
- Scoring is per subtask: each subtask's points are earned only if every test in it passes, within the time and memory limits in the statement. Partial solutions that solve some subtasks earn partial credit.
- There is no submission system and no feedback on hidden tests. You may compile, run the samples, and write your own tests and stress tests as much as you like.
- The official grader may differ from the sample grader; do not rely on sample-grader-specific behaviour.
- You have no internet access. Work only inside this workspace.

Compile and test with the provided scripts or directly with g++ -std=gnu++20 -O2. Stop when you are confident ./solution.cpp is your best solution."""

TESTER = """You are building test tools for the IOI task "{name}". You will NOT write the contest solution.

Your current directory contains statement.pdf (the official statement), cpp/ (header, sample grader, compile scripts) and examples/.

Produce three files in the workspace root:
1. brute.cpp: a simple, obviously-correct solution implementing the task header (no main; the sample grader provides it). Speed does not matter; it only has to be correct on small inputs. Prefer exhaustive search or direct simulation.
2. gen.py: `python3 gen.py <seed> small` prints ONE random input in exactly the sample grader's input format (read cpp/grader.cpp to learn it), with small sizes so brute.cpp finishes in about a second. `python3 gen.py <seed> large` prints one input at or near the maximum constraints of the hardest subtask.
3. unique.txt: the single word "yes" if, for a fixed input, every correct solution prints the same sample-grader output; otherwise "no" (for example when several answers are valid or the output is a score).

Verify brute.cpp compiled with cpp/grader.cpp reproduces every examples/*.out exactly (when unique.txt says yes) and that gen.py inputs are accepted by the sample grader. Stop when all three files are ready."""

REPAIR = """You are fixing a C++ solution for the IOI task "{name}".

Your current directory contains statement.pdf, cpp/ (header, sample grader, scripts), examples/, the current solution in ./solution.cpp, and failures/ with concrete evidence that it is wrong or too slow:
{failures}

Find the root cause, fix ./solution.cpp in place (implement the header's functions, no main), and re-test against every file in failures/ and examples/. Keep everything that already works. Stop when ./solution.cpp is your best version."""
