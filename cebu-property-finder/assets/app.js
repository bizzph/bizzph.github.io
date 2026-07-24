(() => {
  "use strict";

  const state = {
    listings: [],
    filtered: [],
    compareIds: new Set(),
    map: null,
    markers: null
  };

  const els = {
    form: document.querySelector("#filtersForm"),
    query: document.querySelector("#query"),
    location: document.querySelector("#location"),
    propertyType: document.querySelector("#propertyType"),
    minPrice: document.querySelector("#minPrice"),
    maxPrice: document.querySelector("#maxPrice"),
    bedrooms: document.querySelector("#bedrooms"),
    sort: document.querySelector("#sort"),
    reset: document.querySelector("#resetBtn"),
    results: document.querySelector("#results"),
    empty: document.querySelector("#emptyState"),
    matchCount: document.querySelector("#matchCount"),
    medianPrice: document.querySelector("#medianPrice"),
    avgPpsm: document.querySelector("#avgPpsm"),
    searchRecap: document.querySelector("#searchRecap"),
    exportBtn: document.querySelector("#exportBtn"),
    shareBtn: document.querySelector("#shareBtn"),
    compareTray: document.querySelector("#compareTray"),
    compareCount: document.querySelector("#compareCount"),
    compareBtn: document.querySelector("#compareBtn"),
    clearCompareBtn: document.querySelector("#clearCompareBtn"),
    compareDialog: document.querySelector("#compareDialog"),
    compareTableWrap: document.querySelector("#compareTableWrap"),
    closeDialogBtn: document.querySelector("#closeDialogBtn"),
    listViewBtn: document.querySelector("#listViewBtn"),
    mapViewBtn: document.querySelector("#mapViewBtn"),
    toast: document.querySelector("#toast")
  };

  const peso = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0
  });

  const number = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });

  function safeText(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    return new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric" }).format(date);
  }

  function getBedroomsLabel(value) {
    if (value === 0) return "Studio";
    if (value == null) return "—";
    return `${value} bed${value === 1 ? "" : "s"}`;
  }

  function getDaysOld(dateString) {
    const seen = new Date(`${dateString}T00:00:00`).getTime();
    const now = Date.now();
    return Math.max(0, Math.floor((now - seen) / 86400000));
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
    const json = await response.json();
    if (!Array.isArray(json)) throw new Error(`${url} must return an array`);
    return json;
  }

  function normalizeListing(item, index, sourceUrl = "") {
    const required = ["title", "location", "city", "type", "price", "latitude", "longitude", "lastSeen"];
    for (const key of required) {
      if (item[key] === undefined || item[key] === null || item[key] === "") {
        throw new Error(`Listing ${index + 1} is missing ${key}`);
      }
    }

    return {
      id: String(item.id || `external-${index}-${Math.random().toString(36).slice(2, 8)}`),
      title: String(item.title),
      location: String(item.location),
      city: String(item.city),
      barangay: String(item.barangay || ""),
      type: String(item.type),
      price: Number(item.price),
      bedrooms: item.bedrooms == null ? null : Number(item.bedrooms),
      bathrooms: item.bathrooms == null ? null : Number(item.bathrooms),
      floorArea: item.floorArea == null ? null : Number(item.floorArea),
      lotArea: item.lotArea == null ? null : Number(item.lotArea),
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 8) : [],
      sourceName: String(item.sourceName || "External feed"),
      sourceUrl: String(item.sourceUrl || sourceUrl || "#"),
      lastSeen: String(item.lastSeen),
      image: String(item.image || ""),
      demo: Boolean(item.demo)
    };
  }

  async function loadListings() {
    const sources = ["data/listings.json", ...(window.CEBU_PROPERTY_CONFIG?.feeds || [])];
    const loaded = [];

    for (const url of sources) {
      try {
        const items = await fetchJson(url);
        items.forEach((item, index) => loaded.push(normalizeListing(item, index, url)));
      } catch (error) {
        console.error(error);
        showToast(`One feed could not be loaded: ${url}`);
      }
    }

    const byId = new Map();
    loaded.forEach(item => byId.set(item.id, item));
    state.listings = [...byId.values()];
  }

  function populateFilters() {
    const cities = [...new Set(state.listings.map(item => item.city))].sort();
    const types = [...new Set(state.listings.map(item => item.type))].sort();

    cities.forEach(city => {
      const option = document.createElement("option");
      option.value = city;
      option.textContent = city;
      els.location.append(option);
    });

    types.forEach(type => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      els.propertyType.append(option);
    });
  }

  function restoreFromQueryString() {
    const params = new URLSearchParams(window.location.search);
    ["query", "location", "propertyType", "minPrice", "maxPrice", "bedrooms", "sort"].forEach(key => {
      if (params.has(key) && els[key]) els[key].value = params.get(key);
    });
  }

  function writeQueryString() {
    const params = new URLSearchParams();
    const values = getFilterValues();
    Object.entries(values).forEach(([key, value]) => {
      if (value !== "" && value != null && !(key === "sort" && value === "relevance")) params.set(key, value);
    });
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
    window.history.replaceState({}, "", url);
  }

  function getFilterValues() {
    return {
      query: els.query.value.trim(),
      location: els.location.value,
      propertyType: els.propertyType.value,
      minPrice: els.minPrice.value,
      maxPrice: els.maxPrice.value,
      bedrooms: els.bedrooms.value,
      sort: els.sort.value
    };
  }

  function relevanceScore(item, query) {
    if (!query) return 0;
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const haystack = [item.title, item.location, item.city, item.barangay, item.type, ...item.tags].join(" ").toLowerCase();
    return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
  }

  function applyFilters() {
    const values = getFilterValues();
    const query = values.query.toLowerCase();
    const minPrice = values.minPrice ? Number(values.minPrice) : 0;
    const maxPrice = values.maxPrice ? Number(values.maxPrice) : Number.POSITIVE_INFINITY;
    const minBedrooms = values.bedrooms === "" ? null : Number(values.bedrooms);

    const filtered = state.listings.filter(item => {
      const haystack = [item.title, item.location, item.city, item.barangay, item.type, ...item.tags].join(" ").toLowerCase();
      if (query && !query.split(/\s+/).every(term => haystack.includes(term))) return false;
      if (values.location && item.city !== values.location) return false;
      if (values.propertyType && item.type !== values.propertyType) return false;
      if (item.price < minPrice || item.price > maxPrice) return false;
      if (minBedrooms !== null) {
        if (minBedrooms === 0 && item.bedrooms !== 0) return false;
        if (minBedrooms > 0 && (item.bedrooms == null || item.bedrooms < minBedrooms)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      switch (values.sort) {
        case "newest": return new Date(b.lastSeen) - new Date(a.lastSeen);
        case "priceAsc": return a.price - b.price;
        case "priceDesc": return b.price - a.price;
        case "areaDesc": return (b.floorArea || 0) - (a.floorArea || 0);
        case "relevance":
        default:
          return relevanceScore(b, query) - relevanceScore(a, query) || new Date(b.lastSeen) - new Date(a.lastSeen);
      }
    });

    state.filtered = filtered;
    render();
    writeQueryString();
  }

  function render() {
    renderResults();
    renderSummary();
    renderMap();
    renderCompareTray();
  }

  function renderResults() {
    els.results.innerHTML = "";
    els.empty.hidden = state.filtered.length !== 0;

    state.filtered.forEach(item => {
      const card = document.createElement("article");
      card.className = "property-card";
      const daysOld = getDaysOld(item.lastSeen);
      const staleBadge = daysOld > 30 ? '<span class="badge badge-warning">Older result</span>' : "";
      const selected = state.compareIds.has(item.id);
      const externalUrl = item.sourceUrl && item.sourceUrl !== "#" ? item.sourceUrl : "https://example.com/";

      card.innerHTML = `
        <div class="property-media">
          ${item.image ? `<img src="${safeText(item.image)}" alt="${safeText(item.title)}" loading="lazy" referrerpolicy="no-referrer" />` : ""}
          <div class="badge-row">
            ${item.demo ? '<span class="badge badge-warning">Demo listing</span>' : '<span class="badge">External listing</span>'}
            ${staleBadge}
          </div>
        </div>
        <div class="property-body">
          <div class="property-top">
            <div>
              <h3 class="property-title">${safeText(item.title)}</h3>
              <p class="property-location">${safeText(item.location)}</p>
            </div>
            <div class="property-price">${peso.format(item.price)}</div>
          </div>
          <div class="property-meta">
            <span>${safeText(item.type)}</span>
            <span>${getBedroomsLabel(item.bedrooms)}</span>
            ${item.bathrooms != null ? `<span>${number.format(item.bathrooms)} bath${item.bathrooms === 1 ? "" : "s"}</span>` : ""}
            ${item.floorArea ? `<span>${number.format(item.floorArea)} m² floor</span>` : ""}
            ${item.lotArea ? `<span>${number.format(item.lotArea)} m² lot</span>` : ""}
          </div>
          <div class="property-tags">${item.tags.map(tag => `<span class="tag">${safeText(tag)}</span>`).join("")}</div>
          <div class="property-footer">
            <div class="source-block">
              <span>Source</span>
              <strong>${safeText(item.sourceName)}</strong>
              Last seen ${safeText(formatDate(item.lastSeen))}
            </div>
            <div class="card-actions">
              <button class="button button-ghost small-button compare-toggle ${selected ? "selected" : ""}" type="button" data-compare-id="${safeText(item.id)}">${selected ? "Selected" : "Compare"}</button>
              <a class="button button-primary small-button" href="${safeText(externalUrl)}" target="_blank" rel="noopener noreferrer">View source</a>
            </div>
          </div>
        </div>`;

      els.results.append(card);
    });

    els.results.querySelectorAll("[data-compare-id]").forEach(button => {
      button.addEventListener("click", () => toggleCompare(button.dataset.compareId));
    });
  }

  function renderSummary() {
    const prices = state.filtered.map(item => item.price).sort((a, b) => a - b);
    const ppsmValues = state.filtered
      .filter(item => item.floorArea && item.floorArea > 0)
      .map(item => item.price / item.floorArea);

    let median = null;
    if (prices.length) {
      const mid = Math.floor(prices.length / 2);
      median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
    }
    const avgPpsm = ppsmValues.length ? ppsmValues.reduce((sum, value) => sum + value, 0) / ppsmValues.length : null;

    els.matchCount.textContent = number.format(state.filtered.length);
    els.medianPrice.textContent = median == null ? "—" : peso.format(median);
    els.avgPpsm.textContent = avgPpsm == null ? "—" : `${peso.format(avgPpsm)} / m²`;

    if (!state.filtered.length) {
      els.searchRecap.textContent = "No sample listings match the current filters.";
      return;
    }

    const cityCounts = new Map();
    state.filtered.forEach(item => cityCounts.set(item.city, (cityCounts.get(item.city) || 0) + 1));
    const topCity = [...cityCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    els.searchRecap.textContent = `${state.filtered.length} result${state.filtered.length === 1 ? "" : "s"}, mostly in ${topCity[0]}. Sample prices range from ${peso.format(min)} to ${peso.format(max)}.`;
  }

  function initMap() {
    state.map = L.map("map", { scrollWheelZoom: false }).setView([10.3157, 123.8854], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(state.map);
    state.markers = L.layerGroup().addTo(state.map);
  }

  function renderMap() {
    if (!state.map || !state.markers) return;
    state.markers.clearLayers();
    const bounds = [];

    state.filtered.forEach(item => {
      const marker = L.marker([item.latitude, item.longitude]);
      marker.bindPopup(`
        <div class="popup-title">${safeText(item.title)}</div>
        <div>${safeText(item.location)}</div>
        <div class="popup-price">${safeText(peso.format(item.price))}</div>
      `);
      marker.addTo(state.markers);
      bounds.push([item.latitude, item.longitude]);
    });

    if (bounds.length === 1) state.map.setView(bounds[0], 14);
    if (bounds.length > 1) state.map.fitBounds(bounds, { padding: [30, 30] });
    window.setTimeout(() => state.map.invalidateSize(), 50);
  }

  function toggleCompare(id) {
    if (state.compareIds.has(id)) {
      state.compareIds.delete(id);
    } else {
      if (state.compareIds.size >= 3) {
        showToast("You can compare up to three properties.");
        return;
      }
      state.compareIds.add(id);
    }
    renderResults();
    renderCompareTray();
  }

  function renderCompareTray() {
    const count = state.compareIds.size;
    els.compareTray.hidden = count === 0;
    els.compareCount.textContent = `${count} selected`;
  }

  function openComparison() {
    const selected = [...state.compareIds]
      .map(id => state.listings.find(item => item.id === id))
      .filter(Boolean);
    if (selected.length < 2) {
      showToast("Select at least two properties to compare.");
      return;
    }

    const rows = [
      ["Property", item => safeText(item.title)],
      ["Location", item => safeText(item.location)],
      ["Price", item => safeText(peso.format(item.price))],
      ["Type", item => safeText(item.type)],
      ["Bedrooms", item => safeText(getBedroomsLabel(item.bedrooms))],
      ["Bathrooms", item => item.bathrooms == null ? "—" : safeText(item.bathrooms)],
      ["Floor area", item => item.floorArea ? `${safeText(number.format(item.floorArea))} m²` : "—"],
      ["Lot area", item => item.lotArea ? `${safeText(number.format(item.lotArea))} m²` : "—"],
      ["Source", item => safeText(item.sourceName)],
      ["Last seen", item => safeText(formatDate(item.lastSeen))]
    ];

    els.compareTableWrap.innerHTML = `
      <table class="compare-table">
        <tbody>
          ${rows.map(([label, getter]) => `
            <tr>
              <th>${label}</th>
              ${selected.map(item => `<td>${getter(item)}</td>`).join("")}
            </tr>`).join("")}
        </tbody>
      </table>`;
    els.compareDialog.showModal();
  }

  function resetFilters() {
    els.form.reset();
    els.sort.value = "relevance";
    applyFilters();
  }

  function exportCsv() {
    if (!state.filtered.length) {
      showToast("There are no matching results to export.");
      return;
    }
    const headers = ["Title", "Location", "City", "Type", "Price PHP", "Bedrooms", "Bathrooms", "Floor area m2", "Lot area m2", "Source", "Source URL", "Last seen"];
    const rows = state.filtered.map(item => [
      item.title,
      item.location,
      item.city,
      item.type,
      item.price,
      item.bedrooms ?? "",
      item.bathrooms ?? "",
      item.floorArea ?? "",
      item.lotArea ?? "",
      item.sourceName,
      item.sourceUrl,
      item.lastSeen
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cebu-property-results.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyShareLink() {
    writeQueryString();
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Search link copied.");
    } catch {
      showToast("Could not copy automatically. Copy the page URL instead.");
    }
  }

  function setView(view) {
    document.body.classList.toggle("list-view", view === "list");
    document.body.classList.toggle("map-view", view === "map");
    els.listViewBtn.classList.toggle("active", view === "list");
    els.mapViewBtn.classList.toggle("active", view === "map");
    if (view === "map") window.setTimeout(() => state.map?.invalidateSize(), 50);
  }

  function bindEvents() {
    els.form.addEventListener("submit", event => {
      event.preventDefault();
      applyFilters();
    });
    els.form.addEventListener("change", applyFilters);
    els.query.addEventListener("input", () => {
      window.clearTimeout(bindEvents.queryTimer);
      bindEvents.queryTimer = window.setTimeout(applyFilters, 220);
    });
    els.reset.addEventListener("click", resetFilters);
    els.exportBtn.addEventListener("click", exportCsv);
    els.shareBtn.addEventListener("click", copyShareLink);
    els.compareBtn.addEventListener("click", openComparison);
    els.clearCompareBtn.addEventListener("click", () => {
      state.compareIds.clear();
      renderResults();
      renderCompareTray();
    });
    els.closeDialogBtn.addEventListener("click", () => els.compareDialog.close());
    els.listViewBtn.addEventListener("click", () => setView("list"));
    els.mapViewBtn.addEventListener("click", () => setView("map"));
  }

  async function init() {
    try {
      initMap();
      await loadListings();
      populateFilters();
      restoreFromQueryString();
      bindEvents();
      applyFilters();
      setView("list");
    } catch (error) {
      console.error(error);
      els.searchRecap.textContent = "The demo data could not be loaded.";
      showToast("The property data could not be loaded.");
    }
  }

  init();
})();
