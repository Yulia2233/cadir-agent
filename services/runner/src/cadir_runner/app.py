import os
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

import yaml
from fastapi import FastAPI, Response, status

from cadir_runner import __version__
from cadir_runner.contracts import (
    ExecuteRequest,
    ExecutionResult,
    InspectRequest,
    InspectResponse,
    SkillDocumentRequest,
    SkillDocumentResponse,
)
from cadir_runner.executor import execute_model
from cadir_runner.security import CodePolicyError
from cadir_runner.tools import inspect_geometry, load_skill_document

app = FastAPI(title="CADIR Runner", version=__version__, docs_url=None, redoc_url=None)
WORKSPACE_ROOT = Path(os.environ.get("WORKSPACE_ROOT", "/data/workspaces"))
SKILL_ROOT = Path(os.environ.get("SIMPLECAD_SKILL_ROOT", "/opt/simplecadapi-skill"))
EXPECTED_CAD_VERSION = "2.0.1b1"


@app.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


def installed_sdk_version() -> str:
    try:
        return version("simplecadapi")
    except PackageNotFoundError:
        return ""


def installed_skill_version() -> str:
    try:
        skill_document = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
        if not skill_document.startswith("---\n"):
            return ""
        _, front_matter, _ = skill_document.split("---", 2)
        metadata = yaml.safe_load(front_matter)
        if not isinstance(metadata, dict):
            return ""
        skill_metadata = metadata.get("metadata")
        if not isinstance(skill_metadata, dict):
            return ""
        value = skill_metadata.get("version")
        return value if isinstance(value, str) else ""
    except (OSError, UnicodeError, ValueError, yaml.YAMLError):
        return ""


@app.get("/health/ready")
async def ready(response: Response) -> dict[str, str]:
    sdk_version = os.environ.get("SIMPLECADAPI_VERSION", EXPECTED_CAD_VERSION)
    skill_version = os.environ.get("SIMPLECAD_SKILL_VERSION", EXPECTED_CAD_VERSION)
    actual_sdk_version = installed_sdk_version()
    actual_skill_version = installed_skill_version()
    skill_files_exist = (SKILL_ROOT / "SKILL.md").is_file() and (
        SKILL_ROOT / "references" / "docs" / "api" / "README.md"
    ).is_file()
    if (
        sdk_version != EXPECTED_CAD_VERSION
        or skill_version != sdk_version
        or actual_sdk_version != sdk_version
        or actual_skill_version != skill_version
        or not skill_files_exist
    ):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unavailable", "reason": "cad_version_mismatch"}
    return {
        "status": "ready",
        "simplecadapi": actual_sdk_version,
        "skill": actual_skill_version,
    }


@app.post("/internal/execute", response_model=ExecutionResult)
async def execute(request: ExecuteRequest) -> ExecutionResult:
    return await execute_model(
        WORKSPACE_ROOT,
        request.workspace_path,
        request.timeout_seconds,
        request.max_output_bytes,
    )


@app.post("/internal/skill/document", response_model=SkillDocumentResponse)
async def skill_document(request: SkillDocumentRequest) -> SkillDocumentResponse:
    try:
        return load_skill_document(SKILL_ROOT, request.document, installed_skill_version())
    except (CodePolicyError, OSError, UnicodeError) as error:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/internal/inspect", response_model=InspectResponse)
async def inspect(request: InspectRequest) -> InspectResponse:
    try:
        return inspect_geometry(WORKSPACE_ROOT, request)
    except (CodePolicyError, OSError, UnicodeError, ValueError) as error:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail=str(error)) from error
