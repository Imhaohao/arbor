"""Prompts for the solo and team arms. The solo prompt mirrors the Vals IOI v2 setup."""

SOLO = """You are a contestant at the International Olympiad in Informatics (IOI), solving the task "{name}" in C++.

Your current directory is your workspace. It contains:
- statement.pdf: the official English problem statement (read it fully, including constraints and subtasks)
- cpp/: the task header, an example implementation, the sample grader, and compile/run scripts
- examples/: sample inputs and outputs for the sample grader

Rules:
- Write your final solution to ./solution.cpp (workspace root). It must implement the functions declared in the task header and must NOT contain a main function; the official grader provides main. Include the header exactly as #include "{name}.h" with no directory part; the official grader compiles your file with the header on its include path.
- Scoring is per subtask: each subtask's points are earned only if every test in it passes, within the time and memory limits in the statement. Partial solutions that solve some subtasks earn partial credit.
- There is no submission system and no feedback on hidden tests. You may compile, run the samples, and write your own tests and stress tests as much as you like.
- The official grader may differ from the sample grader; do not rely on sample-grader-specific behaviour.
- You have no internet access. Work only inside this workspace.

Compile and test with the provided scripts or directly with g++ -std=gnu++20 -O2. Stop when you are confident ./solution.cpp is your best solution."""

TESTER = """You are building test tools for the IOI task "{name}". You will NOT write the contest solution.

Your current directory contains statement.pdf (the official statement), cpp/ (header, sample grader, compile scripts) and examples/.

Produce four files in the workspace root:
1. brute.cpp: a simple, obviously-correct solution implementing the task header (no main; the sample grader provides it). Speed does not matter; it only has to be correct on small inputs. Prefer exhaustive search or direct simulation.
2. gen.py: `python3 gen.py <seed> small` prints ONE random input in exactly the sample grader's input format (read cpp/grader.cpp to learn it), with small sizes so brute.cpp finishes in about a second. `python3 gen.py <seed> large` prints one input at or near the maximum constraints of the hardest subtask.
3. unique.txt: the single word "yes" if, for a fixed input, every correct solution prints the same sample-grader output; otherwise "no" (for example when several answers are valid or the output is a score).
4. checker.py: `python3 checker.py <input_file> <output_file>` reads one sample-grader input and the output the sample grader printed for some solution, and prints ONE line of JSON: {{"valid": true|false, "score": <number from 0 to 1>, "detail": "<short reason>"}}. "valid" is true only if every answer in the output is legal and correct for that input; verify this from the input yourself (for example by recomputing the true answer with a simple algorithm), never by trusting the output. "score" is the fraction of points the statement's scoring rule awards this output in the most general subtask (1 for full points), computed from the counts the sample grader prints, such as the number of calls, packets, resources or the size of what was returned; use 0 when invalid. Put the counts you used and their full-score thresholds in "detail". Malformed or empty output must give valid false, never a crash.

Verify brute.cpp compiled with cpp/grader.cpp reproduces every examples/*.out exactly (when unique.txt says yes), that gen.py inputs are accepted by the sample grader, and that checker.py marks every examples/*.out valid and rejects an empty output. Stop when all four files are ready."""

REPAIR = """You are fixing a C++ solution for the IOI task "{name}".

Your current directory contains statement.pdf, cpp/ (header, sample grader, scripts), examples/, the current solution in ./solution.cpp, and failures/ with concrete evidence that it is wrong or too slow:
{failures}

{checker_note}Find the root cause, fix ./solution.cpp in place (implement the header's functions, no main), and re-test against every file in failures/ and examples/. Keep everything that already works. Stop when ./solution.cpp is your best version."""

CHECKER_NOTE = """A note that gives a checker score below 1 means the output is legal but loses points under the statement's scoring rule; raise that score without breaking correctness. ./checker.py and ./gen.py are the test tools that produced this evidence: `python3 checker.py <input> <output>` scores what the sample grader prints, and `python3 gen.py <seed> small|large` makes inputs. The official grader may be adaptive and may run procedures in separate processes, so do not rely on sample-grader behaviour."""
