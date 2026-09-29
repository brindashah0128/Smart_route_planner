from __future__ import annotations

import copy
import heapq
import json
import os
import re
import threading
import time
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request


BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = Path(os.environ.get("GRAPH_DATA_PATH", str(BASE_DIR / "data" / "graph.json")))
GRAPH_LOCK = threading.RLock()

app = Flask(__name__, template_folder="templates", static_folder="static")


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return cleaned or "location"


def default_graph() -> dict[str, list[dict[str, Any]]]:
    return {
        "locations": [
            {"id": "ahmedabad", "name": "Ahmedabad", "lat": 23.0225, "lng": 72.5714},
            {"id": "gandhinagar", "name": "Gandhinagar", "lat": 23.2156, "lng": 72.6369},
            {"id": "mehsana", "name": "Mehsana", "lat": 23.588, "lng": 72.3693},
            {"id": "palanpur", "name": "Palanpur", "lat": 24.1713, "lng": 72.4382},
            {"id": "vadodara", "name": "Vadodara", "lat": 22.3072, "lng": 73.1812},
            {"id": "anand", "name": "Anand", "lat": 22.5645, "lng": 72.9289},
            {"id": "bharuch", "name": "Bharuch", "lat": 21.7051, "lng": 72.9959},
            {"id": "surat", "name": "Surat", "lat": 21.1702, "lng": 72.8311},
            {"id": "navsari", "name": "Navsari", "lat": 20.9467, "lng": 72.952},
            {"id": "valsad", "name": "Valsad", "lat": 20.5992, "lng": 72.9342},
            {"id": "rajkot", "name": "Rajkot", "lat": 22.3039, "lng": 70.8022},
            {"id": "bhavnagar", "name": "Bhavnagar", "lat": 21.7645, "lng": 72.1519},
            {"id": "udaipur", "name": "Udaipur", "lat": 24.5854, "lng": 73.7125},
            {"id": "nashik", "name": "Nashik", "lat": 19.9975, "lng": 73.7898},
            {"id": "mumbai", "name": "Mumbai", "lat": 19.076, "lng": 72.8777},
        ],
        "roads": [
            {"id": "road-ahmedabad-gandhinagar", "from": "ahmedabad", "to": "gandhinagar", "distance": 30},
            {"id": "road-ahmedabad-mehsana", "from": "ahmedabad", "to": "mehsana", "distance": 75},
            {"id": "road-mehsana-palanpur", "from": "mehsana", "to": "palanpur", "distance": 130},
            {"id": "road-palanpur-udaipur", "from": "palanpur", "to": "udaipur", "distance": 260},
            {"id": "road-ahmedabad-palanpur", "from": "ahmedabad", "to": "palanpur", "distance": 125},
            {"id": "road-ahmedabad-vadodara", "from": "ahmedabad", "to": "vadodara", "distance": 115},
            {"id": "road-ahmedabad-anand", "from": "ahmedabad", "to": "anand", "distance": 45},
            {"id": "road-anand-vadodara", "from": "anand", "to": "vadodara", "distance": 45},
            {"id": "road-vadodara-bharuch", "from": "vadodara", "to": "bharuch", "distance": 75},
            {"id": "road-bharuch-surat", "from": "bharuch", "to": "surat", "distance": 75},
            {"id": "road-surat-navsari", "from": "surat", "to": "navsari", "distance": 35},
            {"id": "road-navsari-valsad", "from": "navsari", "to": "valsad", "distance": 65},
            {"id": "road-valsad-mumbai", "from": "valsad", "to": "mumbai", "distance": 185},
            {"id": "road-surat-mumbai", "from": "surat", "to": "mumbai", "distance": 280},
            {"id": "road-vadodara-rajkot", "from": "vadodara", "to": "rajkot", "distance": 220},
            {"id": "road-rajkot-bhavnagar", "from": "rajkot", "to": "bhavnagar", "distance": 170},
            {"id": "road-bhavnagar-ahmedabad", "from": "bhavnagar", "to": "ahmedabad", "distance": 180},
            {"id": "road-bhavnagar-vadodara", "from": "bhavnagar", "to": "vadodara", "distance": 170},
            {"id": "road-udaipur-ahmedabad", "from": "udaipur", "to": "ahmedabad", "distance": 260},
            {"id": "road-udaipur-rajkot", "from": "udaipur", "to": "rajkot", "distance": 390},
            {"id": "road-ahmedabad-rajkot", "from": "ahmedabad", "to": "rajkot", "distance": 215},
            {"id": "road-nashik-mumbai", "from": "nashik", "to": "mumbai", "distance": 165},
            {"id": "road-nashik-valsad", "from": "nashik", "to": "valsad", "distance": 175},
            {"id": "road-nashik-surat", "from": "nashik", "to": "surat", "distance": 250},
            {"id": "road-mumbai-bharuch", "from": "mumbai", "to": "bharuch", "distance": 365},
        ],
    }


def ensure_graph_file() -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not DATA_PATH.exists():
        save_graph(default_graph())


def load_graph() -> dict[str, list[dict[str, Any]]]:
    ensure_graph_file()
    with DATA_PATH.open("r", encoding="utf-8") as graph_file:
        return json.load(graph_file)


def save_graph(graph: dict[str, list[dict[str, Any]]]) -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = DATA_PATH.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as graph_file:
        json.dump(graph, graph_file, indent=2)
    temporary.replace(DATA_PATH)


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def as_positive_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def location_index(graph: dict[str, list[dict[str, Any]]]) -> dict[str, dict[str, Any]]:
    return {location["id"]: location for location in graph["locations"]}


def road_exists(graph: dict[str, list[dict[str, Any]]], source: str, destination: str) -> bool:
    return any(
        {road["from"], road["to"]} == {source, destination}
        for road in graph["roads"]
    )


def build_adjacency(graph: dict[str, list[dict[str, Any]]]) -> dict[str, list[tuple[str, float, str]]]:
    adjacency: dict[str, list[tuple[str, float, str]]] = {
        location["id"]: [] for location in graph["locations"]
    }
    for road in graph["roads"]:
        adjacency.setdefault(road["from"], []).append(
            (road["to"], float(road["distance"]), road["id"])
        )
        adjacency.setdefault(road["to"], []).append(
            (road["from"], float(road["distance"]), road["id"])
        )
    for neighbors in adjacency.values():
        neighbors.sort(key=lambda item: item[0])
    return adjacency


def run_dijkstra(graph: dict[str, list[dict[str, Any]]], source: str, destination: str) -> dict[str, Any]:
    started = time.perf_counter()
    adjacency = build_adjacency(graph)
    distances = {node: float("inf") for node in adjacency}
    previous: dict[str, str | None] = {node: None for node in adjacency}
    distances[source] = 0.0
    priority_queue: list[tuple[float, str]] = [(0.0, source)]
    visited: set[str] = set()
    visited_order: list[str] = []
    steps: list[dict[str, Any]] = [{"type": "start", "node": source}]
    edges_checked = 0

    while priority_queue:
        current_distance, current = heapq.heappop(priority_queue)
        if current in visited:
            continue
        visited.add(current)
        visited_order.append(current)
        steps.append({"type": "visit", "node": current, "distance": round(current_distance, 3)})
        if current == destination:
            break
        for neighbor, weight, road_id in adjacency.get(current, []):
            edges_checked += 1
            candidate_distance = current_distance + weight
            steps.append(
                {
                    "type": "inspect",
                    "node": current,
                    "neighbor": neighbor,
                    "road_id": road_id,
                    "distance": round(candidate_distance, 3),
                }
            )
            if neighbor not in visited and candidate_distance < distances[neighbor]:
                distances[neighbor] = candidate_distance
                previous[neighbor] = current
                heapq.heappush(priority_queue, (candidate_distance, neighbor))
                steps.append(
                    {
                        "type": "relax",
                        "node": current,
                        "neighbor": neighbor,
                        "road_id": road_id,
                        "distance": round(candidate_distance, 3),
                    }
                )

    if distances.get(destination, float("inf")) == float("inf"):
        return {
            "found": False,
            "visited_nodes": len(visited_order),
            "visited_order": visited_order,
            "edges_checked": edges_checked,
            "execution_time_ms": round((time.perf_counter() - started) * 1000, 3),
            "steps": steps,
        }

    path: list[str] = []
    cursor: str | None = destination
    while cursor is not None:
        path.append(cursor)
        cursor = previous[cursor]
    path.reverse()
    steps.append({"type": "complete", "path": path})
    return {
        "found": True,
        "path": path,
        "distance": round(distances[destination], 1),
        "visited_nodes": len(visited_order),
        "visited_order": visited_order,
        "edges_checked": edges_checked,
        "execution_time_ms": round((time.perf_counter() - started) * 1000, 3),
        "steps": steps,
    }


def run_kruskal(graph: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    started = time.perf_counter()
    locations = graph["locations"]
    parent = {location["id"]: location["id"] for location in locations}
    rank = {location["id"]: 0 for location in locations}
    sorted_roads = sorted(
        graph["roads"],
        key=lambda road: (float(road["distance"]), road["id"]),
    )
    selected_edges: list[dict[str, Any]] = []
    rejected_edges: list[dict[str, Any]] = []
    steps: list[dict[str, Any]] = []
    edges_examined = 0

    def find(node: str) -> str:
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    def union(first: str, second: str) -> bool:
        first_root = find(first)
        second_root = find(second)
        if first_root == second_root:
            return False
        if rank[first_root] < rank[second_root]:
            first_root, second_root = second_root, first_root
        parent[second_root] = first_root
        if rank[first_root] == rank[second_root]:
            rank[first_root] += 1
        return True

    for road in sorted_roads:
        edges_examined += 1
        source_root = find(road["from"])
        destination_root = find(road["to"])
        edge = {
            "id": road["id"],
            "from": road["from"],
            "to": road["to"],
            "distance": round(float(road["distance"]), 1),
        }
        steps.append(
            {
                "type": "check",
                "road_id": road["id"],
                "from": road["from"],
                "to": road["to"],
                "distance": edge["distance"],
                "from_root": source_root,
                "to_root": destination_root,
            }
        )
        if union(road["from"], road["to"]):
            selected_edges.append(edge)
            steps.append(
                {
                    "type": "accept",
                    "road_id": road["id"],
                    "from": road["from"],
                    "to": road["to"],
                    "distance": edge["distance"],
                    "selected_count": len(selected_edges),
                }
            )
        else:
            rejected_edges.append(edge)
            steps.append(
                {
                    "type": "reject",
                    "road_id": road["id"],
                    "from": road["from"],
                    "to": road["to"],
                    "distance": edge["distance"],
                    "reason": "cycle",
                    "selected_count": len(selected_edges),
                }
            )
        if len(selected_edges) == max(0, len(locations) - 1):
            break

    total_weight = round(sum(edge["distance"] for edge in selected_edges), 1)
    connected = len(selected_edges) == max(0, len(locations) - 1)
    steps.append(
        {
            "type": "complete",
            "selected_count": len(selected_edges),
            "connected": connected,
        }
    )
    execution_time = round((time.perf_counter() - started) * 1000, 3)
    return {
        "mst_edges": selected_edges,
        "selected_edges": selected_edges,
        "rejected_edges": rejected_edges,
        "total_weight": total_weight,
        "locations": len(locations),
        "edges_examined": edges_examined,
        "execution_time": execution_time,
        "execution_time_ms": execution_time,
        "connected": connected,
        "steps": steps,
    }


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/graph")
def get_graph():
    with GRAPH_LOCK:
        graph = load_graph()
    return jsonify(graph)


@app.post("/api/location")
def add_location():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    if not name:
        return error("Location name is required.")
    try:
        latitude = float(payload.get("lat"))
        longitude = float(payload.get("lng"))
    except (TypeError, ValueError):
        return error("Latitude and longitude must be valid numbers.")
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        return error("Coordinates are outside the valid range.")

    with GRAPH_LOCK:
        graph = load_graph()
        if any(location["name"].casefold() == name.casefold() for location in graph["locations"]):
            return error("A location with that name already exists.")
        base_id = slugify(name)
        new_id = base_id
        suffix = 2
        existing_ids = {location["id"] for location in graph["locations"]}
        while new_id in existing_ids:
            new_id = f"{base_id}-{suffix}"
            suffix += 1
        location = {"id": new_id, "name": name, "lat": latitude, "lng": longitude}
        graph["locations"].append(location)
        save_graph(graph)
    return jsonify(location), 201


@app.delete("/api/location/<location_id>")
def delete_location(location_id: str):
    with GRAPH_LOCK:
        graph = load_graph()
        if not any(location["id"] == location_id for location in graph["locations"]):
            return error("Location not found.", 404)
        graph["locations"] = [
            location for location in graph["locations"] if location["id"] != location_id
        ]
        graph["roads"] = [
            road
            for road in graph["roads"]
            if road["from"] != location_id and road["to"] != location_id
        ]
        save_graph(graph)
    return jsonify({"ok": True})


@app.post("/api/road")
def add_road():
    payload = request.get_json(silent=True) or {}
    source = str(payload.get("from", "")).strip()
    destination = str(payload.get("to", "")).strip()
    distance = as_positive_number(payload.get("distance"))
    if not source or not destination:
        return error("Both road endpoints are required.")
    if source == destination:
        return error("A road needs two different locations.")
    if distance is None:
        return error("Distance must be greater than zero.")

    with GRAPH_LOCK:
        graph = load_graph()
        ids = {location["id"] for location in graph["locations"]}
        if source not in ids or destination not in ids:
            return error("Both road endpoints must be existing locations.")
        if road_exists(graph, source, destination):
            return error("A road between these locations already exists.")
        road_id = f"road-{source}-{destination}"
        existing_ids = {road["id"] for road in graph["roads"]}
        suffix = 2
        unique_id = road_id
        while unique_id in existing_ids:
            unique_id = f"{road_id}-{suffix}"
            suffix += 1
        road = {
            "id": unique_id,
            "from": source,
            "to": destination,
            "distance": round(distance, 1),
        }
        graph["roads"].append(road)
        save_graph(graph)
    return jsonify(road), 201


@app.put("/api/road/<road_id>")
def update_road(road_id: str):
    payload = request.get_json(silent=True) or {}
    distance = as_positive_number(payload.get("distance"))
    if distance is None:
        return error("Distance must be greater than zero.")
    with GRAPH_LOCK:
        graph = load_graph()
        road = next((item for item in graph["roads"] if item["id"] == road_id), None)
        if road is None:
            return error("Road not found.", 404)
        road["distance"] = round(distance, 1)
        save_graph(graph)
    return jsonify(road)


@app.delete("/api/road/<road_id>")
def delete_road(road_id: str):
    with GRAPH_LOCK:
        graph = load_graph()
        original_count = len(graph["roads"])
        graph["roads"] = [road for road in graph["roads"] if road["id"] != road_id]
        if len(graph["roads"]) == original_count:
            return error("Road not found.", 404)
        save_graph(graph)
    return jsonify({"ok": True})


@app.post("/api/shortest-path")
def shortest_path():
    payload = request.get_json(silent=True) or {}
    source = str(payload.get("source", "")).strip()
    destination = str(payload.get("destination", "")).strip()
    if not source or not destination:
        return error("Choose both a source and a destination.")
    if source == destination:
        return error("Source and destination must be different.")
    with GRAPH_LOCK:
        graph = load_graph()
    ids = {location["id"] for location in graph["locations"]}
    if source not in ids or destination not in ids:
        return error("Source or destination is not in the current map.")
    result = run_dijkstra(graph, source, destination)
    if not result["found"]:
        return jsonify({"error": "No route exists between those locations.", **result}), 422
    names = location_index(graph)
    result["path_names"] = [names[location_id]["name"] for location_id in result["path"]]
    return jsonify(result)


@app.post("/api/mst/kruskal")
def minimum_spanning_tree():
    with GRAPH_LOCK:
        graph = load_graph()
    result = run_kruskal(graph)
    if not result["connected"]:
        return jsonify({"error": "The current network is disconnected.", **result}), 422
    return jsonify(result)


@app.post("/api/reset")
def reset_graph():
    with GRAPH_LOCK:
        graph = copy.deepcopy(default_graph())
        save_graph(graph)
    return jsonify(graph)


if __name__ == "__main__":
    ensure_graph_file()
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "5000")),
        debug=False,
    )