import hashlib
from pathlib import Path, PurePosixPath
from typing import Any

from cadir_runner.contracts import InspectRequest, InspectResponse, SkillDocumentResponse
from cadir_runner.security import CodePolicyError

ALLOWED_SKILL_DOCUMENTS = frozenset({"SKILL.md", "references/docs/api/README.md"})


def _safe_skill_document(skill_root: Path, document: str) -> Path:
    relative = PurePosixPath(document.replace("\\", "/"))
    if relative.is_absolute() or ".." in relative.parts or relative.suffix != ".md":
        raise CodePolicyError("Skill document path is invalid")
    allowed_prefixes = ("references/docs/api/", "references/docs/core/")
    normalized = str(relative)
    if normalized not in ALLOWED_SKILL_DOCUMENTS and not normalized.startswith(allowed_prefixes):
        raise CodePolicyError("Skill document is outside the public documentation surface")
    root = skill_root.resolve(strict=True)
    path = (root / Path(*relative.parts)).resolve(strict=True)
    if root not in path.parents or not path.is_file() or path.is_symlink():
        raise CodePolicyError("Skill document is missing or unsafe")
    return path


def load_skill_document(skill_root: Path, document: str, version: str) -> SkillDocumentResponse:
    path = _safe_skill_document(skill_root, document)
    content = path.read_text(encoding="utf-8")
    return SkillDocumentResponse(
        document=document,
        content=content,
        sha256=hashlib.sha256(content.encode("utf-8")).hexdigest(),
        version=version,
    )


def _workspace_model_json(workspace_root: Path, requested_workspace: str) -> Path:
    root = workspace_root.resolve(strict=True)
    workspace = Path(requested_workspace)
    if not workspace.is_absolute():
        workspace = root / workspace
    resolved = workspace.resolve(strict=True)
    if root not in resolved.parents:
        raise CodePolicyError("Workspace is outside the runner root")
    payload = (resolved / "Model" / "model.json").resolve(strict=True)
    if resolved not in payload.parents or not payload.is_file() or payload.is_symlink():
        raise CodePolicyError("Model/model.json is missing or unsafe")
    return payload


def inspect_geometry(workspace_root: Path, request: InspectRequest) -> InspectResponse:
    from simplecadapi import list_tags, replay_model_json  # type: ignore[import-not-found]

    payload = _workspace_model_json(workspace_root, request.workspace_path).read_text(
        encoding="utf-8"
    )
    rebuilt = replay_model_json(payload, strict=True)
    if len(rebuilt) != 1:
        raise CodePolicyError("Inspection requires exactly one replayed shape")
    solid = rebuilt[0]
    if request.entity == "solid":
        entity: Any = solid
        index = None
    else:
        entities = solid.get_faces() if request.entity == "face" else solid.get_edges()
        if request.index is None or request.index >= len(entities):
            raise CodePolicyError("Geometry index is outside the available topology")
        entity = entities[request.index]
        index = request.index

    facts: dict[str, Any] = {}
    for field in request.fields:
        if field == "volume" and request.entity == "solid":
            facts[field] = entity.get_volume()
        elif field == "area" and request.entity == "face":
            facts[field] = entity.get_area()
        elif field == "length" and request.entity == "edge":
            facts[field] = entity.get_length()
        elif field == "normal" and request.entity == "face":
            normal = entity.get_normal_at()
            facts[field] = [normal.x, normal.y, normal.z]
        elif field == "tags":
            facts[field] = list_tags(entity)
        elif field == "count" and request.entity == "solid":
            facts[field] = {
                "solids": 1,
                "faces": len(solid.get_faces()),
                "edges": len(solid.get_edges()),
            }
        else:
            raise CodePolicyError(f"Field {field} is not valid for {request.entity}")
    return InspectResponse(entity=request.entity, index=index, facts=facts)
