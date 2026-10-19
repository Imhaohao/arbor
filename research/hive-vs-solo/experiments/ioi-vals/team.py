"""The H2 small-model team, adapted to IOI.

Candidates are solo attempts (every Sonnet attempt, then Haiku). A Sonnet
tester builds a brute force, an input generator and an output checker from
the statement alone; stress.py runs every candidate against them through the
public sample grader and the best evidence wins.

Problems with a trusted brute force: a Sonnet repairer gets concrete failing
inputs for up to two rounds; a fix is kept only if the evidence improves.
Problems scored by the checker instead (non-unique or scored outputs): each
round a Sonnet breaker attacks the current best program with adversarial
inputs that join every candidate's evidence, then the repairer works against
them; a last attack re-tests the final choice. When the official grader may be
adaptive or adversarial, the tester also writes an adversarial grader, trusted
only if its own brute force stays valid under it, and every candidate is
checked under it as well. Repairs must also keep CPU
headroom on the heaviest inputs. Hidden tests are never consulted before the
final grade.
"""

import json
import shutil
import subprocess
from pathlib import Path

import agent
import grading
import prompts
from tasks import DATA_ROOT, Task

MEMBERS = ("sonnet", "haiku")
CPU_HEADROOM = 0.5
MAX_ATTACKS = 6
MAX_ATTACK_BYTES = 64 * 1024**2
TESTER_FILES = ("brute.cpp", "gen.py", "unique.txt", "checker.py", "adversary.cpp")
REPAIR_ROUNDS = 2


def time_limit(task: Task) -> float:
    return float(json.loads((Path(task.judge_dir) / "problem.json").read_text())["time_limit"])


def rank_key(item: dict) -> tuple:
    if not item.get("compiled"):
        return (1, 0, 0, 0, item["priority"])
    samples_clean = item["samples_passed"] == item["samples_total"]
    return (0, 0 if samples_clean else 1, -item["small_agree"], -item.get("checked_valid", 0),
            -item.get("score_mean", 0.0), -item["large_ok"], item["priority"])


def keeps_headroom(candidate: dict, replaced: dict, limit: float) -> bool:
    """A repair may not become slow on the largest inputs: it stays under half the limit or no slower than before."""
    cpu = candidate.get("large_cpu_max", 0.0)
    return cpu <= CPU_HEADROOM * limit or cpu <= replaced.get("large_cpu_max", 0.0)


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


def repair(task: Task, team_dir: Path, bench: Path, best: dict, round_index: int, effort: str, checker: bool, adversary: bool = False) -> dict | None:
    """One repair round; returns the repaired candidate's evidence, or None if no fix was produced."""
    source = bench / best["label"]
    extra = {"solution.cpp": (source / "solution.cpp").read_text(), **failure_files(source / "failures")}
    listing = "\n".join(f"- {name}" for name in extra if name.startswith("failures/"))
    if checker:
        extra.update(shared_tools(bench, adversary))
    note = prompts.CHECKER_NOTE + "\n\n" + adversary_note(adversary) if checker else ""
    prompt = prompts.REPAIR.format(name=task.name, failures=listing, checker_note=note)
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


def shared_tools(bench: Path, adversary: bool) -> dict[str, str]:
    names = ("checker.py", "gen.py") + (("adversary.cpp",) if adversary else ())
    return {name: (bench / name).read_text() for name in names}


def adversary_note(adversary: bool) -> str:
    return prompts.ADVERSARY_NOTE + "\n\n" if adversary else ""


def attack(task: Task, team_dir: Path, bench: Path, best: dict, round_index: int, effort: str, adversary: bool) -> int:
    """A Sonnet breaker writes inputs aimed at the current best program; they join every candidate's evidence."""
    extra = shared_tools(bench, adversary)
    extra["solution.cpp"] = (bench / best["label"] / "solution.cpp").read_text()
    attempt_dir = team_dir / f"breaker{round_index}"
    prompt = prompts.BREAKER.format(name=task.name, limit=time_limit(task), count=MAX_ATTACKS)
    if adversary:
        prompt += "\n\n" + prompts.ADVERSARY_NOTE
    agent.attempt(Path(task.public_dir), attempt_dir, prompt, "sonnet", effort, extra)
    written = sorted((attempt_dir / "ws" / "attacks").glob("*.in"))[:MAX_ATTACKS]
    kept = [path for path in written if path.stat().st_size <= MAX_ATTACK_BYTES]
    (bench / "attacks").mkdir(exist_ok=True)
    for index, path in enumerate(kept):
        shutil.copy(path, bench / "attacks" / f"b{round_index}-{index:02d}.in")
    return len(kept)


def rerank(task: Task, bench: Path, pool: list[dict]) -> list[dict]:
    """Re-run every candidate on the current evidence, including all attacks so far."""
    priority = {item["label"]: item["priority"] for item in pool}
    report = stress(bench, task, list(priority))
    return [{**item, "priority": priority[item["label"]]} for item in report["candidates"]]


def accept(candidate: dict | None, best: dict, task: Task) -> bool:
    return bool(candidate) and rank_key(candidate) < rank_key(best) and keeps_headroom(candidate, best, time_limit(task))


def adversarial_rounds(task: Task, team_dir: Path, bench: Path, pool: list[dict], effort: str, history: list, adversary: bool) -> dict:
    """Checker problems: attack the best, repair against the attacks, and attack the final choice once more."""
    best = min(pool, key=rank_key)
    for round_index in range(1, REPAIR_ROUNDS + 2):
        attacks = attack(task, team_dir, bench, best, round_index, effort, adversary)
        pool = rerank(task, bench, pool)
        best = min(pool, key=rank_key)
        entry = {"round": round_index, "attacks": attacks, "ranking": sorted(pool, key=rank_key)}
        history.append(entry)
        if round_index > REPAIR_ROUNDS or not needs_repair(best):
            continue
        candidate = repair(task, team_dir, bench, best, round_index, effort, True, adversary)
        entry["repair"] = candidate
        if accept(candidate, best, task):
            pool.append(candidate)
            best = candidate
    return best


def repair_rounds(task: Task, team_dir: Path, bench: Path, best: dict, effort: str, history: list) -> dict:
    for round_index in range(1, REPAIR_ROUNDS + 1):
        if not needs_repair(best):
            break
        candidate = repair(task, team_dir, bench, best, round_index, effort, False)
        history.append({"round": round_index, "repair": candidate})
        if accept(candidate, best, task):
            best = candidate
    return best


def run_team(task: Task, team_dir: Path, candidates: dict[str, Path], effort: str) -> tuple[Path, dict]:
    tester_dir = team_dir / "tester"
    agent.attempt(Path(task.public_dir), tester_dir, prompts.TESTER.format(name=task.name), "sonnet", effort)
    bench = build_bench(task, team_dir, tester_dir / "ws", candidates)
    report = stress(bench, task, list(candidates))
    order = list(candidates)
    pool = [{**item, "priority": order.index(item["label"])} for item in report["candidates"]]
    history = [{"round": 0, "ranking": sorted(pool, key=rank_key)}]
    if report["trusted_checker"]:
        best = adversarial_rounds(task, team_dir, bench, pool, effort, history, report["trusted_adversary"])
    else:
        best = repair_rounds(task, team_dir, bench, min(pool, key=rank_key), effort, history)
    summary = {"tools": {key: report[key] for key in ("unique", "trusted_brute", "trusted_checker", "trusted_adversary", "small_inputs", "large_inputs")},
               "chosen": best["label"], "history": history}
    (team_dir / "team.json").write_text(json.dumps(summary, indent=2))
    return bench / best["label"] / "solution.cpp", summary


def member_solutions(candidate_runs: list[str], task: Task) -> dict[str, Path]:
    """Finished solo attempts in priority order: every Sonnet attempt (runs in the order given) before every Haiku one.
    The first run's attempts keep the plain member name; later runs' are suffixed with the run."""
    found = {}
    for member in MEMBERS:
        for index, run in enumerate(candidate_runs):
            path = DATA_ROOT / "runs" / run / f"solo-{member}" / task.id / "ws" / "solution.cpp"
            if path.exists() and (path.parents[1] / "grade.json").exists():
                found[member if index == 0 else f"{member}-{run}"] = path
    return found
