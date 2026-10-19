"""IOI benchmark on the Vals IOI v2 problem set, run through Claude subscriptions.

    python3 bench.py prepare
    python3 bench.py validate [task ...]
    python3 bench.py solo <run> <model> [--effort high] [--parallel 3] [task ...]
    python3 bench.py team <run> --candidates <run> [--parallel 2] [task ...]
"""

import argparse
import json
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import agent
import grading
import prompts
import team
from tasks import DATA_ROOT, Task, load_tasks, model_solution, prepare

RUNS = DATA_ROOT / "runs"


def arm_dir(run: str, arm: str, task: Task) -> Path:
    return RUNS / run / arm / task.id


def grade_into(task: Task, attempt_dir: Path, solution: Path) -> dict:
    """Grade a solution and store a copy beside its result; a missing solution scores 0."""
    if not solution.exists():
        result = {"task": task.name, "compiled": False, "total": 0.0, "missing": True, "subtasks": []}
    else:
        shutil.copy(solution, attempt_dir / "final.cpp")
        result = grading.grade(task, attempt_dir / "final.cpp")
        result.pop("tests", None)
    (attempt_dir / "grade.json").write_text(json.dumps(result, indent=2))
    return result


def solo_task(run: str, model: str, effort: str, task: Task) -> tuple[str, float, agent.Attempt]:
    attempt_dir = arm_dir(run, f"solo-{model}", task)
    if (attempt_dir / "grade.json").exists():
        done = json.loads((attempt_dir / "grade.json").read_text())
        return task.id, done["total"], agent.Attempt(**json.loads((attempt_dir / "attempt.json").read_text()))
    record = agent.attempt(Path(task.public_dir), attempt_dir, prompts.SOLO.format(name=task.name), model, effort)
    result = grade_into(task, attempt_dir, attempt_dir / "ws" / "solution.cpp")
    return task.id, result["total"], record


def cmd_solo(args: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="bench.py solo")
    parser.add_argument("run")
    parser.add_argument("model")
    parser.add_argument("--effort", default="high")
    parser.add_argument("--parallel", type=int, default=3)
    parser.add_argument("tasks", nargs="*")
    options = parser.parse_intermixed_args(args)
    grading.build_image()
    tasks = load_tasks(options.tasks or None)
    with ThreadPoolExecutor(max_workers=options.parallel) as pool:
        jobs = [pool.submit(solo_task, options.run, options.model, options.effort, task) for task in tasks]
        for job in jobs:
            task_id, total, record = job.result()
            print(f"{task_id:20} {total:6.2f}  {record.seconds:5d}s turns={record.turns} failure={record.failure}", flush=True)


def cmd_prepare(_args: list[str]) -> None:
    for task in prepare():
        print(f"{task.id}: judge={task.judge_dir}")


def cmd_validate(args: list[str]) -> None:
    """Every official model solution must score 100, or the grader is wrong."""
    grading.build_image()
    tasks = load_tasks(args or None)

    def check(task):
        result = grading.grade(task, model_solution(task), workers=4)
        failed = {name: test for name, test in result.get("tests", {}).items() if test["score"] < 1}
        return task.id, result["total"], result.get("compile_error"), dict(list(failed.items())[:3])

    with ThreadPoolExecutor(max_workers=2) as pool:
        for task_id, total, compile_error, failed in pool.map(check, tasks):
            status = "ok" if total == 100 else "MISMATCH"
            print(f"{status:8} {task_id:20} {total:6.2f} {compile_error or ''} {json.dumps(failed)[:400] if failed else ''}", flush=True)


def team_task(run: str, candidate_run: str, effort: str, task: Task) -> tuple[str, float, str]:
    team_dir = arm_dir(run, "team", task)
    if (team_dir / "grade.json").exists():
        done = json.loads((team_dir / "grade.json").read_text())
        return task.id, done["total"], json.loads((team_dir / "team.json").read_text())["chosen"]
    candidates = team.member_solutions(candidate_run, task)
    if not candidates:
        return task.id, 0.0, "no candidates"
    team_dir.mkdir(parents=True, exist_ok=True)
    final, summary = team.run_team(task, team_dir, candidates, effort)
    result = grade_into(task, team_dir, final)
    return task.id, result["total"], summary["chosen"]


def cmd_team(args: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="bench.py team")
    parser.add_argument("run")
    parser.add_argument("--candidates", required=True, help="run holding solo-sonnet and solo-haiku attempts")
    parser.add_argument("--effort", default="high")
    parser.add_argument("--parallel", type=int, default=2)
    parser.add_argument("tasks", nargs="*")
    options = parser.parse_intermixed_args(args)
    grading.build_image()
    tasks = load_tasks(options.tasks or None)
    with ThreadPoolExecutor(max_workers=options.parallel) as pool:
        jobs = [pool.submit(team_task, options.run, options.candidates, options.effort, task) for task in tasks]
        for job in jobs:
            task_id, total, chosen = job.result()
            print(f"{task_id:20} {total:6.2f}  chosen={chosen}", flush=True)


COMMANDS = {"prepare": cmd_prepare, "validate": cmd_validate, "solo": cmd_solo, "team": cmd_team}

if __name__ == "__main__":
    COMMANDS[sys.argv[1]](sys.argv[2:])
