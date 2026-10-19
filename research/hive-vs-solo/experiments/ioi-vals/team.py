"""The H2 small-model team, adapted to IOI.

Candidates are the Sonnet and Haiku solo attempts. A Sonnet tester builds a
brute force, an input generator and an output checker from the statement
alone; stress.py runs every candidate against them through the public sample
grader (the checker verifies and scores outputs when the brute force cannot
be trusted, as for non-unique or scored outputs); the best
evidence wins; a Sonnet repairer gets concrete failing inputs for up to two
rounds and its fix is kept only if the evidence improves. Hidden tests are
never consulted before the final grade.
"""

import json
import shutil
import subprocess
from pathlib import Path

import agent
import grading
import prompts
from tasks import DATA_ROOT, Task

MEMBER_PRIORITY = {"sonnet": 0, "haiku": 1}
TESTER_FILES = ("brute.cpp", "gen.py", "unique.txt", "checker.py")
REPAIR_ROUNDS = 2


def time_limit(task: Task) -> float:
    return float(json.loads((Path(task.judge_dir) / "problem.json").read_text())["time_limit"])


def rank_key(item: dict) -> tuple:
    if not item.get("compiled"):
        return (1, 0, 0, 0, item["priority"])
    samples_clean = item["samples_passed"] == item["samples_total"]
    return (0, 0 if samples_clean else 1, -item["small_agree"], -item.get("checked_valid", 0),
            -item.get("score_mean", 0.0), -item["large_ok"], item["priority"])


def needs_repair(item: dict) -> bool:
    return bool(item.get("compiled")) and item["failures"] > 0


def stress(bench: Path, task: Task, labels: list[str]) -> dict:
    command = [
        "docker", "run", "--rm", "--network", "none", "--cpus", "4", "--memory", "6g",
        "-v", f"{bench}:{bench}", grading.IMAGE, "python3", "/opt/stress.py", str(bench), str(time_limit(task)), *labels,
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=7200)
    lines = [line for line in result.stdout.splitlines() if line.startswith("{")]
    if not lines:
        raise RuntimeError(f"stress failed for {task.id}: {result.stderr[-2000:]}")
    return json.loads(lines[-1])


def build_bench(task: Task, team_dir: Path, tester_ws: Path, candidates: dict[str, Path]) -> Path:
    bench = team_dir / "bench"
    if bench.exists():
        shutil.rmtree(bench)
    shutil.copytree(task.public_dir, bench)
    for name in TESTER_FILES:
        if (tester_ws / name).exists():
            shutil.copy(tester_ws / name, bench / name)
    for label, source in candidates.items():
        (bench / label).mkdir()
        shutil.copy(source, bench / label / "solution.cpp")
    return bench


def failure_files(folder: Path) -> dict[str, str]:
    return {f"failures/{path.name}": path.read_text(errors="replace") for path in sorted(folder.glob("*")) if path.is_file()}


def repair(task: Task, team_dir: Path, bench: Path, best: dict, round_index: int, effort: str, checker: bool) -> dict | None:
    """One repair round; returns the repaired candidate's evidence, or None if no fix was produced."""
    source = bench / best["label"]
    extra = {"solution.cpp": (source / "solution.cpp").read_text(), **failure_files(source / "failures")}
    listing = "\n".join(f"- {name}" for name in extra if name.startswith("failures/"))
    if checker:
        extra.update({name: (bench / name).read_text() for name in ("checker.py", "gen.py")})
    prompt = prompts.REPAIR.format(name=task.name, failures=listing, checker_note=prompts.CHECKER_NOTE + "\n\n" if checker else "")
    attempt_dir = team_dir / f"repair{round_index}"
    agent.attempt(Path(task.public_dir), attempt_dir, prompt, "sonnet", effort, extra)
    fixed = attempt_dir / "ws" / "solution.cpp"
    if not fixed.exists():
        return None
    label = f"{best['label']}+r{round_index}"
    (bench / label).mkdir(exist_ok=True)
    shutil.copy(fixed, bench / label / "solution.cpp")
    report = stress(bench, task, [label])
    return {**report["candidates"][0], "priority": best["priority"]}


def run_team(task: Task, team_dir: Path, candidates: dict[str, Path], effort: str) -> tuple[Path, dict]:
    tester_dir = team_dir / "tester"
    agent.attempt(Path(task.public_dir), tester_dir, prompts.TESTER.format(name=task.name), "sonnet", effort)
    bench = build_bench(task, team_dir, tester_dir / "ws", candidates)
    report = stress(bench, task, list(candidates))
    pool = [{**item, "priority": MEMBER_PRIORITY.get(item["label"], 9)} for item in report["candidates"]]
    best = min(pool, key=rank_key)
    history = [{"round": 0, "ranking": sorted(pool, key=rank_key)}]
    for round_index in range(1, REPAIR_ROUNDS + 1):
        if not needs_repair(best):
            break
        candidate = repair(task, team_dir, bench, best, round_index, effort, report["trusted_checker"])
        history.append({"round": round_index, "repair": candidate})
        if candidate and rank_key(candidate) < rank_key(best):
            best = candidate
    summary = {"tools": {key: report[key] for key in ("unique", "trusted_brute", "trusted_checker", "small_inputs", "large_inputs")},
               "chosen": best["label"], "history": history}
    (team_dir / "team.json").write_text(json.dumps(summary, indent=2))
    return bench / best["label"] / "solution.cpp", summary


def member_solutions(candidate_run: str, task: Task) -> dict[str, Path]:
    root = DATA_ROOT / "runs" / candidate_run
    found = {member: root / f"solo-{member}" / task.id / "ws" / "solution.cpp" for member in MEMBER_PRIORITY}
    return {member: path for member, path in found.items() if path.exists()}
