import json
from pathlib import Path

import pytest

from cadir_runner.contracts import InspectRequest
from cadir_runner.security import CodePolicyError
from cadir_runner.tools import load_skill_document


def test_loads_only_public_markdown_documents(tmp_path: Path) -> None:
    document = tmp_path / "references" / "docs" / "api" / "make_box_rsolid.md"
    document.parent.mkdir(parents=True)
    document.write_text("# make_box_rsolid\n", encoding="utf-8")
    response = load_skill_document(
        tmp_path, "references/docs/api/make_box_rsolid.md", "2.0.1b1"
    )
    assert response.document.endswith("make_box_rsolid.md")
    assert response.sha256 == "ce63cba8f74b2e4fef690734b702723a2d1f94c9dcb3328435223fa063016b1a"


@pytest.mark.parametrize("document", ["../secret.md", "/etc/passwd", "references/private.md"])
def test_rejects_skill_path_escape(tmp_path: Path, document: str) -> None:
    with pytest.raises((CodePolicyError, FileNotFoundError)):
        load_skill_document(tmp_path, document, "2.0.1b1")


def test_inspection_contract_rejects_code_strings() -> None:
    with pytest.raises(ValueError):
        InspectRequest.model_validate(
            {
                "workspace_path": "workspace",
                "entity": "face",
                "index": 0,
                "fields": ["__import__('os').system('id')"],
            }
        )


def test_inspection_contract_round_trips_structured_fields() -> None:
    request = InspectRequest.model_validate_json(
        json.dumps(
            {
                "workspace_path": "workspace",
                "entity": "face",
                "index": 0,
                "fields": ["area", "normal", "center", "tags"],
            }
        )
    )
    assert request.fields == ["area", "normal", "center", "tags"]
