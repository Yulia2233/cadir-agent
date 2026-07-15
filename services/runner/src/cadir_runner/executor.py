import asyncio
import os
import time
from pathlib import Path
from typing import Literal

from cadir_runner.contracts import ExecutionResult
from cadir_runner.security import CodePolicyError, resolve_workspace_model, validate_model_code


REQUIRED_MODEL_ARTIFACTS = ("model.json", "model.step", "model.stl")


async def execute_model(
    workspace_root: Path,
    workspace_path: str,
    timeout_seconds: int,
    max_output_bytes: int,
) -> ExecutionResult:
    started = time.monotonic()
    try:
        model_path = resolve_workspace_model(workspace_root, workspace_path)
        validate_model_code(model_path.read_text(encoding="utf-8"))
    except (CodePolicyError, OSError, UnicodeError) as error:
        return ExecutionResult(
            status="rejected",
            exit_code=None,
            stdout="",
            stderr=str(error),
            duration_ms=int((time.monotonic() - started) * 1000),
        )

    process = await asyncio.create_subprocess_exec(
        "python",
        "-I",
        "-B",
        str(model_path),
        cwd=model_path.parent.parent,
        env={
            "HOME": "/nonexistent",
            "LANG": "C.UTF-8",
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "PYTHONNOUSERSITE": "1",
        },
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        start_new_session=True,
    )
    try:
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            process.communicate(), timeout=timeout_seconds
        )
        execution_status: Literal["succeeded", "failed", "timed_out"] = (
            "succeeded" if process.returncode == 0 else "failed"
        )
    except TimeoutError:
        os.killpg(process.pid, 9)
        stdout_bytes, stderr_bytes = await process.communicate()
        execution_status = "timed_out"

    # A zero process exit code is not enough: downstream validation can only use
    # canonical artifacts written inside Model/. Reject incomplete executions at
    # this boundary so the repair loop receives immediate, actionable evidence.
    if execution_status == "succeeded":
        missing = [
            name
            for name in REQUIRED_MODEL_ARTIFACTS
            if not (model_path.parent / name).is_file()
            or (model_path.parent / name).stat().st_size == 0
        ]
        if missing:
            execution_status = "failed"
            detail = (
                "Required canonical artifacts are missing or empty in Model/: "
                + ", ".join(missing)
                + ". Write export_model_json(session) to Model/model.json and export STEP/STL "
                "to Model/model.step and Model/model.stl."
            )
            stderr_bytes = (stderr_bytes + b"\n" if stderr_bytes else b"") + detail.encode()

    truncated = len(stdout_bytes) > max_output_bytes or len(stderr_bytes) > max_output_bytes
    return ExecutionResult(
        status=execution_status,
        exit_code=process.returncode,
        stdout=stdout_bytes[:max_output_bytes].decode("utf-8", errors="replace"),
        stderr=stderr_bytes[:max_output_bytes].decode("utf-8", errors="replace"),
        duration_ms=int((time.monotonic() - started) * 1000),
        output_truncated=truncated,
    )
