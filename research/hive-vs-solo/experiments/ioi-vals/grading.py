"""Host-side wrapper that grades a solution inside the ioi-judge container."""

import json
import subprocess
from pathlib import Path

from tasks import DATA_ROOT, Task

IMAGE = "ioi-judge:1"
HERE = Path(__file__).resolve().parent


def build_image() -> None:
    subprocess.run(["docker", "build", "-q", "-t", IMAGE, str(HERE)], check=True, capture_output=True)


def grade(task: Task, solution: Path, workers: int = 4, tests: list[str] | None = None) -> dict:
    """Mount the data root read-only and the solution's folder, run judge.py, return its JSON."""
    solution = solution.resolve()
    command = [
        "docker", "run", "--rm", "--network", "none", "--cpus", str(workers), "--memory", "6g",
        "-v", f"{DATA_ROOT}:{DATA_ROOT}:ro",
        "-v", f"{solution.parent}:/submission:ro",
        IMAGE, "python3", "/opt/judge.py", task.judge_dir, f"/submission/{solution.name}",
        "--workers", str(workers),
    ]
    if tests:
        command += ["--tests", ",".join(tests)]
    result = subprocess.run(command, capture_output=True, text=True, timeout=3600)
    lines = [line for line in result.stdout.splitlines() if line.startswith("{")]
    if not lines:
        raise RuntimeError(f"judge produced no result for {task.id}: {result.stderr[-2000:]}")
    return json.loads(lines[-1])
