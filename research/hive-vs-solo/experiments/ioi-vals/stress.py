"""Differential testing for the team arm, run inside the ioi-judge container.

    python3 stress.py <bench_dir> <time_limit_s> <candidate> [<candidate> ...]

<bench_dir> holds the public bundle (cpp/, examples/), the tester's brute.cpp,
gen.py, unique.txt and checker.py, and one folder per candidate containing
solution.cpp. When the brute force cannot be trusted (non-unique or scored
outputs), a trusted checker.py verifies and scores every candidate output,
including on the breakers' adversarial inputs in attacks/*.in, and, when the
tester wrote a trusted adversary.cpp, under that adversarial grader as well.
Everything runs through the PUBLIC sample grader; hidden tests are not here.
Prints one JSON line with per-candidate evidence and writes failing cases to
<bench_dir>/<candidate>/failures/.
"""

import json
import re
import shutil
import subprocess
import tempfile
import sys
from pathlib import Path

sys.path.insert(0, "/opt")
from judge import limiter, reap, verdict  # noqa: E402

SMALL_SEEDS = range(1, 41)
LARGE_SEEDS = range(1, 7)
MEMORY_BYTES = 2 * 1024**3
MAX_FAILURES = 3
ADVERSARY_SUFFIX = " under the tester's adversarial grader"


def harness_source(bench: Path) -> Path:
    script = next((bench / "cpp" / name for name in ("compile", "compile_cpp.sh") if (bench / "cpp" / name).exists()), None)
    match = re.search(r'grader_name="([^"]+)"', script.read_text()) if script else None
    return bench / "cpp" / f"{match.group(1) if match else 'grader'}.cpp"


def compile_with_harness(bench: Path, source: Path, output: Path, grader: Path | None = None) -> bool:
    harness = grader or harness_source(bench)
    command = ["g++", "-std=gnu++20", "-O2", "-pipe", "-w", "-I", str(bench / "cpp"), "-o", str(output), str(harness), str(source)]
    return subprocess.run(command, capture_output=True, timeout=300).returncode == 0


def run(binary: Path, stdin_text: str, time_limit: float) -> tuple[str, str, float]:
    """Returns (status, stdout, cpu seconds) under the sample grader, with the judge's CPU and memory limits."""
    with tempfile.TemporaryDirectory() as scratch:
        given, output = Path(scratch) / "in.txt", Path(scratch) / "out.txt"
        given.write_text(stdin_text)
        with given.open("rb") as stdin, output.open("wb") as stdout:
            proc = subprocess.Popen([str(binary)], stdin=stdin, stdout=stdout, stderr=subprocess.DEVNULL,
                                    preexec_fn=limiter(time_limit, MEMORY_BYTES), cwd=scratch)
            record = reap([proc], time_limit * 3 + 5)[0]
            status = verdict(record, time_limit)
        return status, output.read_text(errors="replace") if status == "ok" else "", record["cpu"]


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


def check(bench: Path, given: str, output: str) -> dict:
    """The tester's verdict on one sample-grader output; a crash or unreadable verdict counts as invalid."""
    with tempfile.TemporaryDirectory() as scratch:
        given_path, output_path = Path(scratch) / "in.txt", Path(scratch) / "out.txt"
        given_path.write_text(given)
        output_path.write_text(output)
        try:
            result = subprocess.run(["python3", str(bench / "checker.py"), str(given_path), str(output_path)],
                                    capture_output=True, text=True, timeout=120, cwd=bench)
            verdict_line = [line for line in result.stdout.splitlines() if line.strip().startswith("{")][-1]
            parsed = json.loads(verdict_line)
            valid = bool(parsed.get("valid"))
            return {"valid": valid, "score": max(0.0, min(1.0, float(parsed.get("score", 0)))) if valid else 0.0,
                    "detail": str(parsed.get("detail", ""))[:500]}
        except (subprocess.TimeoutExpired, IndexError, ValueError, TypeError, AttributeError):
            return {"valid": False, "score": 0.0, "detail": "checker gave no verdict"}


def checker_trusted(bench: Path, samples: list[tuple[str, str]]) -> bool:
    """Trusted only if it accepts every sample output and rejects an empty output for every sample input."""
    if not (bench / "checker.py").exists() or not samples:
        return False
    return all(check(bench, given, want)["valid"] and not check(bench, given, "")["valid"] for given, want in samples)


def adversary_trusted(bench: Path, tools: dict) -> bool:
    """The tester's adversarial grader counts only if the tester's own brute force stays checker-valid under it."""
    if not tools["checker"] or not (bench / "adversary.cpp").exists() or not (bench / "brute.cpp").exists():
        return False
    binary = bench / "brute.adversary.bin"
    if not compile_with_harness(bench, bench / "brute.cpp", binary, bench / "adversary.cpp"):
        return False
    inputs = [given for given, _ in tools["samples"]] + tools["small"][:10]
    for given in inputs:
        status, out, _ = run(binary, given, 30)
        if status != "ok" or not check(bench, given, out)["valid"]:
            return False
    return bool(inputs)


def tester_tools(bench: Path, time_limit: float) -> dict:
    """Brute-force expectations, kept only when the brute force reproduces every sample output.
    Without them, a trusted checker supplies the evidence instead."""
    unique = (bench / "unique.txt").exists() and (bench / "unique.txt").read_text().strip().lower().startswith("y")
    brute = bench / "brute.bin"
    has_brute = (bench / "brute.cpp").exists() and compile_with_harness(bench, bench / "brute.cpp", brute)
    samples = examples(bench)
    trusted = unique and has_brute and all(same(run(brute, given, 30)[1], want) for given, want in samples)
    small = generate(bench, "small", SMALL_SEEDS) if (bench / "gen.py").exists() else []
    large = generate(bench, "large", LARGE_SEEDS) if (bench / "gen.py").exists() else []
    expected = [run(brute, text, 30)[:2] for text in small] if trusted else [("untrusted", None)] * len(small)
    attacks = [path.read_text() for path in sorted((bench / "attacks").glob("*.in"))]
    tools = {"unique": unique, "trusted_brute": trusted, "checker": not trusted and checker_trusted(bench, samples),
             "samples": samples, "small": small, "large": large, "attacks": attacks,
             "expected": [out if status == "ok" else None for status, out in expected]}
    tools["adversary"] = adversary_trusted(bench, tools)
    return tools


def failure_case(folder: Path, index: int, given: str, note: str, expected: str | None = None, got: str = "") -> None:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"case{index}.in").write_text(given)
    (folder / f"case{index}.note.txt").write_text(note)
    if expected is not None:
        (folder / f"case{index}.expected.out").write_text(expected)
    if expected is not None or got:
        (folder / f"case{index}.got.out").write_text(got[:20000])


def checked_evidence(bench: Path, runs: list[tuple[str, str, str, str]]) -> tuple[dict, list[tuple], list[tuple]]:
    """Checker verdicts on every (kind, input, status, output) run.

    Returns stats, failures for invalid or crashed small-input runs (samples
    and large inputs already report their own crashes), and the valid cases
    scoring below full points, lowest first.
    """
    invalid, low, scores, valid = [], [], [], 0
    for kind, given, status, out in runs:
        result = check(bench, given, out) if status == "ok" else {"valid": False, "score": 0.0, "detail": status}
        scores.append(result["score"])
        valid += result["valid"]
        if status != "ok" and (kind == "small random input" or kind.endswith(ADVERSARY_SUFFIX)):
            invalid.append((given, f"{kind}: {status}", None, ""))
        elif status == "ok" and not result["valid"]:
            invalid.append((given, f"{kind}: the checker says the output is invalid ({result['detail']})", None, out))
        elif result["valid"] and result["score"] < 1:
            low.append((result["score"], (given, f"{kind}: valid, but the checker scores it {result['score']:.4f} of full points ({result['detail']})", None, out)))
    stats = {"checked_valid": valid, "checked_total": len(runs),
             "score_mean": round(sum(scores) / len(scores), 4) if scores else 0.0,
             "score_min": round(min(scores), 4) if scores else 0.0}
    return stats, invalid, [case for _, case in sorted(low, key=lambda item: item[0])]


def adversary_runs(bench: Path, folder: Path, inputs: list[tuple[str, str]], time_limit: float) -> list[tuple[str, str, str, str]]:
    """Every input again, with the candidate linked against the tester's adversarial grader."""
    binary = folder / "candidate.adversary.bin"
    if not compile_with_harness(bench, folder / "solution.cpp", binary, bench / "adversary.cpp"):
        return [(kind + ADVERSARY_SUFFIX, given, "compile_error", "") for kind, given in inputs]
    return [(kind + ADVERSARY_SUFFIX, given, *run(binary, given, time_limit)[:2]) for kind, given in inputs]


def evidence(bench: Path, name: str, tools: dict, time_limit: float) -> dict:
    folder = bench / name
    binary = folder / "candidate.bin"
    if not compile_with_harness(bench, folder / "solution.cpp", binary):
        return {"label": name, "compiled": False}
    shutil.rmtree(folder / "failures", ignore_errors=True)
    failures: list[tuple] = []
    runs: list[tuple[str, str, str, str]] = []
    sample_ok = 0
    for given, want in tools["samples"]:
        status, out, _ = run(binary, given, time_limit)
        runs.append(("sample input", given, status, out))
        passed = status == "ok" and (same(out, want) or not tools["unique"])
        sample_ok += passed
        if not passed:
            failures.append((given, f"sample input: {status}", want if tools["unique"] else None, out))
    agree = 0
    for given, want in zip(tools["small"], tools["expected"]):
        status, out, _ = run(binary, given, time_limit)
        runs.append(("small random input", given, status, out))
        if want is not None and status == "ok" and same(out, want):
            agree += 1
        elif want is not None:
            failures.append((given, f"small random input; a trusted brute force disagrees ({status})", want, out))
    large_ok, large_cpu = 0, [0.0]
    heavy = [("input at maximum constraints", given) for given in tools["large"]] + [("adversarial input", given) for given in tools["attacks"]]
    for kind, given in heavy:
        status, out, cpu = run(binary, given, time_limit)
        runs.append((kind, given, status, out))
        large_ok += status == "ok"
        large_cpu.append(cpu)
        if status != "ok":
            failures.append((given, f"{kind}: {status} within the {time_limit}s limit", None, ""))
    stats, low = {}, []
    if tools["adversary"]:
        runs += adversary_runs(bench, folder, [(kind, given) for kind, given, _, _ in runs], time_limit)
    if tools["checker"]:
        stats, invalid, low = checked_evidence(bench, runs)
        failures += invalid
    chosen = failures[:MAX_FAILURES] + [case for case in failures if case[2] is None][:1] + low[:MAX_FAILURES]
    for index, case in enumerate(chosen):
        failure_case(folder / "failures", index, *case)
    return {"label": name, "compiled": True, "samples_passed": sample_ok, "samples_total": len(tools["samples"]),
            "small_agree": agree, "small_trusted": sum(want is not None for want in tools["expected"]),
            "large_ok": large_ok, "large_total": len(heavy), "large_cpu_max": round(max(large_cpu), 3),
            "failures": len(failures) + len(low), **stats}


def main() -> None:
    bench, time_limit, names = Path(sys.argv[1]), float(sys.argv[2]), sys.argv[3:]
    tools = tester_tools(bench, time_limit)
    report = {"unique": tools["unique"], "trusted_brute": tools["trusted_brute"], "trusted_checker": tools["checker"], "trusted_adversary": tools["adversary"],
              "small_inputs": len(tools["small"]), "large_inputs": len(tools["large"]), "attack_inputs": len(tools["attacks"]),
              "candidates": [evidence(bench, name, tools, time_limit) for name in names]}
    print(json.dumps(report))


if __name__ == "__main__":
    main()
