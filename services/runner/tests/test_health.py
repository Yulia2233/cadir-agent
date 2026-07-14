from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from cadir_runner import app as app_module


def test_readiness_fails_when_installed_sdk_does_not_match(monkeypatch) -> None:
    monkeypatch.setenv("SIMPLECADAPI_VERSION", "2.0.1b1")
    monkeypatch.setenv("SIMPLECAD_SKILL_VERSION", "2.0.1b1")
    with patch.object(app_module, "installed_sdk_version", return_value="0.0.0"):
        response = TestClient(app_module.app).get("/health/ready")

    assert response.status_code == 503
    assert response.json()["reason"] == "cad_version_mismatch"


def test_readiness_succeeds_for_matching_sdk_and_skill(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("SIMPLECADAPI_VERSION", "2.0.1b1")
    monkeypatch.setenv("SIMPLECAD_SKILL_VERSION", "2.0.1b1")
    (tmp_path / "SKILL.md").write_text("skill", encoding="utf-8")
    api_docs = tmp_path / "references" / "docs" / "api"
    api_docs.mkdir(parents=True)
    (api_docs / "README.md").write_text("api", encoding="utf-8")
    with (
        patch.object(app_module, "SKILL_ROOT", tmp_path),
        patch.object(app_module, "installed_sdk_version", return_value="2.0.1b1"),
    ):
        response = TestClient(app_module.app).get("/health/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"


def test_readiness_fails_when_skill_documents_are_missing(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("SIMPLECADAPI_VERSION", "2.0.1b1")
    monkeypatch.setenv("SIMPLECAD_SKILL_VERSION", "2.0.1b1")
    with (
        patch.object(app_module, "SKILL_ROOT", tmp_path),
        patch.object(app_module, "installed_sdk_version", return_value="2.0.1b1"),
    ):
        response = TestClient(app_module.app).get("/health/ready")

    assert response.status_code == 503
