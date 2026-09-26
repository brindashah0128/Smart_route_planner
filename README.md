# Smart Route Planner — Run Locally

## Requirements

- Python 3.10 or newer
- Internet access for Leaflet, OpenStreetMap tiles, and Google Fonts

## Start the application

From this folder:

```bash
python -m pip install -r requirements.txt
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

To use another port:

```bash
PORT=8000 python app.py
```

The graph is stored in `data/graph.json`. Map edits are saved there automatically. Use
**Reset map** in the application to restore the original network.

## Main files

- `app.py` — Flask server, graph editing APIs, manual Dijkstra, and manual Kruskal
- `templates/index.html` — complete application layout
- `static/script.js` — Leaflet map, tabs, controls, and real algorithm animations
- `static/style.css` — application styling and responsive layout
- `static/favicon.svg` — application icon
- `data/graph.json` — current editable graph
- `requirements.txt` — Python dependency list

# Smart Route Planner

Smart Route Planner is an interactive Flask and Leaflet application for exploring
weighted road networks. It supports shortest-path routing with Dijkstra's
algorithm, minimum spanning tree construction with Kruskal's algorithm, live
graph editing, and step-by-step algorithm animations.

The project is designed as a practical algorithm visualization project:

- The browser displays the current road network on a Leaflet map.
- The Flask backend runs the actual graph algorithms.
- Algorithm steps are returned by the backend and replayed by the browser.
- Locations and roads are persisted in a JSON file.
- The same edited graph is used by both Dijkstra and Kruskal.

## Contents

- [Features](#features)
- [How the application works](#how-the-application-works)
- [Requirements](#requirements)
- [Clone and run](#clone-and-run)
- [Run commands](#run-commands)
- [Using the application](#using-the-application)
- [Dijkstra route planner](#dijkstra-route-planner)
- [Kruskal minimum spanning tree](#kruskal-minimum-spanning-tree)
- [Editing the network](#editing-the-network)
- [Data format](#data-format)
- [HTTP API](#http-api)
- [Project structure](#project-structure)
- [Responsive behavior](#responsive-behavior)
- [Troubleshooting](#troubleshooting)
- [Development checks](#development-checks)

## Features

### Route Planner tab

- Select a starting location and destination.
- Find the shortest route using Dijkstra's algorithm.
- Swap the starting point and destination.
- View the final route, total distance, number of path nodes, roads checked,
  and execution time.
- Play the real Dijkstra evaluation as an animation.
- Control animation speed: slow, normal, or fast.
- See visited nodes, inspected roads, and relaxed candidate paths.
- Clear the route result and return to the route form.

### Minimum Spanning Tree tab

- Run Kruskal's algorithm on every current location and road.
- Build the lowest-total-distance connected network.
- View total distance, location count, selected edges, examined edges, and
  execution time.
- View the selected MST edge list.
- Animate sorted edge checks, accepted edges, and rejected cycle edges.
- Control animation speed.
- Clear the MST result.
- Receive a disconnected-network error when a spanning tree cannot be formed.

### Network map

- View all locations and weighted roads on a Leaflet/OpenStreetMap map.
- Search for a location by name.
- Click a search result to center the map and highlight the location.
- Click a road to select it for editing.
- Add a location from latitude and longitude.
- Add a location by clicking directly on the map.
- Add, edit, and delete roads.
- Delete locations and their connected roads.
- Reset the entire graph to the default network.
- Use the application on desktop, tablet, and mobile screen sizes.

## How the application works

The application has three main parts:

1. **Flask backend**
   - Loads the current graph from `data/graph.json`.
   - Validates graph edits.
   - Runs Dijkstra and Kruskal.
   - Returns algorithm results and animation steps as JSON.
   - Saves successful edits back to the graph file.

2. **Leaflet map frontend**
   - Draws locations, roads, route lines, and MST edges.
   - Sends user actions to the Flask API using `fetch`.
   - Re-renders the map after graph changes.

3. **Animation layer**
   - Uses the `steps` returned by the backend.
   - Does not generate a fake route or traversal in the browser.
   - Displays the algorithm's actual decisions in order.

Roads are undirected. A road entered from Ahmedabad to Vadodara can be used in
both directions. Road distances must be positive.

## Requirements

- Python 3.10 or newer
- `pip`
- Internet access for:
  - Leaflet JavaScript and CSS
  - OpenStreetMap map tiles
  - Google Fonts

The project uses:

- Python
- Flask 3.1.3
- HTML
- CSS
- Vanilla JavaScript
- Leaflet.js
- OpenStreetMap tiles

## Clone and run

### 1. Clone the repository

From a terminal, run:

```bash
git clone https://github.com/USERNAME/REPOSITORY.git
```

Replace the URL with the actual Git repository URL.

Enter the cloned repository:

```bash
cd REPOSITORY
```

If this project is inside a larger workspace, enter the Smart Route Planner
directory:

```bash
cd artifacts/smart-route-planner
```

### 2. Install Python dependencies

From `artifacts/smart-route-planner/`:

```bash
python -m pip install -r requirements.txt
```

On systems where `python` points to Python 2, use:

```bash
python3 -m pip install -r requirements.txt
```

### 3. Start the application

```bash
python app.py
```

Open the application at:

```text
http://127.0.0.1:5000
```

Stop the server with `Ctrl+C`.

## Run commands

### Standalone Flask commands

Run from `artifacts/smart-route-planner/`:

```bash
python app.py
```

Use a different port:

```bash
PORT=8000 python app.py
```

Then open:

```text
http://127.0.0.1:8000
```

### Workspace command

From the repository root, if the workspace uses the configured package:

```bash
pnpm --filter @workspace/smart-route-planner run dev
```

The package's development script starts the Flask server:

```text
python app.py
```

## Using the application

### Find a route

1. Open the **Route Planner** tab.
2. Choose a location in **From**.
3. Choose a different location in **To**.
4. Select **Find shortest route**.
5. Review the route name and metrics.
6. Select **Show route animation** to replay the Dijkstra steps.

The application initially selects Ahmedabad as the source and Surat as the
destination when those locations exist.

### Swap route endpoints

Select the circular swap button between the two location fields. The source
and destination values are exchanged, and the map markers update.

### Search for a location

1. Type part of a location name in **Search a location**.
2. Select a result.
3. The map centers on the location and highlights it.

The search is case-insensitive and matches part of a location name.

### Run the MST operation

1. Select the **Minimum Spanning Tree** tab.
2. Select **Run Kruskal**.
3. Review the total distance and selected edge list.
4. Select **Show Kruskal animation** to replay the sorted edge decisions.

The MST operation uses all locations currently in the graph. It is not limited
to the two locations selected in the Route Planner tab.

### Change animation speed

When an animation is active or its options are visible, choose:

- **Slow** for a slower explanation
- **Normal** for the default speed
- **Fast** for a quick replay

Stopping an animation leaves the evaluated nodes and roads visible so the
algorithm's progress can still be inspected.

## Dijkstra route planner

The backend implementation is in `app.py` and uses a min-priority queue.

### Dijkstra process

1. Set the source distance to `0`.
2. Set every other location distance to infinity.
3. Add the source to the priority queue.
4. Remove the unvisited location with the smallest tentative distance.
5. Inspect each connected road.
6. Relax a neighbor when the newly calculated distance is smaller.
7. Continue until the destination is removed from the queue.
8. Follow the predecessor values backward to reconstruct the final path.

All road distances are positive, so once the destination is removed from the
priority queue, its shortest distance is final.

### Why the animation visits nodes outside the final route

Dijkstra must explore possible alternatives before it can prove that the final
route is shortest. Therefore, the animation shows both:

- The nodes that Dijkstra evaluates
- The final nodes that make up the selected route

For the default Ahmedabad-to-Surat route, the final route is:

```text
Ahmedabad → Anand → Vadodara → Bharuch → Surat
```

The algorithm may also visit Gandhinagar, Mehsana, Palanpur, Bhavnagar, and
Rajkot while comparing possible distances. Those locations are explored but
are not necessarily part of the final shortest path.

### Dijkstra result values

- **Distance**: total distance of the final path
- **Nodes**: number of locations in the final path
- **Roads checked**: number of adjacency edges inspected by the algorithm
- **Time**: backend execution time in milliseconds

## Kruskal minimum spanning tree

Kruskal's algorithm creates a minimum spanning tree by considering roads from
shortest to longest.

### Kruskal process

1. Sort all roads by distance.
2. Start with every location in its own set.
3. Check the next shortest road.
4. Accept it if it connects two different sets.
5. Reject it if both endpoints are already in the same set because it would
   create a cycle.
6. Join the two sets using Union-Find with path compression and rank.
7. Stop when the tree contains `V - 1` edges, where `V` is the number of
   locations.

For a connected graph with `V` locations, the resulting MST contains exactly
`V - 1` selected roads.

### Kruskal result values

- **Total distance**: sum of selected MST road distances
- **Locations**: number of locations in the current graph
- **Edges selected**: selected edges out of the required `V - 1`
- **Edges examined**: roads checked before completion
- **Execution time**: backend execution time in milliseconds

If the graph is disconnected, the backend returns an error instead of claiming
that a complete spanning tree exists.

## Editing the network

Open **Edit map** to access the network controls.

### Add a location with coordinates

1. Open **Edit map**.
2. In **Add location**, enter a name.
3. Enter a latitude between `-90` and `90`.
4. Enter a longitude between `-180` and `180`.
5. Select **Add location**.

Location names must be unique, ignoring letter case. The application generates
an internal ID from the name.

### Add a location on the map

1. Select **Add location on map**.
2. Click the desired point on the map.
3. Enter a name in the dialog.
4. Select **Add location**.

The clicked coordinates are filled automatically.

### Add a road

1. Open **Edit map**.
2. In **Add road**, choose the two endpoints.
3. Enter a positive distance in kilometers.
4. Select **Add road**.

The application prevents:

- Missing endpoints
- A road from a location to itself
- Non-positive distances
- Roads between nonexistent locations
- Duplicate roads between the same two locations

### Edit a road

1. Click a road on the map, or choose one in **Edit road**.
2. Enter a new positive distance.
3. Select **Save**.

Changing a road distance immediately affects future Dijkstra and Kruskal
operations.

### Delete a road

1. Select a road on the map or from the road selector.
2. Select **Delete this road**.

### Delete a location

1. Choose a location in **Delete location**.
2. Select the trash button.

The location and every road connected to it are removed automatically.

### Restore the default network

Select **Reset map** on the map or **Restore default network** in the editor.
This replaces the current graph with the original graph of 15 locations and
25 roads.

This operation removes all custom locations, roads, and distance changes.

## Data format

The current graph is stored in:

```text
data/graph.json
```

Its structure is:

```json
{
  "locations": [
    {
      "id": "ahmedabad",
      "name": "Ahmedabad",
      "lat": 23.0225,
      "lng": 72.5714
    }
  ],
  "roads": [
    {
      "id": "road-ahmedabad-gandhinagar",
      "from": "ahmedabad",
      "to": "gandhinagar",
      "distance": 30
    }
  ]
}
```

Each road's `from` and `to` values must match existing location IDs. The
frontend normally performs edits through the UI, which allows the backend to
validate the graph before saving it.

## HTTP API

All API responses use JSON. Successful mutations update
`data/graph.json`.

### Get the current graph

```http
GET /api/graph
```

Example:

```bash
curl http://127.0.0.1:5000/api/graph
```

Returns:

```json
{
  "locations": [],
  "roads": []
}
```

### Add a location

```http
POST /api/location
Content-Type: application/json
```

Request:

```json
{
  "name": "Gandhinagar",
  "lat": 23.2156,
  "lng": 72.6369
}
```

Returns the created location with HTTP `201`.

### Delete a location

```http
DELETE /api/location/<location_id>
```

Connected roads are deleted automatically.

### Add a road

```http
POST /api/road
Content-Type: application/json
```

Request:

```json
{
  "from": "ahmedabad",
  "to": "surat",
  "distance": 265
}
```

Returns the created road with HTTP `201`.

### Update a road

```http
PUT /api/road/<road_id>
Content-Type: application/json
```

Request:

```json
{
  "distance": 250
}
```

Returns the updated road.

### Delete a road

```http
DELETE /api/road/<road_id>
```

Returns:

```json
{
  "ok": true
}
```

### Find a shortest path

```http
POST /api/shortest-path
Content-Type: application/json
```

Request:

```json
{
  "source": "ahmedabad",
  "destination": "surat"
}
```

Successful responses include:

```json
{
  "found": true,
  "path": ["ahmedabad", "anand", "vadodara", "bharuch", "surat"],
  "path_names": ["Ahmedabad", "Anand", "Vadodara", "Bharuch", "Surat"],
  "distance": 240,
  "visited_nodes": 10,
  "visited_order": ["ahmedabad", "gandhinagar"],
  "edges_checked": 19,
  "execution_time_ms": 0.1,
  "steps": []
}
```

The complete response contains all step objects used by the route animation.

The endpoint returns HTTP `422` when no route exists between the selected
locations.

### Run Kruskal

```http
POST /api/mst/kruskal
```

No request body is required.

The response includes:

- `selected_edges`
- `rejected_edges`
- `mst_edges`
- `total_weight`
- `locations`
- `edges_examined`
- `execution_time`
- `execution_time_ms`
- `connected`
- `steps`

The endpoint returns HTTP `422` when the current network is disconnected.

### Reset the graph

```http
POST /api/reset
```

Returns the restored default graph.

### Error responses

Validation errors use a JSON body similar to:

```json
{
  "error": "Distance must be greater than zero."
}
```

Common status codes:

- `200`: successful read, update, algorithm, or reset
- `201`: location or road created
- `400`: invalid input
- `404`: location or road not found
- `422`: no route or disconnected graph

## Project structure

```text
smart-route-planner/
├── app.py                  # Flask server, persistence, API, Dijkstra, Kruskal
├── data/
│   └── graph.json          # Current editable graph
├── templates/
│   └── index.html          # Main page markup
├── static/
│   ├── script.js           # Map, API calls, editor, tabs, animations
│   ├── style.css           # Layout, styling, responsive behavior
│   └── favicon.svg         # Application icon
├── requirements.txt        # Python dependencies
├── package.json            # Workspace run scripts
├── RUN_LOCALLY.md          # Short local setup guide
└── README.md               # Full project documentation
```

## Responsive behavior

The interface adapts to:

- Desktop widths
- Medium tablet and laptop widths
- Mobile widths

On mobile:

- The algorithm tabs move into a second header row.
- The route and MST panels use the available map width.
- Map actions stack vertically.
- Expanded result panels scroll internally instead of extending below the
  viewport.

The route and MST panels use a viewport-aware maximum height. This keeps
animation controls and result content reachable even on short screens.

## Troubleshooting

### The map is blank

Check that the computer has internet access. The application loads Leaflet,
OpenStreetMap tiles, and Google Fonts from external services.

### The page does not load

Confirm that Flask is installed:

```bash
python -m pip install -r requirements.txt
```

Then start the server again:

```bash
python app.py
```

### The port is already in use

Start the application on another port:

```bash
PORT=8000 python app.py
```

### Changes are not visible

Refresh the browser. If the Flask workflow is already running and a template
was changed, restart the workflow or stop and start `python app.py` again.

### A route cannot be found

The graph may be disconnected. Check the visible road network or use
**Restore default network**.

### Kruskal reports a disconnected network

Every location must be connected to the same graph component for a spanning
tree to exist. Add roads connecting the isolated component, or reset the
network.

### A graph edit fails

Check the validation message. The most common causes are:

- Duplicate location name
- Duplicate road
- Missing road endpoint
- Invalid coordinates
- Non-positive road distance
- Attempting to connect a location to itself

## Development checks

Run the Python syntax check:

```bash
python -m py_compile app.py
```

Run the JavaScript syntax check from the repository root:

```bash
node --check artifacts/smart-route-planner/static/script.js
```

Check for whitespace errors from the repository root:

```bash
git diff --check
```

## License and map data

This project uses Leaflet for map rendering and OpenStreetMap tiles for map
data. Follow the attribution and usage requirements of those services when
deploying or redistributing the application.