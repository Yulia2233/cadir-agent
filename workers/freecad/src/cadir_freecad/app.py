from importlib.metadata import PackageNotFoundError, version
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field

from cadir_freecad import __version__

app = FastAPI(title="CADIR FreeCAD Worker", version=__version__, docs_url=None, redoc_url=None)


class ConvertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_json: str = Field(min_length=2, max_length=32 * 1024 * 1024)
    document_name: str = Field(
        default="SimpleCADModel",
        min_length=1,
        max_length=80,
        pattern=r"^[A-Za-z][A-Za-z0-9_]*$",
    )
    output: Literal["script", "fcstd", "both"] = "script"


class ConvertResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["succeeded", "failed", "unsupported"]
    script: str | None = None
    fcstd_path: str | None = None
    reason: str | None = None
    simplecadapi_version: str
    worker_version: str


def sdk_version() -> str:
    try:
        return version("simplecadapi")
    except PackageNotFoundError:
        return ""


@app.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.get("/health/ready")
async def ready() -> dict[str, str]:
    return {
        "status": "ready" if sdk_version() == "2.0.1b1" else "unavailable",
        "simplecadapi": sdk_version(),
        "worker": __version__,
    }


@app.post("/internal/convert", response_model=ConvertResponse)
async def convert(request: ConvertRequest) -> ConvertResponse:
    from simplecadapi import replay_model_json, translate_model_json_to_freecad_script

    try:
        rebuilt = replay_model_json(request.model_json, strict=True)
        if not rebuilt:
            raise ValueError("Canonical model contains no replayable shape")
        script = translate_model_json_to_freecad_script(request.model_json, request.document_name)
        if request.output in {"fcstd", "both"}:
            return ConvertResponse(
                status="unsupported",
                script=script if request.output == "both" else None,
                reason="FreeCADCmd is unavailable in the script-only worker image",
                simplecadapi_version=sdk_version(),
                worker_version=__version__,
            )
        return ConvertResponse(
            status="succeeded",
            script=script,
            simplecadapi_version=sdk_version(),
            worker_version=__version__,
        )
    except (ValueError, RuntimeError, KeyError) as error:
        return ConvertResponse(
            status="failed",
            reason=str(error)[:500],
            simplecadapi_version=sdk_version(),
            worker_version=__version__,
        )
