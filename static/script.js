/* global L */

const state = {
  graph: { locations: [], roads: [] },
  map: null,
  roadLayer: null,
  markerLayer: null,
  routeLayer: null,
  animationLayer: null,
  visitedLayer: null,
  mstLayer: null,
  mstAnimationLayer: null,
  mstCurrentLayer: null,
  mstRejectedLayer: null,
  roadLayers: new Map(),
  markerLayers: new Map(),
  lastResult: null,
  lastMstResult: null,
  selectedRoadId: "",
  addOnMapMode: false,
  pendingMapPoint: null,
  searchLocationId: "",
  animationToken: 0,
  animationSpeed: "normal",
  animationPlaying: false,
  animationStepIndex: 0,
  mstAnimationToken: 0,
  mstAnimationSpeed: "normal",
  mstAnimationPlaying: false,
  mstAnimationStepIndex: 0,
  activeMode: "route",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  source: $("#source-select"),
  destination: $("#destination-select"),
  roadFrom: $("#road-from"),
  roadTo: $("#road-to"),
  deleteLocation: $("#delete-location-select"),
  roadPicker: $("#road-picker"),
  roadEditControls: $("#road-edit-controls"),
  selectedRoadName: $("#selected-road-name"),
  editRoadDistance: $("#edit-road-distance"),
  routeResult: $("#route-result"),
  routeName: $("#route-name"),
  routeDistance: $("#route-distance"),
  routeNodes: $("#route-nodes"),
  routeEdges: $("#route-edges"),
  routeTime: $("#route-time"),
  routeTab: $("#route-tab"),
  mstTab: $("#mst-tab"),
  routePanel: $(".route-planner-panel"),
  mstPanel: $("#mst-panel"),
  mstResult: $("#mst-result"),
  mstDistance: $("#mst-distance"),
  mstLocations: $("#mst-locations"),
  mstSelected: $("#mst-selected"),
  mstExamined: $("#mst-examined"),
  mstTime: $("#mst-time"),
  mstEdgeList: $("#mst-edge-list"),
  drawer: $("#edit-drawer"),
  backdrop: $("#drawer-backdrop"),
  mapHint: $("#map-hint"),
  mapModal: $("#map-modal"),
};

function locationById(id) {
  return state.graph.locations.find((location) => location.id === id);
}

function locationName(id) {
  return locationById(id)?.name || id;
}

function roadById(id) {
  return state.graph.roads.find((road) => road.id === id);
}

function roadEndpoints(road) {
  return [locationById(road.from), locationById(road.to)].filter(Boolean);
}

function iconForLocation(locationId, type = "") {
  const className = `custom-marker ${type}`.trim();
  return L.divIcon({
    className: "marker-shell",
    html: `<div class="${className}"><span></span></div>`,
    iconSize: [19, 19],
    iconAnchor: [9, 19],
    tooltipAnchor: [7, -13],
  });
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i></i><span>${message}</span>`;
  $("#toast-region").append(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Something went wrong.");
    error.payload = payload;
    throw error;
  }
  return payload;
}

function selectOptions(select, placeholder, locations, selectedValue = "") {
  select.innerHTML = "";
  const initial = document.createElement("option");
  initial.value = "";
  initial.textContent = placeholder;
  select.append(initial);
  locations.forEach((location) => {
    const option = document.createElement("option");
    option.value = location.id;
    option.textContent = location.name;
    option.selected = location.id === selectedValue;
    select.append(option);
  });
}

function renderEditorOptions(previous = {}) {
  const locations = [...state.graph.locations].sort((a, b) => a.name.localeCompare(b.name));
  selectOptions(els.roadFrom, "Select starting point", locations, previous.roadFrom);
  selectOptions(els.roadTo, "Select destination", locations, previous.roadTo);
  selectOptions(els.deleteLocation, "Select a location", locations, previous.deleteLocation);

  els.roadPicker.innerHTML = '<option value="">Select a road</option>';
  state.graph.roads.forEach((road) => {
    const option = document.createElement("option");
    option.value = road.id;
    option.textContent = `${locationName(road.from)} → ${locationName(road.to)} · ${formatDistance(road.distance)}`;
    option.selected = road.id === (previous.roadPicker || state.selectedRoadId);
    els.roadPicker.append(option);
  });
}

function renderRouteOptions(previousSource = "", previousDestination = "") {
  const locations = [...state.graph.locations].sort((a, b) => a.name.localeCompare(b.name));
  const source = locationById(previousSource) ? previousSource : (locationById("ahmedabad") ? "ahmedabad" : locations[0]?.id || "");
  const destination = locationById(previousDestination)
    ? previousDestination
    : (locationById("surat") ? "surat" : locations.find((location) => location.id !== source)?.id || "");
  selectOptions(els.source, "Select starting point", locations, source);
  selectOptions(els.destination, "Select destination", locations, destination);
}

function formatDistance(distance) {
  const number = Number(distance);
  return Number.isInteger(number) ? `${number} km` : `${number.toFixed(1)} km`;
}

function clearMapOverlays() {
  state.routeLayer?.clearLayers();
  state.animationLayer?.clearLayers();
  state.visitedLayer?.clearLayers();
}

function clearMstOverlays() {
  state.mstLayer?.clearLayers();
  state.mstAnimationLayer?.clearLayers();
  state.mstCurrentLayer?.clearLayers();
  state.mstRejectedLayer?.clearLayers();
}

function clearRouteResult() {
  cancelAnimation({ hideStatus: true });
  state.lastResult = null;
  clearMapOverlays();
  els.routeResult.hidden = true;
  $$(".custom-marker").forEach((marker) => marker.classList.remove("destination"));
  refreshMarkerIcons();
}

function clearMstResult() {
  cancelMstAnimation({ hideStatus: true });
  state.lastMstResult = null;
  clearMstOverlays();
  els.mstResult.hidden = true;
  $("#mst-animation-options").hidden = true;
  $("#mst-legend").hidden = true;
}

function drawRoads() {
  state.roadLayer.clearLayers();
  state.roadLayers.clear();
  state.graph.roads.forEach((road) => {
    const endpoints = roadEndpoints(road);
    if (endpoints.length !== 2) return;
    const line = L.polyline(
      endpoints.map((location) => [location.lat, location.lng]),
      { color: "#7f929c", weight: 2.2, opacity: 0.72, lineCap: "round" },
    );
    line.bindTooltip(formatDistance(road.distance), {
      permanent: true,
      direction: "center",
      className: "road-label",
      offset: [0, 0],
    });
    line.on("click", () => {
      state.selectedRoadId = road.id;
      openDrawer();
      selectRoad(road.id);
    });
    line.addTo(state.roadLayer);
    state.roadLayers.set(road.id, line);
  });
}

function refreshMarkerIcons() {
  const routeIds = new Set(state.lastResult?.path || []);
  state.graph.locations.forEach((location) => {
    const marker = state.markerLayers.get(location.id);
    if (!marker) return;
    let markerType = "";
    if (location.id === els.destination.value) markerType = "destination";
    if (location.id === state.searchLocationId) markerType = "searched";
    marker.setIcon(iconForLocation(location.id, markerType));
    marker.setZIndexOffset(routeIds.has(location.id) ? 400 : 0);
  });
}

function drawMarkers() {
  state.markerLayer.clearLayers();
  state.markerLayers.clear();
  state.graph.locations.forEach((location) => {
    const marker = L.marker([location.lat, location.lng], {
      icon: iconForLocation(location.id),
      title: location.name,
    });
    marker.bindTooltip(location.name, { direction: "right", className: "marker-label", offset: [5, 0] });
    marker.on("click", () => {
      state.map.setView([location.lat, location.lng], Math.max(state.map.getZoom(), 8), { animate: true });
      const sourceOrDestination = location.id === els.source.value || location.id === els.destination.value;
      if (!sourceOrDestination) {
        $("#location-search").value = location.name;
        state.searchLocationId = location.id;
        showSearchResults([location]);
        refreshMarkerIcons();
      }
    });
    marker.addTo(state.markerLayer);
    state.markerLayers.set(location.id, marker);
  });
  refreshMarkerIcons();
}

function renderGraph(previous = {}) {
  const source = previous.source ?? els.source.value;
  const destination = previous.destination ?? els.destination.value;
  renderRouteOptions(source, destination);
  renderEditorOptions(previous);
  drawRoads();
  drawMarkers();
  state.map.invalidateSize();
}

function roadCoordinates(roadId) {
  const road = roadById(roadId);
  if (!road) return null;
  const endpoints = roadEndpoints(road);
  return endpoints.length === 2 ? endpoints.map((location) => [location.lat, location.lng]) : null;
}

function drawFinalRoute(result) {
  state.routeLayer.clearLayers();
  if (!result?.path?.length) return;
  const points = result.path.map((id) => locationById(id)).filter(Boolean).map((location) => [location.lat, location.lng]);
  if (points.length < 2) return;
  L.polyline(points, { color: "#ffffff", weight: 9, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(state.routeLayer);
  L.polyline(points, { color: "#1f6f8b", weight: 5, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(state.routeLayer);
  state.map.fitBounds(points, { paddingTopLeft: [405, 90], paddingBottomRight: [70, 80], maxZoom: 9, animate: true });
  refreshMarkerIcons();
}

function drawMstEdge(roadId, style, layer) {
  const points = roadCoordinates(roadId);
  if (!points) return;
  L.polyline(points, style).addTo(layer);
}

function drawFinalMst(result) {
  state.mstLayer.clearLayers();
  state.mstAnimationLayer.clearLayers();
  state.mstCurrentLayer.clearLayers();
  state.mstRejectedLayer.clearLayers();
  if (!result?.selected_edges?.length) return;
  result.selected_edges.forEach((edge) => {
    drawMstEdge(edge.id, {
      color: "#ffffff",
      weight: 9,
      opacity: 0.96,
      lineCap: "round",
      lineJoin: "round",
    }, state.mstLayer);
    drawMstEdge(edge.id, {
      color: "#2d8a68",
      weight: 5,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
      className: "mst-selected-edge",
    }, state.mstLayer);
  });
}

function updateModeLegend() {
  $("#mst-legend").hidden = state.activeMode !== "mst";
  $(".route-line").parentElement.lastChild.textContent = state.activeMode === "mst" ? "Network edge" : "Selected route";
}

function activateMode(mode) {
  state.activeMode = mode;
  const isMst = mode === "mst";
  els.routeTab.classList.toggle("active", !isMst);
  els.mstTab.classList.toggle("active", isMst);
  els.routePanel.hidden = isMst;
  els.mstPanel.hidden = !isMst;
  if (isMst) {
    cancelAnimation({ hideStatus: true });
    clearMapOverlays();
    if (state.lastMstResult) {
      drawFinalMst(state.lastMstResult);
    }
  } else {
    cancelMstAnimation({ hideStatus: true });
    clearMstOverlays();
    if (state.lastResult) {
      drawFinalRoute(state.lastResult);
    }
  }
  updateModeLegend();
  window.setTimeout(() => state.map.invalidateSize(), 180);
}

function showMstResult(result) {
  cancelMstAnimation({ hideStatus: true });
  state.lastMstResult = result;
  els.mstResult.hidden = false;
  els.mstDistance.textContent = formatDistance(result.total_weight);
  els.mstLocations.textContent = result.locations;
  els.mstSelected.textContent = `${result.selected_edges.length} / ${Math.max(0, result.locations - 1)}`;
  els.mstExamined.textContent = result.edges_examined;
  els.mstTime.textContent = `${Number(result.execution_time).toFixed(2)} ms`;
  els.mstEdgeList.innerHTML = result.selected_edges.map((edge) => (
    `<div class="mst-edge-item"><span>${locationName(edge.from)} → ${locationName(edge.to)}</span><strong>${formatDistance(edge.distance)}</strong></div>`
  )).join("");
  $("#mst-legend").hidden = false;
  drawFinalMst(result);
}

function showRouteResult(result) {
  cancelAnimation({ hideStatus: true });
  state.lastResult = result;
  els.routeResult.hidden = false;
  els.routeName.innerHTML = result.path_names.map((name, index) => `${index ? '<span class="arrow">→</span>' : ""}${name}`).join("");
  els.routeDistance.textContent = formatDistance(result.distance);
  els.routeNodes.textContent = result.path.length;
  els.routeEdges.textContent = result.edges_checked;
  els.routeTime.textContent = `${result.execution_time_ms.toFixed(1)} ms`;
  $("#animation-options").hidden = true;
  $("#animation-status").hidden = true;
  setAnimationButton(false);
  drawFinalRoute(result);
}

async function findRoute(event) {
  event.preventDefault();
  if (!els.source.value || !els.destination.value) {
    showToast("Choose both a starting point and destination.", "error");
    return;
  }
  if (els.source.value === els.destination.value) {
    showToast("Source and destination must be different.", "error");
    return;
  }
  cancelAnimation({ hideStatus: true });
  clearMapOverlays();
  try {
    const result = await api("/api/shortest-path", {
      method: "POST",
      body: JSON.stringify({ source: els.source.value, destination: els.destination.value }),
    });
    showRouteResult(result);
  } catch (error) {
    clearRouteResult();
    showToast(error.message, "error");
  }
}

function selectRoad(roadId) {
  state.selectedRoadId = roadId;
  els.roadPicker.value = roadId;
  const road = roadById(roadId);
  if (!road) {
    els.roadEditControls.hidden = true;
    return;
  }
  els.roadEditControls.hidden = false;
  els.selectedRoadName.textContent = `${locationName(road.from)} → ${locationName(road.to)}`;
  els.editRoadDistance.value = road.distance;
  const line = state.roadLayers.get(road.id);
  if (line) {
    line.setStyle({ color: "#1f6f8b", weight: 4, opacity: 1 });
    window.setTimeout(() => {
      if (state.roadLayers.get(road.id) === line && state.selectedRoadId === road.id) {
        line.setStyle({ color: "#1f6f8b", weight: 4, opacity: 1 });
      }
    }, 500);
  }
}

async function addLocation(event, fromMap = false) {
  event.preventDefault();
  const name = fromMap ? $("#map-location-name").value.trim() : $("#location-name").value.trim();
  const latitude = fromMap ? state.pendingMapPoint.lat : Number($("#location-lat").value);
  const longitude = fromMap ? state.pendingMapPoint.lng : Number($("#location-lng").value);
  try {
    await api("/api/location", {
      method: "POST",
      body: JSON.stringify({ name, lat: latitude, lng: longitude }),
    });
    const source = els.source.value;
    const destination = els.destination.value;
    await loadGraph({ source, destination });
    if (fromMap) {
      closeMapModal();
      $("#map-location-name").value = "";
    } else {
      $("#location-form").reset();
    }
    showToast(`${name} was added to the network.`);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function addRoad(event) {
  event.preventDefault();
  try {
    await api("/api/road", {
      method: "POST",
      body: JSON.stringify({
        from: els.roadFrom.value,
        to: els.roadTo.value,
        distance: Number($("#road-distance").value),
      }),
    });
    const source = els.source.value;
    const destination = els.destination.value;
    await loadGraph({ source, destination });
    $("#road-form").reset();
    showToast("Road added to the live network.");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function saveRoad() {
  if (!state.selectedRoadId) {
    showToast("Select a road to edit.", "error");
    return;
  }
  try {
    await api(`/api/road/${state.selectedRoadId}`, {
      method: "PUT",
      body: JSON.stringify({ distance: Number(els.editRoadDistance.value) }),
    });
    const source = els.source.value;
    const destination = els.destination.value;
    await loadGraph({ source, destination });
    clearRouteResult();
    showToast("Road distance updated.");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function deleteRoad() {
  if (!state.selectedRoadId) return;
  const road = roadById(state.selectedRoadId);
  try {
    await api(`/api/road/${state.selectedRoadId}`, { method: "DELETE" });
    state.selectedRoadId = "";
    await loadGraph({ source: els.source.value, destination: els.destination.value });
    clearRouteResult();
    showToast(`${locationName(road?.from)} → ${locationName(road?.to)} was removed.`);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function deleteLocation() {
  const locationId = els.deleteLocation.value;
  if (!locationId) {
    showToast("Select a location to delete.", "error");
    return;
  }
  const name = locationName(locationId);
  try {
    await api(`/api/location/${locationId}`, { method: "DELETE" });
    await loadGraph({ source: els.source.value, destination: els.destination.value });
    clearRouteResult();
    showToast(`${name} and its connected roads were removed.`);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function resetGraph() {
  try {
    await api("/api/reset", { method: "POST", body: JSON.stringify({}) });
    state.selectedRoadId = "";
    await loadGraph({ source: "ahmedabad", destination: "surat" });
    closeDrawer();
    clearRouteResult();
    showToast("The default road network has been restored.");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function loadGraph(previous = {}) {
  try {
    state.graph = await api("/api/graph");
    clearMstResult();
    renderGraph(previous);
    $("#status-text").textContent = `${state.graph.locations.length} locations live`;
  } catch (error) {
    $("#status-text").textContent = "Network unavailable";
    showToast("Could not load the current road network.", "error");
  }
}

function openDrawer() {
  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
  els.backdrop.hidden = false;
  window.setTimeout(() => state.map.invalidateSize(), 260);
}

function closeDrawer() {
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
  els.backdrop.hidden = true;
}

function showSearchResults(locations) {
  const results = $("#search-results");
  results.innerHTML = "";
  if (!locations.length) {
    results.innerHTML = '<div class="search-result"><span>No matching locations</span></div>';
  } else {
    locations.slice(0, 5).forEach((location) => {
      const item = document.createElement("button");
      item.className = "search-result";
      item.type = "button";
      item.innerHTML = `<span>${location.name}</span><small>${location.lat.toFixed(2)}, ${location.lng.toFixed(2)}</small>`;
      item.addEventListener("click", () => {
        state.searchLocationId = location.id;
        state.map.setView([location.lat, location.lng], 9, { animate: true });
        refreshMarkerIcons();
        results.classList.remove("visible");
      });
      results.append(item);
    });
  }
  results.classList.add("visible");
}

function searchLocations(value) {
  const query = value.trim().toLowerCase();
  if (!query) {
    state.searchLocationId = "";
    $("#search-results").classList.remove("visible");
    refreshMarkerIcons();
    return;
  }
  showSearchResults(state.graph.locations.filter((location) => location.name.toLowerCase().includes(query)));
}

function openMapModal(latlng) {
  state.pendingMapPoint = { lat: Number(latlng.lat.toFixed(6)), lng: Number(latlng.lng.toFixed(6)) };
  $("#map-coordinates").textContent = `${state.pendingMapPoint.lat.toFixed(4)}° N, ${state.pendingMapPoint.lng.toFixed(4)}° E`;
  els.mapModal.hidden = false;
  window.setTimeout(() => $("#map-location-name").focus(), 0);
}

function closeMapModal() {
  els.mapModal.hidden = true;
  state.pendingMapPoint = null;
}

function setMapMode(enabled) {
  state.addOnMapMode = enabled;
  els.mapHint.hidden = !enabled;
  $("#add-on-map-button").classList.toggle("active", enabled);
  $("#map").classList.toggle("crosshair-map", enabled);
  if (!enabled) closeMapModal();
}

function sleep(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function setAnimationButton(playing) {
  const button = $("#animate-route");
  const label = $("#animation-button-label");
  const icon = $("#animation-button-icon");
  button.classList.toggle("is-playing", playing);
  label.textContent = playing
    ? "Stop animation"
    : (state.animationStepIndex > 0 ? "Replay route animation" : "Show route animation");
  icon.innerHTML = playing
    ? '<path d="M7 7h10v10H7z"/>'
    : '<path d="m8 5 11 7-11 7Z"/>';
}

function updateAnimationStatus(stepIndex, stepCount, message, title = "Dijkstra is evaluating") {
  const status = $("#animation-status");
  status.hidden = false;
  status.dataset.state = state.animationPlaying ? "playing" : "stopped";
  $("#animation-status-title").textContent = title;
  $("#animation-step-count").textContent = `${Math.min(stepIndex + 1, stepCount)} / ${stepCount}`;
  $("#animation-progress-bar").style.width = `${Math.min(100, ((stepIndex + 1) / stepCount) * 100)}%`;
  $("#animation-current-step").textContent = message;
}

function cancelAnimation({ hideStatus = false } = {}) {
  state.animationToken += 1;
  state.animationPlaying = false;
  if (hideStatus) {
    state.animationStepIndex = 0;
    $("#animation-status").hidden = true;
    $("#animation-options").hidden = true;
  } else if (state.lastResult?.steps?.length) {
    updateAnimationStatus(
      state.animationStepIndex,
      state.lastResult.steps.length,
      "Stopped here. Visited nodes and evaluated roads remain visible.",
      "Animation stopped",
    );
  }
  setAnimationButton(false);
}

function animationMessage(step) {
  if (step.type === "start") return `Starting at ${locationName(step.node)}.`;
  if (step.type === "visit") return `Visiting ${locationName(step.node)} at ${formatDistance(step.distance)} from source.`;
  if (step.type === "inspect") return `Checking ${locationName(step.node)} → ${locationName(step.neighbor)} · candidate ${formatDistance(step.distance)}.`;
  if (step.type === "relax") return `Updated best path to ${locationName(step.neighbor)} · ${formatDistance(step.distance)}.`;
  if (step.type === "complete") return "Destination reached. Drawing the final shortest route.";
  return "Evaluating the current priority queue.";
}

async function animateRoute() {
  if (!state.lastResult?.steps?.length) return;
  state.animationToken += 1;
  const token = state.animationToken;
  const delay = { slow: 600, normal: 220, fast: 80 }[state.animationSpeed];
  const steps = state.lastResult.steps;
  state.animationPlaying = true;
  state.animationStepIndex = 0;
  $("#animation-options").hidden = false;
  setAnimationButton(true);
  state.animationLayer.clearLayers();
  state.visitedLayer.clearLayers();
  state.routeLayer.clearLayers();
  for (let index = 0; index < steps.length; index += 1) {
    if (token !== state.animationToken) return;
    const step = steps[index];
    state.animationStepIndex = index;
    updateAnimationStatus(index, steps.length, animationMessage(step));
    if (step.type === "visit") {
      const location = locationById(step.node);
      if (location) {
        L.circleMarker([location.lat, location.lng], {
          radius: 8,
          color: "#1f6f8b",
          weight: 3,
          fillColor: "#d9eef2",
          fillOpacity: 0.98,
        }).bindTooltip(`Visited · ${formatDistance(step.distance)}`, { className: "route-tooltip", direction: "top" }).addTo(state.visitedLayer);
      }
    }
    if ((step.type === "inspect" || step.type === "relax") && step.road_id) {
      const points = roadCoordinates(step.road_id);
      if (points) {
        L.polyline(points, {
          color: step.type === "relax" ? "#2d8a68" : "#d99a3e",
          weight: step.type === "relax" ? 5 : 4,
          opacity: 0.95,
          dashArray: step.type === "relax" ? "1 5" : "8 6",
          className: "animation-road",
        }).addTo(state.animationLayer);
      }
    }
    await sleep(step.type === "inspect" ? Math.max(45, delay * 0.75) : delay);
  }
  if (token !== state.animationToken) return;
  state.animationPlaying = false;
  updateAnimationStatus(steps.length - 1, steps.length, "Final route highlighted in blue.", "Dijkstra complete");
  drawFinalRoute(state.lastResult);
  setAnimationButton(false);
}

function setMstAnimationButton(playing) {
  const button = $("#animate-mst");
  const label = $("#mst-animation-button-label");
  const icon = $("#mst-animation-button-icon");
  button.classList.toggle("is-playing", playing);
  label.textContent = playing
    ? "Stop animation"
    : (state.mstAnimationStepIndex > 0 ? "Replay Kruskal animation" : "Show Kruskal animation");
  icon.innerHTML = playing
    ? '<path d="M7 7h10v10H7z"/>'
    : '<path d="m8 5 11 7-11 7Z"/>';
}

function updateMstStatus(stepIndex, stepCount, message, title = "Kruskal is evaluating") {
  const status = $("#mst-status");
  status.hidden = false;
  status.dataset.state = state.mstAnimationPlaying ? "playing" : "stopped";
  $("#mst-status-title").textContent = title;
  $("#mst-step-count").textContent = `${Math.min(stepIndex + 1, stepCount)} / ${stepCount}`;
  $("#mst-progress-bar").style.width = `${Math.min(100, ((stepIndex + 1) / stepCount) * 100)}%`;
  $("#mst-current-step").textContent = message;
}

function cancelMstAnimation({ hideStatus = false } = {}) {
  state.mstAnimationToken += 1;
  state.mstAnimationPlaying = false;
  if (hideStatus) {
    state.mstAnimationStepIndex = 0;
    $("#mst-status").hidden = true;
    $("#mst-animation-options").hidden = true;
  } else if (state.lastMstResult?.steps?.length) {
    updateMstStatus(
      state.mstAnimationStepIndex,
      state.lastMstResult.steps.length,
      "Stopped here. Accepted and rejected edges remain visible.",
      "Animation stopped",
    );
  }
  setMstAnimationButton(false);
}

function mstAnimationMessage(step) {
  if (step.type === "check") return `Checking ${locationName(step.from)} → ${locationName(step.to)} · ${formatDistance(step.distance)}.`;
  if (step.type === "accept") return `Accepted ${locationName(step.from)} → ${locationName(step.to)} into the MST.`;
  if (step.type === "reject") return `Rejected ${locationName(step.from)} → ${locationName(step.to)} because it creates a cycle.`;
  return "MST complete. Selected edges form the minimum spanning tree.";
}

async function animateMst() {
  if (!state.lastMstResult?.steps?.length) return;
  state.mstAnimationToken += 1;
  const token = state.mstAnimationToken;
  const delay = { slow: 620, normal: 280, fast: 105 }[state.mstAnimationSpeed];
  const steps = state.lastMstResult.steps;
  state.mstAnimationPlaying = true;
  state.mstAnimationStepIndex = 0;
  $("#mst-animation-options").hidden = false;
  setMstAnimationButton(true);
  state.mstLayer.clearLayers();
  state.mstAnimationLayer.clearLayers();
  state.mstCurrentLayer.clearLayers();
  state.mstRejectedLayer.clearLayers();

  for (let index = 0; index < steps.length; index += 1) {
    if (token !== state.mstAnimationToken) return;
    const step = steps[index];
    state.mstAnimationStepIndex = index;
    updateMstStatus(index, steps.length, mstAnimationMessage(step));
    if (step.type === "check") {
      state.mstCurrentLayer.clearLayers();
      drawMstEdge(step.road_id, {
        color: "#d99a3e",
        weight: 5,
        opacity: 1,
        dashArray: "8 5",
        className: "mst-current-edge",
      }, state.mstCurrentLayer);
      await sleep(Math.max(60, delay * 0.72));
    } else if (step.type === "accept") {
      state.mstCurrentLayer.clearLayers();
      drawMstEdge(step.road_id, {
        color: "#ffffff",
        weight: 9,
        opacity: 0.96,
        lineCap: "round",
      }, state.mstLayer);
      drawMstEdge(step.road_id, {
        color: "#2d8a68",
        weight: 5,
        opacity: 1,
        lineCap: "round",
        className: "mst-selected-edge",
      }, state.mstLayer);
      await sleep(delay);
    } else if (step.type === "reject") {
      state.mstCurrentLayer.clearLayers();
      drawMstEdge(step.road_id, {
        color: "#b95454",
        weight: 3,
        opacity: 0.9,
        dashArray: "5 6",
        className: "mst-rejected-edge",
      }, state.mstRejectedLayer);
      await sleep(delay);
    } else {
      await sleep(Math.max(50, delay * 0.45));
    }
  }
  if (token !== state.mstAnimationToken) return;
  state.mstAnimationPlaying = false;
  updateMstStatus(steps.length - 1, steps.length, "Final MST edges highlighted in green.", "Kruskal complete");
  drawFinalMst(state.lastMstResult);
  setMstAnimationButton(false);
}

async function runKruskal() {
  cancelMstAnimation({ hideStatus: true });
  clearMstOverlays();
  try {
    const result = await api("/api/mst/kruskal", { method: "POST", body: JSON.stringify({}) });
    showMstResult(result);
    animateMst();
  } catch (error) {
    clearMstResult();
    showToast(error.message, "error");
  }
}

function bindEvents() {
  $("#route-form").addEventListener("submit", findRoute);
  $("#location-form").addEventListener("submit", addLocation);
  $("#road-form").addEventListener("submit", addRoad);
  $("#map-location-form").addEventListener("submit", (event) => addLocation(event, true));
  $("#edit-map-button").addEventListener("click", openDrawer);
  $("#close-drawer").addEventListener("click", closeDrawer);
  els.backdrop.addEventListener("click", closeDrawer);
  $("#save-road-button").addEventListener("click", saveRoad);
  $("#delete-road-button").addEventListener("click", deleteRoad);
  $("#delete-location-button").addEventListener("click", deleteLocation);
  $("#drawer-reset-button").addEventListener("click", resetGraph);
  $("#reset-map-button").addEventListener("click", resetGraph);
  $("#clear-route").addEventListener("click", clearRouteResult);
  els.routeTab.addEventListener("click", () => activateMode("route"));
  els.mstTab.addEventListener("click", () => activateMode("mst"));
  $("#run-kruskal").addEventListener("click", runKruskal);
  $("#clear-mst").addEventListener("click", clearMstResult);
  $("#swap-locations").addEventListener("click", () => {
    const source = els.source.value;
    els.source.value = els.destination.value;
    els.destination.value = source;
    refreshMarkerIcons();
  });
  $("#road-picker").addEventListener("change", (event) => selectRoad(event.target.value));
  $("#add-on-map-button").addEventListener("click", () => {
    setMapMode(!state.addOnMapMode);
    if (state.addOnMapMode) showToast("Click the map to place a new location.");
  });
  $("#cancel-map-mode").addEventListener("click", () => setMapMode(false));
  $("#cancel-modal").addEventListener("click", () => closeMapModal());
  $("#animate-route").addEventListener("click", () => {
    if (state.animationPlaying) {
      cancelAnimation();
      return;
    }
    $("#animation-options").hidden = false;
    animateRoute();
  });
  $$(".speed-buttons button").forEach((button) => {
    button.addEventListener("click", () => {
      state.animationSpeed = button.dataset.speed;
      $$(".speed-buttons button").forEach((item) => item.classList.toggle("active", item === button));
      if (state.animationPlaying && state.lastResult) animateRoute();
    });
  });
  $$(".mst-speed-buttons button").forEach((button) => {
    button.addEventListener("click", () => {
      state.mstAnimationSpeed = button.dataset.mstSpeed;
      $$(".mst-speed-buttons button").forEach((item) => item.classList.toggle("active", item === button));
      if (state.mstAnimationPlaying && state.lastMstResult) animateMst();
    });
  });
  $("#animate-mst").addEventListener("click", () => {
    if (state.mstAnimationPlaying) {
      cancelMstAnimation();
      return;
    }
    $("#mst-animation-options").hidden = false;
    animateMst();
  });
  $("#location-search").addEventListener("input", (event) => searchLocations(event.target.value));
  $("#clear-search").addEventListener("click", () => {
    $("#location-search").value = "";
    searchLocations("");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDrawer();
      setMapMode(false);
      closeMapModal();
    }
  });
}

function initMap() {
  state.map = L.map("map", { zoomControl: false, preferCanvas: true }).setView([22.3, 72.7], 7);
  L.control.zoom({ position: "bottomleft" }).addTo(state.map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(state.map);
  state.roadLayer = L.layerGroup().addTo(state.map);
  state.routeLayer = L.layerGroup().addTo(state.map);
  state.animationLayer = L.layerGroup().addTo(state.map);
  state.visitedLayer = L.layerGroup().addTo(state.map);
  state.mstLayer = L.layerGroup().addTo(state.map);
  state.mstAnimationLayer = L.layerGroup().addTo(state.map);
  state.mstCurrentLayer = L.layerGroup().addTo(state.map);
  state.mstRejectedLayer = L.layerGroup().addTo(state.map);
  state.markerLayer = L.layerGroup().addTo(state.map);
  state.map.on("click", (event) => {
    if (state.addOnMapMode) openMapModal(event.latlng);
  });
}

bindEvents();
initMap();
updateModeLegend();
loadGraph({ source: "ahmedabad", destination: "surat" });