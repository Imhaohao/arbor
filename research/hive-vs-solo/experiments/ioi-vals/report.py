"""Audit transcripts for forbidden access, and score arms the way Vals does."""

import itertools
import json
import re
from pathlib import Path
from statistics import mean

from tasks import Task

VALS_REFERENCE = {
    "Gemini 4 Argon": 100.00, "GPT-6 Astra": 100.00, "GPT-6.1 Sol": 96.89,
    "Claude Opus 5.5": 95.06, "Claude Sonnet 5.5": 83.06,
}
VALS_SONNET_BY_YEAR = {2024: 85.00, 2025: 88.33, 2026: 75.83}
HIDDEN_MARKERS = ("task-archive", "ioi2024-tasks", "cms2024", "ioi-agent", "tasks.json", "/solutions/")
NETWORK_PATTERN = re.compile(r"\b(curl|wget|pip3? install|git clone|nc |ssh |http[s]?://)", re.IGNORECASE)


def tool_calls(transcript: Path):
    for line in transcript.read_text(errors="replace").splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        for block in (event.get("message") or {}).get("content") or []:
            if isinstance(block, dict) and block.get("type") in {"tool_use", "tool_result"}:
                yield block


def audit_transcript(transcript: Path) -> list[str]:
    flags = []
    for block in tool_calls(transcript):
        text = json.dumps(block.get("input") if block["type"] == "tool_use" else block.get("content"))
        if block["type"] == "tool_use":
            flags += [f"hidden path: {marker}" for marker in HIDDEN_MARKERS if marker in text]
            if NETWORK_PATTERN.search(text):
                flags.append(f"network-looking command: {NETWORK_PATTERN.search(text).group(0)}")
        elif "Operation not permitted" in text:
            flags.append("sandbox denied a read")
    return sorted(set(flags))


def audit(run_dir: Path) -> dict[str, list[str]]:
    return {str(path.parent.relative_to(run_dir)): flags for path in sorted(run_dir.rglob("transcript.jsonl")) if (flags := audit_transcript(path))}


def arm_scores(arm_dir: Path, tasks: list[Task]) -> dict[str, float]:
    scores = {}
    for task in tasks:
        grade = arm_dir / task.id / "grade.json"
        if grade.exists():
            scores[task.id] = json.loads(grade.read_text())["total"]
    return scores


def vals_overall(scores: dict[str, float], tasks: list[Task]) -> dict:
    """Vals' formula: mean over the three years of each year's mean problem score."""
    by_year = {}
    for year in sorted({task.year for task in tasks}):
        year_tasks = [task.id for task in tasks if task.year == year]
        if all(task_id in scores for task_id in year_tasks):
            by_year[year] = round(mean(scores[task_id] for task_id in year_tasks), 2)
    complete = len(by_year) == len({task.year for task in tasks})
    return {"by_year": by_year, "overall": round(mean(by_year.values()), 2) if complete else None}


def wilcoxon_exact(first: list[float], second: list[float]) -> dict:
    """Two-sided exact Wilcoxon signed-rank test on paired scores (zero differences dropped)."""
    diffs = [a - b for a, b in zip(first, second) if a != b]
    if not diffs:
        return {"n": 0, "p": 1.0}
    order = sorted(range(len(diffs)), key=lambda i: abs(diffs[i]))
    ranks = [0.0] * len(diffs)
    position = 0
    while position < len(order):
        tied = [i for i in order[position:] if abs(diffs[i]) == abs(diffs[order[position]])]
        for i in tied:
            ranks[i] = position + (len(tied) + 1) / 2
        position += len(tied)
    observed = sum(rank for rank, diff in zip(ranks, diffs) if diff > 0)
    total = sum(ranks)
    centre = total / 2
    extreme = sum(1 for signs in itertools.product((0, 1), repeat=len(ranks))
                  if abs(sum(rank for rank, sign in zip(ranks, signs) if sign) - centre) >= abs(observed - centre) - 1e-9)
    return {"n": len(diffs), "w_plus": observed, "p": round(extreme / 2 ** len(ranks), 4)}
