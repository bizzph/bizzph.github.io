(() => {
  "use strict";

  const DATA = window.LOT_MAP_DATA || { lots: [] };
  const LEGAL = window.LOT_DUE_DILIGENCE || {};
  const CONFIG = window.LOT_MAP_CONFIG || {};

  const WGS84_A = 6378137.0;
  const WGS84_F = 1 / 298.257223563;
  const WGS84_B = (1 - WGS84_F) * WGS84_A;

  const LOT_HIGHLIGHT = { stroke: "#d6ad00", fill: "#ffd84d" };
  const LOT_SELECTED = { stroke: "#cb5700", fill: "#ff8a00" };

  const sidebarEl = document.getElementById("sidebar");
  const sidebarListView = document.getElementById("sidebar-list-view");
  const sidebarDetailsView = document.getElementById("sidebar-details-view");
  const sidebarBack = document.getElementById("sidebar-back");
  const listEl = document.getElementById("lot-list");
  const detailsContent = document.getElementById("details-content");
  const mapEl = document.getElementById("google-map");
  const loadingEl = document.getElementById("map-loading");
  const errorEl = document.getElementById("map-error");
  const errorTitleEl = document.getElementById("map-error-title");
  const errorCopyEl = document.getElementById("map-error-copy");
  const roadmapBtn = document.getElementById("map-roadmap");
  const satelliteBtn = document.getElementById("map-satellite");
  const showAllBtn = document.getElementById("show-all");
  const zoomInBtn = document.getElementById("zoom-in");
  const zoomOutBtn = document.getElementById("zoom-out");

  const state = {
    selectedId: null,
    mapType: CONFIG.googleMapType === "satellite" ? "satellite" : "roadmap"
  };

  let map = null;
  let polygons = new Map();
  let mapLabels = new Map();
  let LotLabelOverlayClass = null;
  let cards = new Map();
  let sidebarListScrollTop = 0;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function display(value) {
    if (value === null || value === undefined || value === "") return "—";
    return esc(value);
  }

  function toRad(value) { return value * Math.PI / 180; }
  function toDeg(value) { return value * 180 / Math.PI; }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function formatArea(value) {
    return new Intl.NumberFormat("en-PH").format(value) + " sqm";
  }

  function formatDistance(value) {
    return Number(value).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " m";
  }

  function parseBearing(text) {
    const s = String(text).trim().toUpperCase().replace(/DEG\.?/g, "D");
    const match = s.match(/^([NS])\s*([0-9.]+)\s*(?:\u00B0|D)?\s*([0-9.]*)\s*['M]?\s*([EW])$/);
    if (!match) throw new Error("Invalid bearing: " + text);
    const ns = match[1];
    const ew = match[4];
    const angle = Number(match[2]) + (match[3] ? Number(match[3]) / 60 : 0);
    if (ns === "N" && ew === "E") return angle;
    if (ns === "N" && ew === "W") return 360 - angle;
    if (ns === "S" && ew === "E") return 180 - angle;
    return 180 + angle;
  }

  // Vincenty direct solution on the WGS84 ellipsoid.
  function destinationWgs84(point, bearingText, distanceM) {
    const alpha1 = toRad(parseBearing(bearingText));
    const s = Number(distanceM);
    const phi1 = toRad(Number(point.lat));
    const lambda1 = toRad(Number(point.lng));
    const sinAlpha1 = Math.sin(alpha1);
    const cosAlpha1 = Math.cos(alpha1);
    const tanU1 = (1 - WGS84_F) * Math.tan(phi1);
    const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
    const sinU1 = tanU1 * cosU1;
    const sigma1 = Math.atan2(tanU1, cosAlpha1);
    const sinAlpha = cosU1 * sinAlpha1;
    const cosSqAlpha = 1 - sinAlpha * sinAlpha;
    const uSq = cosSqAlpha * (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B);
    const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
    const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));

    let sigma = s / (WGS84_B * A);
    let previousSigma = Infinity;
    let cos2SigmaM = 0;
    let sinSigma = 0;
    let cosSigma = 0;
    let iterations = 0;

    while (Math.abs(sigma - previousSigma) > 1e-12 && iterations < 100) {
      cos2SigmaM = Math.cos(2 * sigma1 + sigma);
      sinSigma = Math.sin(sigma);
      cosSigma = Math.cos(sigma);
      const deltaSigma = B * sinSigma * (
        cos2SigmaM + B / 4 * (
          cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)
        )
      );
      previousSigma = sigma;
      sigma = s / (WGS84_B * A) + deltaSigma;
      iterations += 1;
    }

    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);
    const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
    const phi2 = Math.atan2(
      sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
      (1 - WGS84_F) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp)
    );
    const lambda = Math.atan2(
      sinSigma * sinAlpha1,
      cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1
    );
    const C = WGS84_F / 16 * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
    const L = lambda - (1 - C) * WGS84_F * sinAlpha * (
      sigma + C * sinSigma * (
        cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)
      )
    );

    return {
      lat: toDeg(phi2),
      lng: ((toDeg(lambda1 + L) + 540) % 360) - 180
    };
  }

  function localTraverseStats(traverse) {
    let x = 0;
    let y = 0;
    let area = 0;
    const points = [[0, 0]];
    for (const segment of traverse || []) {
      const azimuth = toRad(parseBearing(segment.bearing));
      x += Number(segment.distanceM) * Math.sin(azimuth);
      y += Number(segment.distanceM) * Math.cos(azimuth);
      points.push([x, y]);
    }
    const polygon = points.slice(0, -1);
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    return { closureM: Math.hypot(x, y), computedAreaSqm: Math.abs(area) / 2 };
  }

  function configuredBllm() {
    const bllm = CONFIG.bllm;
    if (!bllm || !Number.isFinite(Number(bllm.lat)) || !Number.isFinite(Number(bllm.lng))) {
      throw new Error("A valid BLLM latitude/longitude is required in config.js");
    }
    return { lat: Number(bllm.lat), lng: Number(bllm.lng) };
  }

  function prepareLot(raw) {
    const lot = { ...raw, dueDiligence: LEGAL[raw.id] || null };
    if (Array.isArray(raw.coordinates) && raw.coordinates.length >= 3) {
      lot.coordinates = raw.coordinates.map(point => [Number(point[0]), Number(point[1])]);
    } else {
      const bllm = configuredBllm();
      const corner1 = destinationWgs84(bllm, raw.tie.bearing, raw.tie.distanceM);
      const coordinates = [[corner1.lat, corner1.lng]];
      let current = corner1;
      for (let i = 0; i < raw.traverse.length - 1; i += 1) {
        current = destinationWgs84(current, raw.traverse[i].bearing, raw.traverse[i].distanceM);
        coordinates.push([current.lat, current.lng]);
      }
      lot.coordinates = coordinates;
    }
    Object.assign(lot, localTraverseStats(raw.traverse || []));
    return lot;
  }

  let LOTS = [];
  try {
    LOTS = (Array.isArray(DATA.lots) ? DATA.lots : []).map(prepareLot);
  } catch (error) {
    console.error(error);
  }

  function legalName(lot) {
    return lot.dueDiligence?.legalLot || lot.surveyLot || lot.id;
  }

  function polygonCentroid(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 3) return configuredBllm();
    let twiceArea = 0;
    let centroidLng = 0;
    let centroidLat = 0;

    for (let i = 0; i < coordinates.length; i += 1) {
      const current = coordinates[i];
      const next = coordinates[(i + 1) % coordinates.length];
      const x1 = Number(current[1]);
      const y1 = Number(current[0]);
      const x2 = Number(next[1]);
      const y2 = Number(next[0]);
      const cross = x1 * y2 - x2 * y1;
      twiceArea += cross;
      centroidLng += (x1 + x2) * cross;
      centroidLat += (y1 + y2) * cross;
    }

    if (Math.abs(twiceArea) < 1e-12) {
      const total = coordinates.reduce((sum, point) => ({
        lat: sum.lat + Number(point[0]),
        lng: sum.lng + Number(point[1])
      }), { lat: 0, lng: 0 });
      return { lat: total.lat / coordinates.length, lng: total.lng / coordinates.length };
    }

    return {
      lat: centroidLat / (3 * twiceArea),
      lng: centroidLng / (3 * twiceArea)
    };
  }

  function getLotLabelOverlayClass() {
    if (LotLabelOverlayClass) return LotLabelOverlayClass;

    LotLabelOverlayClass = class extends google.maps.OverlayView {
      constructor(position, text) {
        super();
        this.position = position;
        this.text = text;
        this.element = null;
      }

      onAdd() {
        const element = document.createElement("div");
        element.className = "lot-map-label";
        element.textContent = this.text;
        element.setAttribute("aria-hidden", "true");
        this.element = element;
        this.getPanes().overlayLayer.appendChild(element);
      }

      draw() {
        if (!this.element) return;
        const projection = this.getProjection();
        const pixel = projection.fromLatLngToDivPixel(this.position);
        if (!pixel) return;
        this.element.style.left = `${Math.round(pixel.x)}px`;
        this.element.style.top = `${Math.round(pixel.y)}px`;
      }

      onRemove() {
        this.element?.remove();
        this.element = null;
      }

      setSelected(selected) {
        this.element?.classList.toggle("is-selected", Boolean(selected));
      }
    };

    return LotLabelOverlayClass;
  }

  function taxStatus(lot) {
    const tax = lot.dueDiligence?.realPropertyTax || {};
    const remarks = String(tax.remarks || "").toLowerCase();
    const recommendation = String(lot.dueDiligence?.recommendation || "").toLowerCase();
    if (tax.fullPayment === "No" || tax.delinquency || recommendation.includes("outstanding real property tax")) {
      return { label: "Tax outstanding", className: "is-attention" };
    }
    if (remarks.includes("pending")) return { label: "Clearance pending", className: "is-warning" };
    if (tax.fullPayment === "Yes") return { label: "Tax paid", className: "is-clear" };
    return { label: "Review records", className: "is-neutral" };
  }

  function statusMarkup(lot) {
    const status = taxStatus(lot);
    return `<span class="status-badge ${status.className}">${esc(status.label)}</span>`;
  }

  function detailRows(rows) {
    return `<dl class="detail-grid">${rows.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${display(value)}</dd>`).join("")}</dl>`;
  }

  function accordion(title, body, expanded = false) {
    return `
      <section class="details-section">
        <button class="details-section-toggle" type="button" aria-expanded="${expanded ? "true" : "false"}">
          <span>${esc(title)}</span><span class="details-chevron" aria-hidden="true">⌄</span>
        </button>
        <div class="details-section-panel"${expanded ? "" : " hidden"}>${body}</div>
      </section>`;
  }

  function detailsMarkup(lot) {
    const legal = lot.dueDiligence || {};
    const tax = legal.realPropertyTax || {};
    const rtc = legal.rtcCertification || {};
    const noImprovements = legal.noImprovements || {};

    const titleBody = detailRows([
      ["Lot No.", legal.legalLot],
      ["Transfer Certificate / survey reference", lot.surveyLot],
      ["Encumbrances (if any)", legal.title?.encumbrances]
    ]);

    const taxBody = detailRows([
      ["Full payment", tax.fullPayment],
      ["Delinquency", tax.delinquency],
      ["Period covered", tax.periodCovered],
      ["Remarks", tax.remarks]
    ]);

    const rtcBody = detailRows([
      ["Subject of land registration and/or litigation", rtc.landRegistrationOrLitigation],
      ["Posted as bail bond", rtc.postedAsBailBond]
    ]);

    const improvementsBody = detailRows([
      ["Remarks", noImprovements.remarks]
    ]);

    const traverseRows = (lot.traverse || []).map(segment => `
      <tr><td>${esc(segment.line)}</td><td>${esc(segment.bearing)}</td><td>${esc(formatDistance(segment.distanceM))}</td></tr>`).join("");
    const traverseBody = `<div class="details-table-wrap"><table><thead><tr><th>Line</th><th>Bearing</th><th>Distance</th></tr></thead><tbody>${traverseRows}</tbody></table></div>`;

    const boundaryRows = (lot.boundaries || []).map(boundary => `
      <tr><td>${esc(boundary.line)}</td><td>${esc(boundary.direction)}</td><td>${esc(boundary.adjoining)}</td></tr>`).join("");
    const boundaryBody = `<div class="details-table-wrap"><table><thead><tr><th>Line</th><th>Side</th><th>Adjoining property</th></tr></thead><tbody>${boundaryRows}</tbody></table></div>`;

    const surveyBody = `
      <div class="details-foot">
        <p><strong>Tie point:</strong> ${esc(lot.tiePoint)}</p>
        <p><strong>Tie:</strong> ${esc(lot.tie.bearing)} · ${esc(formatDistance(lot.tie.distanceM))}</p>
        <p><strong>Survey:</strong> ${esc(lot.surveyDate || "—")}</p>
        <p><strong>Approved:</strong> ${esc(lot.approvedDate || "—")}</p>
        <p><strong>Engineer:</strong> ${esc(lot.engineer || "—")}</p>
        <p><strong>Traverse closure check:</strong> ${esc(formatDistance(lot.closureM))}</p>
        <p><strong>Computed traverse area:</strong> ${esc(formatArea(Math.round(lot.computedAreaSqm)))}</p>
        <p><strong>Corner description:</strong> ${esc(lot.cornerDescription || "—")}</p>
      </div>`;

    return `
      <header class="details-heading">
        <p class="details-kicker">${esc(lot.id)} · PROPERTY RECORD</p>
        <h2>${esc(legalName(lot))}</h2>
        <p class="details-subtitle">${esc(lot.surveyLot)} · ${esc(lot.barangay)}</p>
        <div class="details-status-row">${statusMarkup(lot)}</div>
      </header>

      <div class="details-summary">
        <div><span>Area per survey</span><strong>${esc(formatArea(lot.areaSqm))}</strong></div>
        <div><span>Plan / title</span><strong>${esc(lot.plan)}</strong></div>
        <div><span>Location</span><strong>${esc(lot.barangay)}</strong></div>
        <div><span>BLLM tie</span><strong>${esc(lot.tie.bearing)} · ${esc(formatDistance(lot.tie.distanceM))}</strong></div>
      </div>

      ${legal.recommendation ? `<div class="recommendation"><strong>Remarks / recommendation</strong>${esc(legal.recommendation)}</div>` : ""}

      <div class="details-sections">
        ${accordion("Transfer Certificate of Title", titleBody, true)}
        ${accordion("Real Property Tax Clearance", taxBody, true)}
        ${accordion("RTC Certification", rtcBody, false)}
        ${accordion("Certificate of No Improvements", improvementsBody, false)}
        ${accordion("Bearings & distances", traverseBody, false)}
        ${accordion("Adjoining boundaries", boundaryBody, false)}
        ${accordion("Survey information", surveyBody, false)}
      </div>

      <p class="details-disclaimer">Due-diligence fields are transcribed from the supplied spreadsheet; blank source cells are shown as “—”. Survey geometry is calculated from the supplied technical descriptions and configured BLLM WGS84 coordinate. Verify all information against official source documents before legal, engineering, construction, acquisition, or boundary-setting use.</p>
    `;
  }

  function createSidebar() {
    listEl.replaceChildren();
    cards.clear();
    LOTS.forEach(lot => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "lot-card";
      card.innerHTML = `
        <div class="lot-card-top">
          <div class="lot-title">
            <h2>${esc(legalName(lot))}</h2>
            <p>${esc(lot.surveyLot)}</p>
          </div>
          <span class="lot-area">${esc(formatArea(lot.areaSqm))}</span>
        </div>
        <div class="lot-meta">
          <span>${esc(lot.barangay)}</span>
          ${statusMarkup(lot)}
        </div>`;
      card.addEventListener("click", () => selectLot(lot));
      listEl.appendChild(card);
      cards.set(lot.id, card);
    });
  }

  function updateSelectionStyles() {
    LOTS.forEach(lot => {
      const selected = state.selectedId === lot.id;
      cards.get(lot.id)?.classList.toggle("is-selected", selected);
      const polygon = polygons.get(lot.id);
      if (polygon) {
        polygon.setOptions({
          strokeColor: selected ? LOT_SELECTED.stroke : LOT_HIGHLIGHT.stroke,
          strokeOpacity: 1,
          strokeWeight: selected ? 5 : 3,
          fillColor: selected ? LOT_SELECTED.fill : LOT_HIGHLIGHT.fill,
          fillOpacity: selected ? 0.46 : 0.26,
          zIndex: selected ? 20 : 2
        });
      }
      mapLabels.get(lot.id)?.setSelected(selected);
    });
  }

  function openDetails(lot) {
    if (!sidebarListView.hidden) sidebarListScrollTop = sidebarEl.scrollTop;
    detailsContent.innerHTML = detailsMarkup(lot);
    sidebarListView.hidden = true;
    sidebarDetailsView.hidden = false;
    sidebarDetailsView.setAttribute("aria-label", `Details for ${legalName(lot)}`);
    sidebarEl.scrollTop = 0;
    sidebarBack.focus({ preventScroll: true });
  }

  function closeDetails() {
    state.selectedId = null;
    sidebarDetailsView.hidden = true;
    sidebarListView.hidden = false;
    sidebarDetailsView.setAttribute("aria-label", "Selected lot details");
    detailsContent.replaceChildren();
    updateSelectionStyles();
    requestAnimationFrame(() => { sidebarEl.scrollTop = sidebarListScrollTop; });
  }

  function selectLot(lot) {
    state.selectedId = lot.id;
    updateSelectionStyles();
    openDetails(lot);
  }

  function fitAll() {
    if (!map || !window.google?.maps || !LOTS.length) return;
    const bounds = new google.maps.LatLngBounds();
    LOTS.forEach(lot => lot.coordinates.forEach(point => bounds.extend({ lat: point[0], lng: point[1] })));
    map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
  }

  function syncMapTypeButtons() {
    const current = map?.getMapTypeId?.() || state.mapType;
    state.mapType = current === "satellite" ? "satellite" : "roadmap";
    const roadmapActive = state.mapType === "roadmap";
    roadmapBtn.classList.toggle("is-active", roadmapActive);
    satelliteBtn.classList.toggle("is-active", !roadmapActive);
    roadmapBtn.setAttribute("aria-pressed", String(roadmapActive));
    satelliteBtn.setAttribute("aria-pressed", String(!roadmapActive));
  }

  function setControlsDisabled(disabled) {
    [roadmapBtn, satelliteBtn, showAllBtn, zoomInBtn, zoomOutBtn].forEach(button => {
      button.disabled = disabled;
    });
  }

  function loadGoogleMapsApi() {
    const key = String(CONFIG.googleMapsApiKey || "").trim();
    if (!key) return Promise.reject(new Error("MISSING_API_KEY"));
    if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);

    return new Promise((resolve, reject) => {
      const callbackName = "__ubayGoogleMapsReady";
      const script = document.createElement("script");
      const version = String(CONFIG.googleMapsVersion || "quarterly").trim();

      window[callbackName] = () => {
        delete window[callbackName];
        resolve(window.google.maps);
      };

      script.async = true;
      script.id = "google-maps-api";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&v=${encodeURIComponent(version)}&callback=${callbackName}`;
      script.onerror = () => {
        delete window[callbackName];
        script.remove();
        reject(new Error("GOOGLE_MAPS_LOAD_FAILED"));
      };
      document.head.appendChild(script);
    });
  }

  async function createMap() {
    await loadGoogleMapsApi();
    const mapsLibrary = window.google?.maps?.importLibrary ? await google.maps.importLibrary("maps") : google.maps;
    const MapClass = mapsLibrary.Map || google.maps.Map;
    const center = configuredBllm();

    map = new MapClass(mapEl, {
      center,
      zoom: 15,
      mapTypeId: state.mapType,
      gestureHandling: "greedy",
      disableDefaultUI: true,
      clickableIcons: false,
      keyboardShortcuts: true,
      minZoom: 3,
      maxZoom: 21,
      backgroundColor: "#dfe3e6"
    });

    polygons.clear();
    mapLabels.forEach(label => label.setMap(null));
    mapLabels.clear();
    const LotLabelOverlay = getLotLabelOverlayClass();

    LOTS.forEach(lot => {
      const polygon = new google.maps.Polygon({
        map,
        paths: lot.coordinates.map(point => ({ lat: point[0], lng: point[1] })),
        clickable: true,
        strokeColor: LOT_HIGHLIGHT.stroke,
        strokeOpacity: 1,
        strokeWeight: 3,
        fillColor: LOT_HIGHLIGHT.fill,
        fillOpacity: 0.26,
        zIndex: 2
      });
      polygon.addListener("click", () => selectLot(lot));
      polygons.set(lot.id, polygon);

      const center = polygonCentroid(lot.coordinates);
      const label = new LotLabelOverlay(new google.maps.LatLng(center.lat, center.lng), legalName(lot));
      label.setMap(map);
      mapLabels.set(lot.id, label);
    });

    map.addListener("maptypeid_changed", syncMapTypeButtons);
    google.maps.event.addListenerOnce(map, "idle", () => {
      loadingEl.hidden = true;
      fitAll();
    });

    syncMapTypeButtons();
    updateSelectionStyles();
    setControlsDisabled(false);
  }

  function showMapError(error) {
    console.error(error);
    loadingEl.hidden = true;
    errorEl.hidden = false;
    const missingKey = error?.message === "MISSING_API_KEY";
    if (errorTitleEl) errorTitleEl.textContent = missingKey ? "Google Maps API key required" : "Google Maps could not load";
    if (errorCopyEl) {
      errorCopyEl.textContent = missingKey
        ? "Add your restricted browser key to config.js, then reload the page."
        : "Check the API key, billing, allowed website referrers, and Maps JavaScript API access.";
    }
  }

  function bindControls() {
    sidebarBack.addEventListener("click", closeDetails);

    detailsContent.addEventListener("click", event => {
      const button = event.target.closest(".details-section-toggle");
      if (!button) return;
      const panel = button.nextElementSibling;
      if (!panel) return;
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      panel.hidden = expanded;
    });

    roadmapBtn.addEventListener("click", () => map?.setMapTypeId("roadmap"));
    satelliteBtn.addEventListener("click", () => map?.setMapTypeId("satellite"));
    showAllBtn.addEventListener("click", () => {
      closeDetails();
      fitAll();
    });
    zoomInBtn.addEventListener("click", () => {
      if (!map) return;
      map.setZoom(clamp((map.getZoom() || 15) + 1, 3, 21));
    });
    zoomOutBtn.addEventListener("click", () => {
      if (!map) return;
      map.setZoom(clamp((map.getZoom() || 15) - 1, 3, 21));
    });
  }

  createSidebar();
  bindControls();
  setControlsDisabled(true);
  createMap().catch(showMapError);
})();
