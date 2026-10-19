"""Grade one IOI solution against an official CMS task package.

Runs inside the ioi-judge Docker image (Linux, GCC). Usage:
    python3 judge.py <task_dir> <solution.cpp> [--tests 1-01,1-02] [--workers 4]
Prints one JSON line: per-test scores, per-subtask scores and the total.

Scoring follows IOI rules: a subtask earns its points times the minimum
score over its tests; a test that crashes, exceeds the CPU-time limit or the
memory limit scores 0.
"""

import argparse
import json
import os
import re
import resource
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

COMPILE_FLAGS = ["-std=gnu++20", "-O2", "-pipe", "-w"]
MANAGER_CPU_SECONDS = 60
SCORE_PATTERN = re.compile(r"^\s*([0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)")


# ── task description ────────────────────────────────────────────────────────


def load_problem(task_dir: Path) -> dict:
    problem = json.loads((task_dir / "problem.json").read_text())
    params = problem.get("task_type_params")
    if isinstance(params, str):
        params = json.loads(params) if params else {}
    problem["params"] = params
    return problem


def process_count(problem: dict) -> int:
    params = problem["params"]
    if isinstance(params, list):
        return int(params[0])
    return int(params.get("task_type_parameters_Communication_num_processes", 1))


def load_subtasks(task_dir: Path) -> list[dict]:
    subtasks = []
    for path in sorted((task_dir / "subtasks").glob("*.json")):
        spec = json.loads(path.read_text())
        subtasks.append({"name": path.stem, "points": float(spec["score"]), "tests": spec["testcases"]})
    return subtasks


def stub_source(graders: Path) -> Path:
    stub = graders / "stub.cpp"
    return stub if stub.exists() else graders / "grader.cpp"


# ── compilation ─────────────────────────────────────────────────────────────


def compile_cpp(sources: list[Path], include: Path, output: Path) -> str | None:
    command = ["g++", *COMPILE_FLAGS, "-I", str(include), "-o", str(output), *map(str, sources)]
    result = subprocess.run(command, capture_output=True, text=True, timeout=300)
    return None if result.returncode == 0 else result.stderr[-4000:]


def build(task_dir: Path, solution: Path, work: Path, problem: dict) -> dict:
    graders = task_dir / "graders"
    staged = work / "solution.cpp"
    shutil.copy(solution, staged)
    binaries = {"solution": work / "solution"}
    is_communication = problem["task_type"] == "Communication"
    user_sources = [stub_source(graders) if is_communication else graders / "grader.cpp", staged]
    error = compile_cpp(user_sources, graders, binaries["solution"])
    if error:
        return {"error": error}
    helper = ("manager", graders / "manager.cpp") if is_communication else ("checker", task_dir / "checker" / "checker.cpp")
    helper_error = compile_cpp([helper[1]], helper[1].parent, work / helper[0])
    if helper_error:
        raise RuntimeError(f"official {helper[0]} failed to compile: {helper_error}")
    binaries[helper[0]] = work / helper[0]
    return binaries


# ── running processes under limits ──────────────────────────────────────────


def limiter(cpu_seconds: float, memory_bytes: int):
    def apply() -> None:
        hard_cpu = int(cpu_seconds) + 2
        resource.setrlimit(resource.RLIMIT_CPU, (hard_cpu, hard_cpu))
        resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
        resource.setrlimit(resource.RLIMIT_STACK, (resource.RLIM_INFINITY, resource.RLIM_INFINITY))
        os.setsid()

    return apply


def reap(processes: list[subprocess.Popen], wall_seconds: float) -> list[dict]:
    """Wait for every process, killing all of them once the wall clock runs out."""
    deadline = time.monotonic() + wall_seconds
    usage: dict[int, dict] = {}
    pending = {proc.pid: proc for proc in processes}
    while pending:
        if time.monotonic() > deadline:
            kill_all(pending.values())
        for pid in list(pending):
            # Waiting on each pid (never -1) keeps parallel tests from reaping each other's children.
            reaped, status, rusage = os.wait4(pid, os.WNOHANG)
            if reaped:
                pending.pop(pid).returncode = status
                usage[pid] = {"status": status, "cpu": rusage.ru_utime + rusage.ru_stime}
        time.sleep(0.002)
    return [usage[proc.pid] for proc in processes]


def kill_all(processes) -> None:
    for proc in processes:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def verdict(record: dict, time_limit: float) -> str:
    if record["cpu"] > time_limit:
        return "time_limit"
    if os.WIFSIGNALED(record["status"]):
        return "runtime_error" if os.WTERMSIG(record["status"]) != signal.SIGXCPU else "time_limit"
    return "ok" if os.WEXITSTATUS(record["status"]) == 0 else "runtime_error"


def parse_score(text: str) -> float:
    for line in text.splitlines():
        match = SCORE_PATTERN.match(line)
        if match:
            return max(0.0, min(1.0, float(match.group(1))))
    return 0.0


# ── test types ──────────────────────────────────────────────────────────────


def run_batch(binaries: dict, test_in: Path, test_out: Path, work: Path, problem: dict) -> dict:
    output = work / "output.txt"
    with test_in.open("rb") as stdin, output.open("wb") as stdout:
        proc = subprocess.Popen(
            [str(binaries["solution"])], stdin=stdin, stdout=stdout, stderr=subprocess.DEVNULL,
            preexec_fn=limiter(problem["time_limit"], problem["memory_limit"]), cwd=work,
        )
        record = reap([proc], problem["time_limit"] * 3 + 5)[0]
    outcome = verdict(record, problem["time_limit"])
    if outcome != "ok":
        return {"score": 0.0, "verdict": outcome, "cpu": round(record["cpu"], 3)}
    checked = subprocess.run(
        [str(binaries["checker"]), str(test_in), str(test_out), str(output)],
        capture_output=True, text=True, timeout=120,
    )
    score = parse_score(checked.stdout)
    return {"score": score, "verdict": "ok" if score > 0 else "wrong", "cpu": round(record["cpu"], 3), "message": checked.stderr[-300:]}


def make_fifos(work: Path, count: int) -> list[tuple[Path, Path]]:
    pairs = []
    for index in range(count):
        to_manager, to_solution = work / f"sol{index}-to-mgr", work / f"mgr-to-sol{index}"
        for fifo in (to_manager, to_solution):
            if fifo.exists():
                fifo.unlink()
            os.mkfifo(fifo)
        pairs.append((to_manager, to_solution))
    return pairs


def run_communication(binaries: dict, test_in: Path, work: Path, problem: dict) -> dict:
    count = process_count(problem)
    pairs = make_fifos(work, count)
    manager_out, manager_err = work / "manager.out", work / "manager.err"
    fifo_args = [str(path) for pair in pairs for path in pair]
    with test_in.open("rb") as stdin, manager_out.open("wb") as out, manager_err.open("wb") as err:
        manager = subprocess.Popen(
            [str(binaries["manager"]), *fifo_args], stdin=stdin, stdout=out, stderr=err,
            preexec_fn=limiter(MANAGER_CPU_SECONDS, problem["memory_limit"]), cwd=work,
        )
        users = [launch_user(binaries["solution"], index, pair, work, problem) for index, pair in enumerate(pairs)]
        records = reap([manager, *users], problem["time_limit"] * 3 + MANAGER_CPU_SECONDS)
    user_verdicts = [verdict(record, problem["time_limit"]) for record in records[1:]]
    worst_cpu = round(max(record["cpu"] for record in records[1:]), 3)
    failed = next((item for item in user_verdicts if item != "ok"), None)
    if failed:
        return {"score": 0.0, "verdict": failed, "cpu": worst_cpu}
    score = parse_score(manager_out.read_text(errors="replace"))
    message = manager_err.read_text(errors="replace")[-300:]
    return {"score": score, "verdict": "ok" if score > 0 else "wrong", "cpu": worst_cpu, "message": message}


def launch_user(binary: Path, index: int, pair: tuple[Path, Path], work: Path, problem: dict) -> subprocess.Popen:
    to_manager, to_solution = pair
    # Opening a FIFO blocks until the other side opens it, so the child opens its own ends.
    shell = f'exec "{binary}" {index} < "{to_solution}" > "{to_manager}"'
    return subprocess.Popen(
        ["/bin/sh", "-c", shell], stderr=subprocess.DEVNULL,
        preexec_fn=limiter(problem["time_limit"], problem["memory_limit"]), cwd=work,
    )


def run_test(task_dir: Path, binaries: dict, name: str, problem: dict, scratch_root: Path) -> dict:
    work = Path(tempfile.mkdtemp(dir=scratch_root))
    try:
        test_in = task_dir / "tests" / f"{name}.in"
        if problem["task_type"] == "Communication":
            return run_communication(binaries, test_in, work, problem)
        return run_batch(binaries, test_in, task_dir / "tests" / f"{name}.out", work, problem)
    finally:
        shutil.rmtree(work, ignore_errors=True)


# ── scoring ─────────────────────────────────────────────────────────────────


def score_subtasks(subtasks: list[dict], results: dict[str, dict], precision: int) -> tuple[list[dict], float]:
    scored = []
    for subtask in subtasks:
        fraction = min((results.get(name, {"score": 0.0})["score"] for name in subtask["tests"]), default=0.0)
        scored.append({"name": subtask["name"], "points": subtask["points"], "earned": round(subtask["points"] * fraction, precision)})
    return scored, round(sum(item["earned"] for item in scored), precision)


def grade(task_dir: Path, solution: Path, only_tests: list[str] | None, workers: int) -> dict:
    problem = load_problem(task_dir)
    subtasks = load_subtasks(task_dir)
    names = only_tests or sorted({name for subtask in subtasks for name in subtask["tests"]})
    scratch_root = Path(tempfile.mkdtemp(prefix="ioi-judge-"))
    try:
        binaries = build(task_dir, solution, scratch_root, problem)
        if "error" in binaries:
            return {"task": problem["code"], "compiled": False, "compile_error": binaries["error"], "total": 0.0, "subtasks": []}
        with ThreadPoolExecutor(max_workers=workers) as pool:
            outcomes = list(pool.map(lambda name: run_test(task_dir, binaries, name, problem, scratch_root), names))
        results = dict(zip(names, outcomes))
        scored, total = score_subtasks(subtasks, results, problem.get("score_precision", 2))
        return {"task": problem["code"], "compiled": True, "total": total, "subtasks": scored, "tests": results}
    finally:
        shutil.rmtree(scratch_root, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("task_dir", type=Path)
    parser.add_argument("solution", type=Path)
    parser.add_argument("--tests", default="")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    only = [name for name in args.tests.split(",") if name] or None
    print(json.dumps(grade(args.task_dir, args.solution, only, args.workers)))


if __name__ == "__main__":
    sys.exit(main())
