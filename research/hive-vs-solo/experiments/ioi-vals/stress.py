"""Differential testing for the team arm, run inside the ioi-judge container.

    python3 stress.py <bench_dir> <time_limit_s> <candidate> [<candidate> ...]

<bench_dir> holds the public bundle (cpp/, examples/), the tester's brute.cpp,
gen.py and unique.txt, and one folder per candidate containing solution.cpp.
Everything runs through the PUBLIC sample grader; hidden tests are not here.
Prints one JSON line with per-candidate evidence and writes failing cases to
<bench_dir>/<candidate>/failures/.
"""

import json
import re
import subprocess
import tempfile
import sys
from pathlib import Path

sys.path.insert(0, "/opt")
from judge import limiter, reap, verdict  # noqa: E402

SMALL_SEEDS = range(1, 41)
LARGE_SEEDS = range(1, 4)
MEMORY_BYTES = 2 * 1024**3
MAX_FAILURES = 3


def harness_source(bench: Path) -> Path:
    script = next((bench / "cpp" / name for name in ("compile", "compile_cpp.sh") if (bench / "cpp" / name).exists()), None)
    match = re.search(r'grader_name="([^"]+)"', script.read_text()) if script else None
    return bench / "cpp" / f"{match.group(1) if match else 'grader'}.cpp"


def compile_with_harness(bench: Path, source: Path, output: Path) -> bool:
    command = ["g++", "-std=gnu++20", "-O2", "-pipe", "-w", "-I", str(bench / "cpp"), "-o", str(output), str(harness_source(bench)), str(source)]
    return subprocess.run(command, capture_output=True, timeout=300).returncode == 0


def run(binary: Path, stdin_text: str, time_limit: float) -> tuple[str, str]:
    """Returns (status, stdout) under the sample grader, with the judge's CPU and memory limits."""
    with tempfile.TemporaryDirectory() as scratch:
        given, output = Path(scratch) / "in.txt", Path(scratch) / "out.txt"
        given.write_text(stdin_text)
        with given.open("rb") as stdin, output.open("wb") as stdout:
            proc = subprocess.Popen([str(binary)], stdin=stdin, stdout=stdout, stderr=subprocess.DEVNULL,
                                    preexec_fn=limiter(time_limit, MEMORY_BYTES), cwd=scratch)
            status = verdict(reap([proc], time_limit * 3 + 5)[0], time_limit)
        return status, output.read_text(errors="replace") if status == "ok" else ""


def generate(bench: Path, size: str, seeds) -> list[str]:
    inputs = []
    for seed in seeds:
        result = subprocess.run(["python3", str(bench / "gen.py"), str(seed), size], capture_output=True, text=True, timeout=120, cwd=bench)
        if result.returncode == 0 and result.stdout.strip():
            inputs.append(result.stdout)
    return inputs


def same(left: str, right: str) -> bool:
    return left.split() == right.split()


def examples(bench: Path) -> list[tuple[str, str]]:
    return [(path.read_text(), path.with_suffix(".out").read_text()) for path in sorted((bench / "examples").glob("*.in")) if path.with_suffix(".out").exists()]


def tester_tools(bench: Path, time_limit: float) -> dict:
    """Brute-force expectations, kept only when the brute force reproduces every sample output."""
    unique = (bench / "unique.txt").exists() and (bench / "unique.txt").read_text().strip().lower().startswith("y")
    brute = bench / "brute.bin"
    has_brute = (bench / "brute.cpp").exists() and compile_with_harness(bench, bench / "brute.cpp", brute)
    samples = examples(bench)
    trusted = unique and has_brute and all(same(run(brute, given, 30)[1], want) for given, want in samples)
    small = generate(bench, "small", SMALL_SEEDS) if (bench / "gen.py").exists() else []
    large = generate(bench, "large", LARGE_SEEDS) if (bench / "gen.py").exists() else []
    expected = [run(brute, text, 30) for text in small] if trusted else []
    return {"unique": unique, "trusted_brute": trusted, "samples": samples, "small": small, "large": large,
            "expected": [out if status == "ok" else None for status, out in expected]}


def failure_case(folder: Path, index: int, given: str, note: str, expected: str | None = None, got: str = "") -> None:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"case{index}.in").write_text(given)
    (folder / f"case{index}.note.txt").write_text(note)
    if expected is not None:
        (folder / f"case{index}.expected.out").write_text(expected)
        (folder / f"case{index}.got.out").write_text(got[:20000])


def evidence(bench: Path, name: str, tools: dict, time_limit: float) -> dict:
    folder = bench / name
    binary = folder / "candidate.bin"
    if not compile_with_harness(bench, folder / "solution.cpp", binary):
        return {"label": name, "compiled": False}
    failures: list[tuple] = []
    sample_ok = 0
    for given, want in tools["samples"]:
        status, out = run(binary, given, time_limit)
        passed = status == "ok" and (same(out, want) or not tools["unique"])
        sample_ok += passed
        if not passed:
            failures.append((given, f"sample input: {status}", want if tools["unique"] else None, out))
    agree = 0
    for given, want in zip(tools["small"], tools["expected"]):
        status, out = run(binary, given, time_limit)
        if want is not None and status == "ok" and same(out, want):
            agree += 1
        elif want is not None:
            failures.append((given, f"small random input; a trusted brute force disagrees ({status})", want, out))
    large_ok = 0
    for given in tools["large"]:
        status, _ = run(binary, given, time_limit)
        large_ok += status == "ok"
        if status != "ok":
            failures.append((given, f"input at maximum constraints: {status} within the {time_limit}s limit", None, ""))
    for index, case in enumerate(failures[:MAX_FAILURES] + [case for case in failures if case[2] is None][:1]):
        failure_case(folder / "failures", index, *case)
    return {"label": name, "compiled": True, "samples_passed": sample_ok, "samples_total": len(tools["samples"]),
            "small_agree": agree, "small_trusted": sum(want is not None for want in tools["expected"]),
            "large_ok": large_ok, "large_total": len(tools["large"]), "failures": len(failures)}


def main() -> None:
    bench, time_limit, names = Path(sys.argv[1]), float(sys.argv[2]), sys.argv[3:]
    tools = tester_tools(bench, time_limit)
    report = {"unique": tools["unique"], "trusted_brute": tools["trusted_brute"], "small_inputs": len(tools["small"]),
              "large_inputs": len(tools["large"]), "candidates": [evidence(bench, name, tools, time_limit) for name in names]}
    print(json.dumps(report))


if __name__ == "__main__":
    main()
