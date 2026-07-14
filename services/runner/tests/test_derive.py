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
    assert all(len(face["adjacentTopologyRefs"]) == 4 for face in topology["faces"])
    assert all(len(edge["adjacentTopologyRefs"]) == 2 for edge in topology["edges"])
    assert all(face["signature"]["geometryType"] == "plane" for face in topology["faces"])
    assert all(face["signature"]["axis"] is not None for face in topology["faces"])
    assert all(edge["signature"]["geometryType"] == "line" for edge in topology["edges"])
    assert all(edge["signature"]["axis"] is not None for edge in topology["edges"])


def test_derives_radius_and_axis_for_cylindrical_topology(tmp_path: Path) -> None:
    from simplecadapi import GraphSession, export_model_json, make_cylinder_rsolid

    workspace_root = tmp_path / "workspaces"
    model_directory = workspace_root / "workspace" / "Model"
    model_directory.mkdir(parents=True)
    with GraphSession() as session:
        make_cylinder_rsolid(5.0, 20.0)
    (model_directory / "model.json").write_text(export_model_json(session), encoding="utf-8")

    derive_model_artifacts(
        workspace_root,
        DeriveRequest(
            workspace_path="workspace",
            revision_id="22222222-2222-4222-8222-222222222222",
            image_width=320,
            image_height=240,
        ),
    )

    topology = json.loads((model_directory / "viewer" / "topology-map.json").read_text())
    cylindrical = [
        face for face in topology["faces"] if face["signature"]["geometryType"] == "cylinder"
    ]
    circular = [
        edge for edge in topology["edges"] if edge["signature"]["geometryType"] == "circle"
    ]
    assert len(cylindrical) == 1
    assert cylindrical[0]["signature"]["radius"] == 5.0
    assert [abs(value) for value in cylindrical[0]["signature"]["axis"]] == [0.0, 0.0, 1.0]
    assert len(circular) == 2
    assert all(edge["signature"]["radius"] == 5.0 for edge in circular)
