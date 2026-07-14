from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from cadir_runner import app as app_module


def write_skill_bundle(root: Path, version: str = "2.0.1b1") -> None:
    (root / "SKILL.md").write_text(
        f"---\nmetadata:\n  version: {version}\n---\n", encoding="utf-8"
    )
    api_docs = root / "references" / "docs" / "api"
    api_docs.mkdir(parents=True)
    (api_docs / "README.md").write_text("api", encoding="utf-8")


def test_readiness_fails_when_installed_sdk_does_not_match(monkeypatch) -> None:
    monkeypatch.setenv("SIMPLECADAPI_VERSION", "2.0.1b1")
    monkeypatch.setenv("SIMPLECAD_SKILL_VERSION", "2.0.1b1")
    with patch.object(app_module, "installed_sdk_version", return_value="0.0.0"):
        response = TestClient(app_module.app).get("/health/ready")

    assert response.status_code == 503
    assert response.json()["reason"] == "cad_version_mismatch"


def test_installed_skill_version_reads_the_skill_metadata(tmp_path: Path) -> None:
    write_skill_bundle(tmp_path)
    with patch.object(app_module, "SKILL_ROOT", tmp_path):
        assert app_module.installed_skill_version() == "2.0.1b1"


def test_readiness_succeeds_for_matching_sdk_and_skill(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("SIMPLECADAPI_VERSION", "2.0.1b1")
    monkeypatch.setenv("SIMPLECAD_SKILL_VERSION", "2.0.1b1")
    write_skill_bundle(tmp_path)
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


def test_readiness_fails_when_skill_metadata_version_does_not_match(
    monkeypatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("SIMPLECADAPI_VERSION", "2.0.1b1")
    monkeypatch.setenv("SIMPLECAD_SKILL_VERSION", "2.0.1b1")
    write_skill_bundle(tmp_path, "9.9.9")
    with (
        patch.object(app_module, "SKILL_ROOT", tmp_path),
        patch.object(app_module, "installed_sdk_version", return_value="2.0.1b1"),
    ):
        response = TestClient(app_module.app).get("/health/ready")

    assert response.status_code == 503
    assert response.json()["reason"] == "cad_version_mismatch"
