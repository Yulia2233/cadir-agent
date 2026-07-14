import os
from pathlib import Path

import pytest

from cadir_runner.security import (
    CodePolicyError,
    resolve_workspace_model,
    validate_entry_path,
    validate_model_code,
)


def test_requires_fixed_entry_path() -> None:
    assert str(validate_entry_path("Model/model.py")) == "Model/model.py"
    with pytest.raises(CodePolicyError):
        validate_entry_path("../model.py")


def test_requires_graph_session() -> None:
    with pytest.raises(CodePolicyError, match="GraphSession"):
        validate_model_code("print('no graph')")


@pytest.mark.parametrize("module", ["os", "subprocess", "socket", "requests"])
def test_blocks_dangerous_imports(module: str) -> None:
    with pytest.raises(CodePolicyError, match="Import is not allowed"):
        validate_model_code(f"import {module}\nGraphSession()")


def test_allows_pathlib_for_fixed_model_artifact_paths() -> None:
    validate_model_code(
        "from pathlib import Path\nfrom simplecadapi import GraphSession\nGraphSession()"
    )


@pytest.mark.parametrize("call", ["open('x')", "exec('x=1')", "eval('1')"])
def test_blocks_dynamic_or_file_calls(call: str) -> None:
    with pytest.raises(CodePolicyError, match="Call is not allowed"):
        validate_model_code(f"from simplecadapi import GraphSession\nGraphSession()\n{call}")


def test_rejects_hardlink_model(tmp_path: Path) -> None:
    root = tmp_path / "workspaces"
    workspace = root / "11111111-1111-4111-8111-111111111111"
    model = workspace / "Model" / "model.py"
    source = tmp_path / "outside.py"
    model.parent.mkdir(parents=True)
    source.write_text("GraphSession()", encoding="utf-8")
    model.hardlink_to(source)
    if os.getuid() == 0:
        for candidate in workspace.rglob("*"):
            os.chown(candidate, 10001, 10001)
        os.chown(workspace, 10001, 10001)

    with pytest.raises(CodePolicyError, match="hard link"):
        resolve_workspace_model(root, workspace.name)


def test_accepts_regular_workspace_model(tmp_path: Path) -> None:
    root = tmp_path / "workspaces"
    workspace = root / "11111111-1111-4111-8111-111111111111"
    model = workspace / "Model" / "model.py"
    model.parent.mkdir(parents=True)
    model.write_text("GraphSession()", encoding="utf-8")
    if os.getuid() == 0:
        for candidate in workspace.rglob("*"):
            os.chown(candidate, 10001, 10001)
        os.chown(workspace, 10001, 10001)

    assert resolve_workspace_model(root, workspace.name) == model.resolve()
