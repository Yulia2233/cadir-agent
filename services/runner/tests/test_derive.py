import json
from pathlib import Path

from cadir_runner.contracts import DeriveRequest
from cadir_runner.derive import derive_model_artifacts


def test_derives_complete_revision_artifact_set(tmp_path: Path) -> None:
    from simplecadapi import GraphSession, export_model_json, make_box_rsolid

    workspace_root = tmp_path / "workspaces"
    model_directory = workspace_root / "workspace" / "Model"
    model_directory.mkdir(parents=True)
    with GraphSession() as session:
        make_box_rsolid(10.0, 20.0, 5.0)
    (model_directory / "model.json").write_text(export_model_json(session), encoding="utf-8")

    response = derive_model_artifacts(
        workspace_root,
        DeriveRequest(
            workspace_path="workspace",
            revision_id="11111111-1111-4111-8111-111111111111",
            image_width=320,
            image_height=240,
        ),
    )

    assert response.face_count == 6
    assert response.edge_count == 12
    assert response.triangle_count > 0
    assert set(response.generated) == {
        "previews/iso.png",
        "previews/front.png",
        "previews/back.png",
        "previews/left.png",
        "previews/right.png",
        "previews/top.png",
        "previews/bottom.png",
        "viewer/model.glb",
        "viewer/topology-map.json",
        "viewer/edges.bin",
        "viewer/model.brep",
    }
    assert all((model_directory / relative).stat().st_size > 0 for relative in response.generated)
    topology = json.loads((model_directory / "viewer" / "topology-map.json").read_text())
    assert topology["revisionId"] == "11111111-1111-4111-8111-111111111111"
    assert len(topology["faces"]) == 6
    assert len(topology["edges"]) == 12
