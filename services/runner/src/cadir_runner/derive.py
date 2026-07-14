import json
import struct
from pathlib import Path
from typing import Any

import numpy as np

from cadir_runner.contracts import DeriveRequest, DeriveResponse
from cadir_runner.security import CodePolicyError
from cadir_runner.tools import _workspace_model_json


def derive_model_artifacts(workspace_root: Path, request: DeriveRequest) -> DeriveResponse:
    from simplecadapi import list_tags, render_screenshot_rpath, replay_model_json
    from OCP.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Surface
    from OCP.BRepTools import BRepTools
    from OCP.GCPnts import GCPnts_QuasiUniformDeflection

    model_json_path = _workspace_model_json(workspace_root, request.workspace_path)
    model_directory = model_json_path.parent
    shapes = replay_model_json(model_json_path.read_text(encoding="utf-8"), strict=True)
    if len(shapes) != 1:
        raise CodePolicyError("Artifact derivation requires exactly one replayed solid")
    solid = shapes[0]
    preview_directory = model_directory / "previews"
    viewer_directory = model_directory / "viewer"
    preview_directory.mkdir(parents=True, exist_ok=True)
    viewer_directory.mkdir(parents=True, exist_ok=True)
    generated: list[str] = []
    for view in ("iso", "front", "back", "left", "right", "top", "bottom"):
        output = preview_directory / f"{view}.png"
        render_screenshot_rpath(
            solid,
            str(output),
            image_size=(request.image_width, request.image_height),
            view=view,
            show_axes=True,
            show_legend=False,
        )
        generated.append(str(output.relative_to(model_directory)).replace("\\", "/"))

    positions: list[float] = []
    indices: list[int] = []
    faces: list[dict[str, Any]] = []
    triangle_cursor = 0
    for face_index, face in enumerate(solid.get_faces()):
        vertices, triangles = _tessellate_face(face.wrapped)
        vertex_offset = len(positions) // 3
        positions.extend(value for vertex in vertices for value in vertex)
        indices.extend(vertex_offset + index for triangle in triangles for index in triangle)
        center = face.get_center()
        normal = face.get_normal_at()
        face_ref = f"face_{face_index:06d}"
        faces.append(
            {
                "displayId": f"F{face_index + 1}",
                "topologyRef": face_ref,
                "triangleStart": triangle_cursor,
                "triangleCount": len(triangles),
                "tags": list_tags(face),
                "signature": {
                    "geometryType": _surface_type(BRepAdaptor_Surface(face.wrapped).GetType()),
                    "center": [center.x, center.y, center.z],
                    "normal": [normal.x, normal.y, normal.z],
                    "axis": None,
                    "area": face.get_area(),
                    "length": None,
                    "radius": None,
                },
                "adjacentTopologyRefs": [],
            }
        )
        triangle_cursor += len(triangles)

    polyline_values: list[float] = []
    edges: list[dict[str, Any]] = []
    polyline_cursor = 0
    for edge_index, edge in enumerate(solid.get_edges()):
        adaptor = BRepAdaptor_Curve(edge.wrapped)
        sampler = GCPnts_QuasiUniformDeflection(adaptor, 0.15)
        points = []
        for point_index in range(1, sampler.NbPoints() + 1):
            point = sampler.Value(point_index)
            points.append((point.X(), point.Y(), point.Z()))
        if len(points) < 2:
            start = edge.get_start_vertex().get_coordinates()
            end = edge.get_end_vertex().get_coordinates()
            points = [start, end]
        polyline_values.extend(value for point in points for value in point)
        center = edge.get_center()
        edges.append(
            {
                "displayId": f"E{edge_index + 1}",
                "topologyRef": f"edge_{edge_index:06d}",
                "polylineStart": polyline_cursor,
                "polylineCount": len(points),
                "tags": list_tags(edge),
                "signature": {
                    "geometryType": _curve_type(adaptor.GetType()),
                    "center": [center.x, center.y, center.z],
                    "normal": None,
                    "axis": None,
                    "area": None,
                    "length": edge.get_length(),
                    "radius": None,
                },
                "adjacentTopologyRefs": [],
            }
        )
        polyline_cursor += len(points)

    topology = {
        "version": "1",
        "revisionId": request.revision_id,
        "unit": "mm",
        "faces": [face for face in faces if face["triangleCount"] > 0],
        "edges": [edge for edge in edges if edge["polylineCount"] > 0],
    }
    topology_path = viewer_directory / "topology-map.json"
    topology_path.write_text(json.dumps(topology, indent=2), encoding="utf-8")
    generated.append("viewer/topology-map.json")
    edges_path = viewer_directory / "edges.bin"
    edges_path.write_bytes(struct.pack(f"<{len(polyline_values)}f", *polyline_values))
    generated.append("viewer/edges.bin")
    glb_path = viewer_directory / "model.glb"
    _write_glb(glb_path, positions, indices)
    generated.append("viewer/model.glb")
    brep_path = viewer_directory / "model.brep"
    BRepTools.Write_s(solid.wrapped, str(brep_path))
    generated.append("viewer/model.brep")
    return DeriveResponse(
        generated=generated,
        face_count=len(faces),
        edge_count=len(edges),
        triangle_count=triangle_cursor,
    )


def _write_glb(path: Path, positions: list[float], indices: list[int]) -> None:
    import trimesh

    if not positions or not indices:
        raise CodePolicyError("Tessellation produced no GLB triangles")
    mesh = trimesh.Trimesh(
        vertices=np.asarray(positions, dtype=np.float32).reshape((-1, 3)),
        faces=np.asarray(indices, dtype=np.uint32).reshape((-1, 3)),
        process=False,
    )
    path.write_bytes(mesh.export(file_type="glb"))


def _tessellate_face(face: Any) -> tuple[list[tuple[float, float, float]], list[tuple[int, int, int]]]:
    from OCP.BRep import BRep_Tool
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.TopAbs import TopAbs_REVERSED
    from OCP.TopLoc import TopLoc_Location

    mesh = BRepMesh_IncrementalMesh(face, 0.15, False, 0.22, True)
    mesh.Perform()
    location = TopLoc_Location()
    triangulation = BRep_Tool.Triangulation_s(face, location)
    if triangulation is None:
        return [], []
    transform = location.Transformation()
    vertices = []
    for index in range(1, triangulation.NbNodes() + 1):
        point = triangulation.Node(index).Transformed(transform)
        vertices.append((float(point.X()), float(point.Y()), float(point.Z())))
    triangles = []
    reversed_face = face.Orientation() == TopAbs_REVERSED
    for index in range(1, triangulation.NbTriangles() + 1):
        a, b, c = triangulation.Triangle(index).Get()
        triangles.append((a - 1, c - 1, b - 1) if reversed_face else (a - 1, b - 1, c - 1))
    return vertices, triangles


def _curve_type(value: object) -> str:
    return str(value).replace("GeomAbs_CurveType.GeomAbs_", "").lower()


def _surface_type(value: object) -> str:
    return str(value).replace("GeomAbs_SurfaceType.GeomAbs_", "").lower()
