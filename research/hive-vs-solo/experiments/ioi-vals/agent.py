"""Run one headless Claude Code attempt in a sandboxed IOI workspace.

The agent sees only a copy of the public bundle (statement, header, stub,
sample grader, compile/run scripts, examples). macOS sandbox-exec blocks reads
of every judge package and of other attempts, and signals to processes outside
the sandbox; WebFetch/WebSearch are disabled.
The answer is whatever the agent leaves in solution.cpp at the workspace root.
"""

import json
import os
import re
import shutil
import stat
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

from tasks import ARCHIVE, CMS2024, DATA_ROOT, IOI2024, REGISTRY

HIDDEN = [ARCHIVE, IOI2024, CMS2024, DATA_ROOT / "ioi-agent", REGISTRY, DATA_ROOT / "runs"]
ATTEMPT_SECONDS = 90 * 60
USAGE_LIMIT_PATTERN = re.compile(r"(usage|rate) limit|limit reached|resets? (at|in)|overloaded", re.IGNORECASE)
USAGE_LIMIT_WAIT_SECONDS = 20 * 60
GXX_SHIM = """#!/bin/sh
# Linux-style g++ for macOS: Homebrew GCC has bits/stdc++.h; -static is unsupported on macOS.
args=""
for arg in "$@"; do [ "$arg" = "-static" ] || args="$args '$arg'"; done
eval exec /opt/homebrew/bin/g++-13 $args
"""


@dataclass
class Attempt:
    ok: bool
    seconds: int
    turns: int
    cost_usd: float
    failure: str | None
    usage_waits: int


def sandbox_profile(attempt_dir: Path) -> str:
    denies = " ".join(f'(subpath "{path}")' if path.is_dir() else f'(literal "{path}")' for path in HIDDEN)
    # Later rules win in SBPL, so the attempt's own folder (workspace and g++ shim) is re-allowed inside runs/.
    # Signals stay inside the sandbox: an agent's `pkill h` once reached the user's own processes.
    return (f'(version 1)(allow default)(deny file-read* {denies})(allow file-read* (subpath "{attempt_dir}"))'
            '(deny signal)(allow signal (target same-sandbox))')


def make_workspace(public_dir: Path, attempt_dir: Path, extra: dict[str, str] | None = None) -> Path:
    workspace = attempt_dir / "ws"
    if workspace.exists():
        shutil.rmtree(workspace)
    shutil.copytree(public_dir, workspace)
    for name, content in (extra or {}).items():
        target = workspace / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
    bin_dir = attempt_dir / "bin"
    bin_dir.mkdir(exist_ok=True)
    for name in ("g++", "c++"):
        shim = bin_dir / name
        shim.write_text(GXX_SHIM)
        shim.chmod(shim.stat().st_mode | stat.S_IEXEC)
    for script in workspace.rglob("*"):
        if script.is_file() and (script.suffix == ".sh" or script.name in {"compile", "run", "submit"}):
            script.chmod(script.stat().st_mode | stat.S_IEXEC)
    return workspace


def claude_command(prompt: str, model: str, effort: str) -> list[str]:
    return [
        "claude", "-p", prompt,
        "--model", model,
        "--effort", effort,
        "--setting-sources", "project",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--permission-mode", "acceptEdits",
        "--allowedTools", "Bash", "Read", "Write", "Edit", "Glob", "Grep",
        "--disallowedTools", "WebFetch", "WebSearch", "Agent", "Task",
        "--output-format", "stream-json", "--verbose",
    ]


def final_event(transcript: Path) -> dict:
    result = {}
    for line in transcript.read_text(errors="replace").splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "result":
            result = event
    return result


def run_once(workspace: Path, attempt_dir: Path, prompt: str, model: str, effort: str) -> tuple[dict, str]:
    transcript = attempt_dir / "transcript.jsonl"
    env = {**os.environ, "PATH": f"{attempt_dir / 'bin'}:{os.environ['PATH']}"}
    command = ["sandbox-exec", "-p", sandbox_profile(attempt_dir), *claude_command(prompt, model, effort)]
    with transcript.open("w") as out, (attempt_dir / "stderr.txt").open("w") as err:
        proc = subprocess.Popen(command, cwd=workspace, stdout=out, stderr=err, env=env, start_new_session=True)
        try:
            proc.wait(timeout=ATTEMPT_SECONDS)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, 9)
            proc.wait()
            return final_event(transcript), "timeout"
    event = final_event(transcript)
    text = f"{event.get('result', '')} {(attempt_dir / 'stderr.txt').read_text(errors='replace')[-2000:]}"
    if event.get("is_error") or not event:
        return event, "usage_limit" if USAGE_LIMIT_PATTERN.search(text) else "error"
    return event, ""


def attempt(public_dir: Path, attempt_dir: Path, prompt: str, model: str, effort: str, extra: dict[str, str] | None = None) -> Attempt:
    """One attempt; a usage-limit failure restarts it from a clean workspace after a wait."""
    attempt_dir.mkdir(parents=True, exist_ok=True)
    waits = 0
    started = time.time()
    while True:
        workspace = make_workspace(public_dir, attempt_dir, extra)
        event, failure = run_once(workspace, attempt_dir, prompt, model, effort)
        if failure != "usage_limit" or waits >= 12:
            break
        waits += 1
        time.sleep(USAGE_LIMIT_WAIT_SECONDS)
        started = time.time()
    record = Attempt(
        ok=(workspace / "solution.cpp").exists(),
        seconds=int(time.time() - started),
        turns=int(event.get("num_turns", 0)),
        cost_usd=float(event.get("total_cost_usd", 0.0)),
        failure=failure or None,
        usage_waits=waits,
    )
    (attempt_dir / "attempt.json").write_text(json.dumps(record.__dict__, indent=2))
    return record
