from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ExecuteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str = Field(pattern=r"^[0-9a-f-]{36}$")
    workspace_path: str
    timeout_seconds: int = Field(default=300, ge=1, le=900)
    max_output_bytes: int = Field(default=1_048_576, ge=1024, le=4_194_304)


class ExecutionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["succeeded", "failed", "timed_out", "rejected"]
    exit_code: int | None
    stdout: str
    stderr: str
    duration_ms: int
    output_truncated: bool = False


class SkillDocumentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document: str = Field(min_length=1, max_length=255)


class SkillDocumentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document: str
    content: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    version: str


class InspectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_path: str
    entity: Literal["solid", "face", "edge"]
    index: int | None = Field(default=None, ge=0)
    fields: list[
        Literal["volume", "bounds", "area", "length", "normal", "center", "tags", "count"]
    ] = Field(min_length=1, max_length=10)


class InspectResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entity: Literal["solid", "face", "edge"]
    index: int | None
    facts: dict[str, Any]
