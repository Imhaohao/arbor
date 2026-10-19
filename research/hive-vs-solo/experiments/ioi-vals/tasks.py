"""The 18 IOI problems Vals scores (IOI 2024, 2025, 2026) and where their official packages live.

Judge packages (tests, graders, checkers, official solutions) stay under
DATA_ROOT and are never readable by an agent. Public bundles hold only what a
contestant gets: the English statement and the attachments zip.
"""

import json
import shutil
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path

DATA_ROOT = Path.home() / ".arbor-bench" / "ioi"
ARCHIVE = DATA_ROOT / "task-archive"
IOI2024 = DATA_ROOT / "ioi2024-tasks"
CMS2024 = DATA_ROOT / "cms2024"
PUBLIC_ROOT = DATA_ROOT / "public"
REGISTRY = DATA_ROOT / "tasks.json"

PROBLEMS = {
    2024: {"day1": ["nile", "message", "tree"], "day2": ["hieroglyphs", "mosaic", "sphinx"]},
    2025: {"day1": ["souvenirs", "triples", "worldmap"], "day2": ["festival", "migrations", "obstacles"]},
    2026: {"day1": ["ballmachine", "monuments", "tiling"], "day2": ["classroom", "magiccity", "partition"]},
}


@dataclass(frozen=True)
class Task:
    id: str
    year: int
    name: str
    judge_dir: str
    public_dir: str


def _sources_2024(day: str, name: str) -> tuple[Path, Path, Path]:
    folder = IOI2024 / day / name
    cms_root = CMS2024 / name
    if not cms_root.exists():
        package = next(folder.glob(f"{name}-CMS.*"))
        shutil.unpack_archive(package, CMS2024)
    return cms_root, folder / "statements" / "en.pdf", folder / f"{name}.zip"


def _sources_archive(year: int, day: str, name: str) -> tuple[Path, Path, Path]:
    folder = ARCHIVE / str(year) / day / name
    statement = next(path for path in (folder / "en.pdf", folder / "statement.pdf") if path.exists())
    return folder, statement, folder / "attachments" / f"{name}.zip"


def _build_public(task_id: str, statement: Path, attachments: Path) -> Path:
    public = PUBLIC_ROOT / task_id
    if public.exists():
        shutil.rmtree(public)
    public.mkdir(parents=True)
    shutil.copy(statement, public / "statement.pdf")
    with zipfile.ZipFile(attachments) as archive:
        archive.extractall(public)
    return public


def prepare() -> list[Task]:
    tasks = []
    for year, days in PROBLEMS.items():
        for day, names in days.items():
            for name in names:
                source = _sources_2024 if year == 2024 else (lambda d, n, y=year: _sources_archive(y, d, n))
                judge, statement, attachments = source(day, name)
                task_id = f"{year}-{name}"
                public = _build_public(task_id, statement, attachments)
                tasks.append(Task(task_id, year, name, str(judge), str(public)))
    REGISTRY.write_text(json.dumps([asdict(task) for task in tasks], indent=2))
    return tasks


def load_tasks(selected: list[str] | None = None) -> list[Task]:
    tasks = [Task(**entry) for entry in json.loads(REGISTRY.read_text())]
    return [task for task in tasks if not selected or task.id in selected or task.name in selected]


def model_solution(task: Task) -> Path:
    """An official full-score solution that compiles on its own (some include a grader by relative path)."""
    solutions = Path(task.judge_dir) / "solutions"
    candidates = sorted((solutions / "model_solution").glob("*.cpp")) + sorted((solutions / "correct").glob("*.cpp"))
    return next(path for path in candidates if '#include "..' not in path.read_text(errors="replace"))
