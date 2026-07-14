import ast
from pathlib import Path, PurePosixPath


class CodePolicyError(ValueError):
    """Raised when model code requests capabilities outside the CAD policy."""


BLOCKED_MODULES = frozenset(
    {
        "ctypes",
        "http",
        "importlib",
        "multiprocessing",
        "os",
        "requests",
        "shutil",
        "socket",
        "subprocess",
        "sys",
        "tempfile",
        "urllib",
    }
)

BLOCKED_CALLS = frozenset({"compile", "eval", "exec", "globals", "locals", "open", "__import__"})
ENTRY_PATH = PurePosixPath("Model/model.py")
ALLOWED_ARTIFACTS = frozenset({"model.json", "model.step", "model.stl"})


def validate_entry_path(value: str) -> PurePosixPath:
    path = PurePosixPath(value.replace("\\", "/"))
    if path.is_absolute() or ".." in path.parts or path != ENTRY_PATH:
        raise CodePolicyError("Only Model/model.py can be executed")
    return path


def validate_model_code(source: str) -> None:
    if len(source.encode("utf-8")) > 512 * 1024:
        raise CodePolicyError("Model code exceeds the size limit")
    try:
        tree = ast.parse(source, filename="Model/model.py")
    except SyntaxError as error:
        raise CodePolicyError(f"Python syntax error at line {error.lineno}") from error

    graph_session_used = False
    for node in ast.walk(tree):
        if isinstance(node, ast.Import | ast.ImportFrom):
            modules = (
                [alias.name for alias in node.names]
                if isinstance(node, ast.Import)
                else [node.module or ""]
            )
            for module in modules:
                root = module.split(".", 1)[0]
                if root in BLOCKED_MODULES:
                    raise CodePolicyError(f"Import is not allowed: {root}")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in BLOCKED_CALLS:
                raise CodePolicyError(f"Call is not allowed: {node.func.id}")
            if node.func.id == "GraphSession":
                graph_session_used = True
            if node.func.id == "Path":
                if not node.args or not isinstance(node.args[0], ast.Name):
                    raise CodePolicyError("Path may only resolve from __file__")
                if node.args[0].id != "__file__":
                    raise CodePolicyError("Path may only resolve from __file__")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr == "write_text":
                artifact = _joined_artifact_name(node.func.value)
                if artifact not in ALLOWED_ARTIFACTS:
                    raise CodePolicyError("Model code may only write fixed Model artifacts")
        if isinstance(node, ast.Name) and node.id == "GraphSession":
            graph_session_used = True

    if not graph_session_used:
        raise CodePolicyError("Model code must use GraphSession")


def _joined_artifact_name(node: ast.expr) -> str | None:
    if not isinstance(node, ast.BinOp) or not isinstance(node.op, ast.Div):
        return None
    if not isinstance(node.left, ast.Name) or node.left.id != "model_dir":
        return None
    return (
        node.right.value
        if isinstance(node.right, ast.Constant) and isinstance(node.right.value, str)
        else None
    )


def resolve_workspace_model(workspace_root: Path, requested_workspace: str) -> Path:
    root = workspace_root.resolve(strict=True)
    workspace = Path(requested_workspace)
    if not workspace.is_absolute():
        workspace = root / workspace
    resolved = workspace.resolve(strict=True)
    if root not in resolved.parents:
        raise CodePolicyError("Workspace is outside the runner root")
    model = resolved / "Model" / "model.py"
    if model.is_symlink() or not model.is_file():
        raise CodePolicyError("Model/model.py is missing or unsafe")
    resolved_model = model.resolve(strict=True)
    if resolved not in resolved_model.parents:
        raise CodePolicyError("Model path escapes the workspace")
    workspace_device = resolved.stat().st_dev
    for candidate in resolved_model.parents:
        if candidate == resolved.parent:
            break
        stat = candidate.stat()
        if stat.st_dev != workspace_device:
            raise CodePolicyError("Model path crosses a filesystem boundary")
    for candidate in resolved.rglob("*"):
        stat = candidate.lstat()
        if candidate.is_symlink() or (candidate.is_file() and stat.st_nlink > 1):
            raise CodePolicyError("Workspace contains a symbolic or hard link")
        if stat.st_dev != workspace_device:
            raise CodePolicyError("Workspace contains a mounted path")
        if stat.st_uid not in {10001, 10002} or stat.st_gid not in {10001, 10002}:
            raise CodePolicyError("Workspace file ownership is invalid")
    return resolved_model
