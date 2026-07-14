from typing import Literal

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
