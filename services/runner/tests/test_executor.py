import asyncio
from pathlib import Path

from cadir_runner.executor import execute_model


def _prepare_workspace(tmp_path: Path, source: str) -> tuple[Path, str]:
    workspace = tmp_path / "workspace"
    model = workspace / "Model"
    model.mkdir(parents=True)
    (model / "model.py").write_text(source, encoding="utf-8")
    return tmp_path, str(workspace)


def test_zero_exit_without_canonical_artifacts_fails(tmp_path: Path) -> None:
    root, workspace = _prepare_workspace(
        tmp_path,
        """from simplecadapi import GraphSession\nwith GraphSession():\n    pass\n""",
    )

    result = asyncio.run(execute_model(root, workspace, 30, 64 * 1024))

    assert result.status == "failed"
    assert "Required canonical artifacts" in result.stderr
    assert "model.json" in result.stderr
    assert "Model/model.step" in result.stderr


def test_complete_canonical_artifacts_allow_success(tmp_path: Path) -> None:
    root, workspace = _prepare_workspace(
        tmp_path,
        """from pathlib import Path
from simplecadapi import GraphSession
model_dir = Path(__file__).resolve().parent
with GraphSession():
    pass
for name in ("model.json", "model.step", "model.stl"):
    (model_dir / name).write_text("test", encoding="utf-8")
""",
    )

    result = asyncio.run(execute_model(root, workspace, 30, 64 * 1024))

    assert result.status == "succeeded"
