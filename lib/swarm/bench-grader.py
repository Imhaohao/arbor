"""Sealed-bank grader for the small-team-vs-frontier benchmark.

Every program an agent submits runs inside a macOS sandbox with no network
and no read access to the bank, the key, or the user's documents. Oracles
(generator, brute force, reference) live only inside an encrypted blob and
are decrypted into a private temp dir for the duration of one grading call.

Subcommands (all print one JSON object on stdout):
  validate TASK_DIR                       check an authored task before sealing
  seal STAGING BANK KEY                   validate, time, encrypt every task
  grade BANK TASK_ID SOLUTION KEY [SEED]  hidden tests; pass one SEED per task so
                                          every arm faces identical tests
  run SOLUTION INPUTS_JSON TL             outputs on given inputs (sandboxed)
  call MODULE FN INPUTS_JSON TL           fn(inp) for model-written helpers
"""

import contextlib
import hashlib
import importlib.util
import io
import json
import math
import os
import random
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor

ORACLE_FILES = ("gen.py", "brute.py", "ref.py", "meta.json")
PUBLIC_FILES = ("statement.md", "examples.json")
VALIDATE_SMALL = 300
HIDDEN_COUNTS = {"small": 40, "medium": 10, "large": 5}
BRUTE_CHECKED_SMALL = 40
MIN_TIME_LIMIT_S = 2.0
TIME_LIMIT_FACTOR = 4.0
DOCUMENTS = os.path.expanduser("~/Documents")
RUN_WORKERS = 8


def emit(obj):
    print(json.dumps(obj))


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Timeout(Exception):
    pass


@contextlib.contextmanager
def time_limit(seconds):
    def handler(signum, frame):
        raise Timeout()

    previous = signal.signal(signal.SIGALRM, handler)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def outputs_match(expected, actual, checker):
    want, got = expected.split(), actual.split()
    if checker == "tokens":
        return want == got
    if checker.startswith("float:"):
        eps = float(checker.split(":", 1)[1])
        if len(want) != len(got):
            return False
        for w, g in zip(want, got):
            try:
                wf, gf = float(w), float(g)
            except ValueError:
                wf = gf = None
            # Non-numbers and non-finite values (inf, nan) compare as text,
            # matching bench-core.ts outputsMatch.
            if wf is None or not (math.isfinite(wf) and math.isfinite(gf)):
                if w != g:
                    return False
                continue
            if abs(wf - gf) > eps * max(1.0, abs(wf)):
                return False
        return True
    raise ValueError(f"unknown checker {checker}")


# ── sandboxed execution ──────────────────────────────────────────────────────

def sandbox_profile(denied_reads):
    reads = " ".join(f'(subpath "{path}")' for path in denied_reads)
    return (
        "(version 1)(allow default)(deny network*)"
        f"(deny file-read* {reads})"
        f'(deny file-write* (subpath "{os.path.expanduser("~")}"))'
    )


def run_sandboxed(solution, stdin_text, seconds, denied_reads):
    started = time.perf_counter()
    try:
        proc = subprocess.run(
            ["sandbox-exec", "-p", sandbox_profile(denied_reads), sys.executable, "-I", solution],
            input=stdin_text,
            capture_output=True,
            text=True,
            timeout=seconds,
            cwd=tempfile.gettempdir(),
        )
    except subprocess.TimeoutExpired:
        return {"status": "timeout", "secs": seconds}
    secs = round(time.perf_counter() - started, 3)
    if proc.returncode != 0:
        return {"status": "error", "secs": secs, "stderr": proc.stderr[-400:]}
    return {"status": "ok", "secs": secs, "stdout": proc.stdout}


def run_program_many(solution, inputs, seconds, denied_reads):
    """One fresh sandboxed process per input, exactly like official grading."""
    with ThreadPoolExecutor(RUN_WORKERS) as pool:
        return list(pool.map(lambda inp: run_sandboxed(solution, inp, seconds, denied_reads), inputs))


# Calls a model-written helper function (input generator or brute force) on
# many arguments inside ONE sandboxed process; helpers take arguments, not
# stdin, so a shared process is faithful here.
HELPER_RUNNER = r"""
import json, signal, sys
spec = json.loads(sys.stdin.read())
def on_alarm(signum, frame):
    raise TimeoutError()
signal.signal(signal.SIGALRM, on_alarm)
namespace = {"__name__": "helper"}
exec(compile(open(spec["path"]).read(), "helper.py", "exec"), namespace)
results = []
for arg in spec["inputs"]:
    try:
        signal.setitimer(signal.ITIMER_REAL, spec["seconds"])
        fn = namespace[spec["fn"]]
        out = str(fn(*arg) if isinstance(arg, list) else fn(arg))
        signal.setitimer(signal.ITIMER_REAL, 0)
        results.append({"status": "ok", "stdout": out})
    except TimeoutError:
        results.append({"status": "timeout"})
    except BaseException as error:
        signal.setitimer(signal.ITIMER_REAL, 0)
        results.append({"status": "error", "stderr": repr(error)[-300:]})
sys.stdout.write(json.dumps(results))
"""


def call_helper(path, fn, inputs, seconds, denied_reads):
    spec = json.dumps({"path": path, "inputs": inputs, "seconds": seconds, "fn": fn})
    budget = seconds * len(inputs) + 30
    try:
        proc = subprocess.run(
            ["sandbox-exec", "-p", sandbox_profile(denied_reads), sys.executable, "-I", "-c", HELPER_RUNNER],
            input=spec,
            capture_output=True,
            text=True,
            timeout=budget,
            cwd=tempfile.gettempdir(),
        )
        return json.loads(proc.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError):
        return [{"status": "error", "stderr": "batch runner crashed or hung"} for _ in inputs]


# ── authoring validation ─────────────────────────────────────────────────────

def validate(task_dir):
    problems = []
    for name in PUBLIC_FILES + ORACLE_FILES:
        if not os.path.exists(os.path.join(task_dir, name)):
            problems.append(f"missing {name}")
    if problems:
        return {"ok": False, "problems": problems}
    meta = json.load(open(os.path.join(task_dir, "meta.json")))
    checker = meta.get("checker", "tokens")
    gen = load_module(os.path.join(task_dir, "gen.py"), "gen")
    brute = load_module(os.path.join(task_dir, "brute.py"), "brute")
    ref = load_module(os.path.join(task_dir, "ref.py"), "ref")
    for example in json.load(open(os.path.join(task_dir, "examples.json"))):
        if not outputs_match(example["output"], ref.solve(example["input"]), checker):
            problems.append("ref disagrees with a statement example")
    distinct, disagreements = set(), 0
    for index in range(VALIDATE_SMALL):
        inp = gen.generate(random.Random(10_000 + index), "small")
        try:
            with time_limit(5):
                want = brute.solve(inp)
        except Timeout:
            problems.append("brute too slow on a small input")
            break
        distinct.add(want.strip())
        if not outputs_match(want, ref.solve(inp), checker):
            disagreements += 1
    if disagreements:
        problems.append(f"ref disagrees with brute on {disagreements}/{VALIDATE_SMALL} small inputs")
    if len(distinct) < 3:
        problems.append("small outputs are nearly constant")
    large_secs = []
    for index in range(3):
        inp = gen.generate(random.Random(20_000 + index), "large")
        started = time.perf_counter()
        try:
            with time_limit(10):
                ref.solve(inp)
        except Timeout:
            problems.append("ref exceeds 10 s on a large input")
            break
        large_secs.append(time.perf_counter() - started)
    worst = max(large_secs) if large_secs else None
    return {"ok": not problems, "problems": problems, "ref_large_secs": worst, "checker": checker}


def validate_isolated(task_dir):
    """Author code is untrusted too: validate each task in its own process."""
    try:
        proc = subprocess.run(
            [sys.executable, "-I", __file__, "validate", task_dir],
            capture_output=True, text=True, timeout=600,
        )
        return json.loads(proc.stdout.strip().splitlines()[-1])
    except (subprocess.TimeoutExpired, IndexError, json.JSONDecodeError):
        return {"ok": False, "problems": ["validation crashed or timed out"]}


# ── sealing ──────────────────────────────────────────────────────────────────

def tar_bytes(task_dir, names):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as tar:
        for name in sorted(names):
            info = tar.gettarinfo(os.path.join(task_dir, name), arcname=name)
            info.mtime, info.uid, info.gid, info.uname, info.gname = 0, 0, 0, "", ""
            with open(os.path.join(task_dir, name), "rb") as handle:
                tar.addfile(info, handle)
    return buffer.getvalue()


def openssl(args, data):
    return subprocess.run(["openssl", "enc", "-aes-256-cbc", "-pbkdf2", *args], input=data, capture_output=True, check=True).stdout


def seal(staging, bank, key):
    os.makedirs(bank, exist_ok=True)
    manifest = {"tasks": [], "rejected": []}
    for author in sorted(os.listdir(staging)):
        author_dir = os.path.join(staging, author)
        if not os.path.isdir(author_dir):
            continue
        for task in sorted(os.listdir(author_dir)):
            task_dir = os.path.join(author_dir, task)
            if not os.path.isdir(task_dir):
                continue
            task_id = f"{author}-{task}"
            report = validate_isolated(task_dir)
            if not report["ok"]:
                manifest["rejected"].append({"id": task_id, "problems": report["problems"]})
                continue
            meta = json.load(open(os.path.join(task_dir, "meta.json")))
            time_limit_s = round(max(MIN_TIME_LIMIT_S, TIME_LIMIT_FACTOR * report["ref_large_secs"]), 2)
            out_dir = os.path.join(bank, task_id)
            os.makedirs(out_dir, exist_ok=True)
            public = {
                "id": task_id,
                "title": meta.get("title", task_id),
                "topic": meta.get("topic", []),
                "author": meta.get("author", "unknown"),
                "checker": report["checker"],
                "time_limit_s": time_limit_s,
                "statement": open(os.path.join(task_dir, "statement.md")).read(),
                "examples": json.load(open(os.path.join(task_dir, "examples.json"))),
            }
            json.dump(public, open(os.path.join(out_dir, "public.json"), "w"), indent=2)
            plain = tar_bytes(task_dir, ORACLE_FILES)
            open(os.path.join(out_dir, "sealed.bin"), "wb").write(openssl(["-salt", "-pass", f"file:{key}"], plain))
            manifest["tasks"].append({"id": task_id, "oracle_sha256": hashlib.sha256(plain).hexdigest(), "time_limit_s": time_limit_s})
    json.dump(manifest, open(os.path.join(bank, "manifest.json"), "w"), indent=2)
    return {"sealed": len(manifest["tasks"]), "rejected": manifest["rejected"]}


@contextlib.contextmanager
def unsealed(bank, task_id, key):
    blob = open(os.path.join(bank, task_id, "sealed.bin"), "rb").read()
    plain = openssl(["-d", "-pass", f"file:{key}"], blob)
    private = tempfile.mkdtemp(prefix="bench-oracle-")
    try:
        with tarfile.open(fileobj=io.BytesIO(plain)) as tar:
            tar.extractall(private, filter="data")
        yield private
    finally:
        shutil.rmtree(private, ignore_errors=True)


# ── grading ──────────────────────────────────────────────────────────────────

def denied_paths(bank, key, oracle_dir):
    return [os.path.realpath(path) for path in (bank, os.path.dirname(key), oracle_dir, DOCUMENTS)]


def hidden_tests(oracle_dir, seed):
    gen = load_module(os.path.join(oracle_dir, "gen.py"), "gen")
    brute = load_module(os.path.join(oracle_dir, "brute.py"), "brute")
    ref = load_module(os.path.join(oracle_dir, "ref.py"), "ref")
    rng = random.Random(seed)
    tests, oracle_conflicts = [], 0
    for size, count in HIDDEN_COUNTS.items():
        for index in range(count):
            inp = gen.generate(random.Random(rng.getrandbits(64)), size)
            expected = ref.solve(inp)
            if size == "small" and index < BRUTE_CHECKED_SMALL:
                if brute.solve(inp).split() != expected.split():
                    oracle_conflicts += 1
                    continue
            tests.append({"size": size, "input": inp, "expected": expected})
    return tests, oracle_conflicts


def grade(bank, task_id, solution, key, seed=None):
    public = json.load(open(os.path.join(bank, task_id, "public.json")))
    seed = int(seed) if seed is not None else int.from_bytes(os.urandom(8), "big")
    with unsealed(bank, task_id, key) as oracle_dir:
        tests, oracle_conflicts = hidden_tests(oracle_dir, seed)
        denied = denied_paths(bank, key, oracle_dir)
        counts = {"pass": 0, "wrong": 0, "timeout": 0, "error": 0}
        first_failure = None
        for test in tests:
            run = run_sandboxed(solution, test["input"], public["time_limit_s"], denied)
            verdict = run["status"]
            if verdict == "ok":
                verdict = "pass" if outputs_match(test["expected"], run["stdout"], public["checker"]) else "wrong"
            counts[verdict] += 1
            if verdict != "pass":
                # Pass@1 needs every test, so the first failure decides it.
                first_failure = {"size": test["size"], "verdict": verdict}
                break
    return {
        "task": task_id,
        "seed": seed,
        "tests": len(tests),
        "passed": counts["pass"] == len(tests) and len(tests) > 0,
        "counts": counts,
        "first_failure": first_failure,
        "oracle_conflicts": oracle_conflicts,
    }


def main():
    command, args = sys.argv[1], sys.argv[2:]
    if command == "validate":
        emit(validate(args[0]))
    elif command == "seal":
        emit(seal(*args[:3]))
    elif command == "grade":
        emit(grade(*args[:5]))
    elif command in ("run", "call"):
        # Team-internal execution never sees oracles; BENCH_DENY_READ adds the
        # bank and key directories to the sandbox's unreadable paths.
        extra = [path for path in os.environ.get("BENCH_DENY_READ", "").split(":") if path]
        denied = [os.path.realpath(path) for path in [DOCUMENTS, *extra]]
        if command == "run":
            path, inputs_file, seconds = args
            emit({"results": run_program_many(path, json.load(open(inputs_file)), float(seconds), denied)})
        else:
            path, fn, inputs_file, seconds = args
            emit({"results": call_helper(path, fn, json.load(open(inputs_file)), float(seconds), denied)})
    else:
        raise SystemExit(f"unknown command {command}")


if __name__ == "__main__":
    main()
