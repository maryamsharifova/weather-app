document.addEventListener("DOMContentLoaded", () => {

  // ============================================================
  // ELEMENTS
  // ============================================================

  const $ = (id) => document.getElementById(id);

  const els = {
    cityInput: $("city-input"),
    searchBtn: $("search-btn"),
    locationBtn: $("location-btn"),
    unitToggle: $("unit-toggle"),
    status: $("status"),
    suggestions: $("suggestions"),

    listView: $("list-view"),
    citiesList: $("cities-list"),
    emptyMessage: $("empty-message"),

    detailView: $("detail-view"),
    backBtn: $("back-btn"),
    saveBtn: $("save-btn"),

    location: $("location-value"),
    locationSub: $("location-sub"),
    temp: $("temp-value"),
    icon: $("weather-icon"),
    condition: $("condition-text"),
    hilo: $("hilo-value"),
    alerts: $("alerts"),

    hourlyRow: $("hourly-row"),
    dailyList: $("daily-list"),
    detailsGrid: $("details-grid"),

    canvas: $("weather-canvas")
  };

  const missing = Object.keys(els).filter((key) => !els[key]);

  if (missing.length) {
    console.error("Weather App: missing HTML elements:", missing.join(", "));
    return;
  }


  // ============================================================
  // CONSTANTS
  // ============================================================

  const API = {
    forecast: "https://api.open-meteo.com/v1/forecast",
    geocode: "https://geocoding-api.open-meteo.com/v1/search",
    air: "https://air-quality-api.open-meteo.com/v1/air-quality"
  };

  const STORAGE = {
    cities: "weatherApp.savedCities",
    unit: "weatherApp.unit",
    cachePrefix: "weatherApp.cache."
  };

  const UNITS = ["celsius", "fahrenheit"];
  const LIST_CACHE_MS = 5 * 60 * 1000;     // reuse list data for 5 min
  const AUTO_REFRESH_MS = 10 * 60 * 1000;  // refresh every 10 min


  // ============================================================
  // STATE
  // ============================================================

  let currentPlace = null;
  let currentSuggestions = [];
  let activeSuggestionIndex = -1;

  // Request IDs make sure only the newest response is used
  let suggestionRequestId = 0;
  let weatherRequestId = 0;
  let listRenderId = 0;

  let unit = loadUnit();

  const summaryCache = new Map();


  // ============================================================
  // WEATHER CODES (full WMO list used by Open-Meteo)
  // ============================================================

  const WEATHER_CODES = {
    0:  { text: "Clear Sky",               icon: "☀️", nightIcon: "🌙", theme: "sunny" },
    1:  { text: "Mainly Clear",            icon: "🌤️", nightIcon: "🌙", theme: "sunny" },
    2:  { text: "Partly Cloudy",           icon: "⛅", nightIcon: "☁️", theme: "cloudy" },
    3:  { text: "Overcast",                icon: "☁️", theme: "cloudy" },
    45: { text: "Fog",                     icon: "🌫️", theme: "cloudy" },
    48: { text: "Rime Fog",                icon: "🌫️", theme: "cloudy" },
    51: { text: "Light Drizzle",           icon: "🌦️", nightIcon: "🌧️", theme: "rain" },
    53: { text: "Drizzle",                 icon: "🌦️", nightIcon: "🌧️", theme: "rain" },
    55: { text: "Dense Drizzle",           icon: "🌧️", theme: "rain" },
    56: { text: "Light Freezing Drizzle",  icon: "🌧️", theme: "rain" },
    57: { text: "Freezing Drizzle",        icon: "🌧️", theme: "rain" },
    61: { text: "Slight Rain",             icon: "🌧️", theme: "rain" },
    63: { text: "Rain",                    icon: "🌧️", theme: "rain" },
    65: { text: "Heavy Rain",              icon: "🌧️", theme: "rain" },
    66: { text: "Light Freezing Rain",     icon: "🌧️", theme: "rain" },
    67: { text: "Freezing Rain",           icon: "🌧️", theme: "rain" },
    71: { text: "Slight Snow",             icon: "🌨️", theme: "snow" },
    73: { text: "Snow",                    icon: "🌨️", theme: "snow" },
    75: { text: "Heavy Snow",              icon: "❄️", theme: "snow" },
    77: { text: "Snow Grains",             icon: "🌨️", theme: "snow" },
    80: { text: "Rain Showers",            icon: "🌦️", nightIcon: "🌧️", theme: "rain" },
    81: { text: "Moderate Showers",        icon: "🌧️", theme: "rain" },
    82: { text: "Violent Showers",         icon: "⛈️", theme: "storm" },
    85: { text: "Snow Showers",            icon: "🌨️", theme: "snow" },
    86: { text: "Heavy Snow Showers",      icon: "❄️", theme: "snow" },
    95: { text: "Thunderstorm",            icon: "⛈️", theme: "storm" },
    96: { text: "Thunderstorm with Hail",  icon: "⛈️", theme: "storm" },
    99: { text: "Severe Thunderstorm",     icon: "⛈️", theme: "storm" }
  };

  const UNKNOWN_WEATHER = { text: "Unknown", icon: "❓", theme: "sunny" };

  function getWeatherInfo(code, isDay = true) {
    const info = WEATHER_CODES[code] || UNKNOWN_WEATHER;

    if (!isDay && info.nightIcon) {
      return { ...info, icon: info.nightIcon };
    }

    return info;
  }


  // ============================================================
  // SMALL HELPERS
  // ============================================================

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function setStatus(message) {
    els.status.textContent = message;
  }

  function setBusy(isBusy) {
    els.searchBtn.disabled = isBusy;
    els.locationBtn.disabled = isBusy;
  }

  function debounce(fn, delay) {
    let timeout;

    const debounced = (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };

    debounced.cancel = () => clearTimeout(timeout);

    return debounced;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function round(value) {
    return Number.isFinite(value) ? Math.round(value) : "--";
  }

  function isDetailOpen() {
    return !els.detailView.classList.contains("hidden");
  }


  // ============================================================
  // LOCAL STORAGE (always wrapped in try/catch)
  // ============================================================

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn("Storage write failed:", error);
      return false;
    }
  }

  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  function loadUnit() {
    try {
      const saved = localStorage.getItem(STORAGE.unit);
      return UNITS.includes(saved) ? saved : "celsius";
    } catch {
      return "celsius";
    }
  }

  function loadSavedCities() {
    const cities = readJSON(STORAGE.cities, []);

    if (!Array.isArray(cities)) {
      return [];
    }

    return cities.map((city) => ({ pinned: false, ...city }));
  }

  function saveSavedCities(cities) {
    writeJSON(STORAGE.cities, cities);
  }

  function sortCities(cities) {
    return [...cities].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }


  // ============================================================
  // UNITS
  // ============================================================

  const isFahrenheit = () => unit === "fahrenheit";
  const windUnitLabel = () => (isFahrenheit() ? "mph" : "km/h");

  function updateUnitToggle() {
    els.unitToggle.querySelectorAll(".unit-btn").forEach((button) => {
      const active = button.dataset.unit === unit;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function setUnit(newUnit) {
    if (newUnit === unit || !UNITS.includes(newUnit)) {
      return;
    }

    unit = newUnit;

    try {
      localStorage.setItem(STORAGE.unit, unit);
    } catch {
      // ignore
    }

    updateUnitToggle();

    if (isDetailOpen() && currentPlace) {
      openPlace(currentPlace, { keepScroll: true });
    } else {
      renderCitiesList();
    }
  }


  // ============================================================
  // FORMATTING
  // ============================================================

  function formatHourLabel(time, index) {
    if (index === 0) {
      return "Now";
    }

    const hour = parseInt(time.slice(11, 13), 10);
    return `${hour % 12 || 12}${hour >= 12 ? "PM" : "AM"}`;
  }

  function formatClock(time) {
    if (!time) {
      return "--";
    }

    const hour = parseInt(time.slice(11, 13), 10);
    const minutes = time.slice(14, 16);
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? "PM" : "AM"}`;
  }

  function formatDayLabel(dateString, index) {
    if (index === 0) {
      return "Today";
    }

    const [year, month, day] = dateString.split("-").map(Number);

    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      weekday: "short"
    });
  }

  function formatLocalTime(offsetSeconds) {
    if (!Number.isFinite(offsetSeconds)) {
      return "--:--";
    }

    const date = new Date(Date.now() + offsetSeconds * 1000);
    const hours = date.getUTCHours();
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");

    return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
  }

  function timeAgo(timestamp) {
    const minutes = Math.round((Date.now() - timestamp) / 60000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;

    return `${Math.round(hours / 24)} d ago`;
  }

  function windDirection(degrees) {
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return directions[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
  }

  function uvLevel(uv) {
    if (!Number.isFinite(uv)) return "";
    if (uv < 3) return "Low";
    if (uv < 6) return "Moderate";
    if (uv < 8) return "High";
    if (uv < 11) return "Very high";
    return "Extreme";
  }

  function aqiLevel(aqi) {
    if (aqi <= 50) return "Good";
    if (aqi <= 100) return "Moderate";
    if (aqi <= 150) return "Unhealthy for sensitive groups";
    if (aqi <= 200) return "Unhealthy";
    if (aqi <= 300) return "Very unhealthy";
    return "Hazardous";
  }

  function countryFlag(code) {
    if (!code || code.length !== 2) {
      return "";
    }

    return String.fromCodePoint(
      ...[...code.toUpperCase()].map((char) => 127397 + char.charCodeAt(0))
    );
  }

  function placeRegion(place) {
    return [place.admin1, place.country].filter(Boolean).join(", ");
  }


  // ============================================================
  // PLACES
  // ============================================================

  function isSamePlace(a, b) {
    return (
      Math.round(a.latitude * 100) === Math.round(b.latitude * 100) &&
      Math.round(a.longitude * 100) === Math.round(b.longitude * 100)
    );
  }

  function normalizePlace(place) {
    return {
      name: place.name,
      admin1: place.admin1 || "",
      country: place.country || "",
      country_code: place.country_code || "",
      latitude: Number(place.latitude),
      longitude: Number(place.longitude)
    };
  }


  // ============================================================
  // API
  // ============================================================

  async function fetchJSON(url) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    return response.json();
  }

  function buildForecastURL(place) {
    const params = new URLSearchParams({
      latitude: place.latitude,
      longitude: place.longitude,
      current: [
        "temperature_2m",
        "apparent_temperature",
        "relative_humidity_2m",
        "is_day",
        "weather_code",
        "wind_speed_10m",
        "wind_direction_10m",
        "pressure_msl"
      ].join(","),
      hourly: [
        "temperature_2m",
        "weather_code",
        "precipitation_probability",
        "is_day",
        "uv_index",
        "visibility"
      ].join(","),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "sunrise",
        "sunset",
        "precipitation_probability_max",
        "uv_index_max"
      ].join(","),
      timezone: "auto",
      forecast_days: 7,
      temperature_unit: unit,
      wind_speed_unit: isFahrenheit() ? "mph" : "kmh"
    });

    return `${API.forecast}?${params}`;
  }

  function cacheKey(place, forUnit = unit) {
    return (
      `${STORAGE.cachePrefix}${forUnit}.` +
      `${Number(place.latitude).toFixed(2)},${Number(place.longitude).toFixed(2)}`
    );
  }

  // Tries the network first; falls back to the last saved copy when offline
  async function getForecast(place) {
    const key = cacheKey(place);

    try {
      const data = await fetchJSON(buildForecastURL(place));
      writeJSON(key, { savedAt: Date.now(), data });
      return { data, cached: false };

    } catch (error) {
      const cached = readJSON(key, null);

      if (cached && cached.data) {
        return { data: cached.data, cached: true, savedAt: cached.savedAt };
      }

      throw error;
    }
  }

  // Air quality is optional, so this never throws
  async function getAirQuality(place) {
    const params = new URLSearchParams({
      latitude: place.latitude,
      longitude: place.longitude,
      current: "us_aqi,pm2_5",
      timezone: "auto"
    });

    try {
      const data = await fetchJSON(`${API.air}?${params}`);
      return data.current || null;
    } catch {
      return null;
    }
  }

  async function geocode(query, count) {
    const params = new URLSearchParams({
      name: query,
      count,
      language: "en",
      format: "json"
    });

    const data = await fetchJSON(`${API.geocode}?${params}`);
    return Array.isArray(data.results) ? data.results : [];
  }

  function removeCachedForecasts(place) {
    UNITS.forEach((u) => {
      const key = cacheKey(place, u);
      removeKey(key);
      summaryCache.delete(key);
    });
  }


  // ============================================================
  // ANIMATED RAIN / SNOW
  // ============================================================

  const weatherFX = (() => {
    const canvas = els.canvas;
    const ctx = canvas.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let mode = null;
    let particles = [];
    let frame = null;
    let width = 0;
    let height = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function createParticle(randomY) {
      if (mode === "rain") {
        return {
          x: Math.random() * (width + 60),
          y: randomY ? Math.random() * height : -30,
          length: 10 + Math.random() * 14,
          speed: 9 + Math.random() * 7,
          opacity: 0.15 + Math.random() * 0.3
        };
      }

      return {
        x: Math.random() * width,
        y: randomY ? Math.random() * height : -10,
        radius: 1.5 + Math.random() * 2.5,
        speed: 0.6 + Math.random() * 1.2,
        drift: Math.random() * Math.PI * 2,
        opacity: 0.4 + Math.random() * 0.5
      };
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        if (mode === "rain") {
          ctx.strokeStyle = `rgba(200, 225, 255, ${p.opacity})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - 2, p.y + p.length);
          ctx.stroke();
          p.y += p.speed;
          p.x -= 0.6;
        } else {
          p.drift += 0.01;
          p.y += p.speed;
          p.x += Math.sin(p.drift) * 0.5;
          ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        if (p.y > height + 30 || p.x < -30 || p.x > width + 60) {
          Object.assign(p, createParticle(false));
        }
      }

      frame = requestAnimationFrame(draw);
    }

    function set(newMode) {
      if (!ctx || reduceMotion.matches) {
        newMode = null;
      }

      if (newMode === mode) {
        return;
      }

      mode = newMode;
      cancelAnimationFrame(frame);
      frame = null;
      ctx && ctx.clearRect(0, 0, width, height);

      if (!mode) {
        particles = [];
        return;
      }

      resize();

      const count = mode === "rain"
        ? Math.min(160, Math.floor(width / 6))
        : Math.min(120, Math.floor(width / 8));

      particles = Array.from({ length: count }, () => createParticle(true));
      draw();
    }

    window.addEventListener("resize", () => {
      if (mode) resize();
    });

    return { set };
  })();


  // ============================================================
  // THEME
  // ============================================================

  function applyTheme(info, isDay) {
    document.body.className = isDay ? `theme-${info.theme}` : "theme-night";

    if (info.theme === "rain" || info.theme === "storm") {
      weatherFX.set("rain");
    } else if (info.theme === "snow") {
      weatherFX.set("snow");
    } else {
      weatherFX.set(null);
    }
  }

  function applyHomeTheme() {
    document.body.className = "theme-sunny";
    weatherFX.set(null);
  }


  // ============================================================
  // SCREENS
  // ============================================================

  function showListView() {
    weatherRequestId++; // cancel any detail request still loading
    setBusy(false);

    els.detailView.classList.add("hidden");
    els.listView.classList.remove("hidden");

    applyHomeTheme();
    setStatus("");
    renderCitiesList();
  }

  function showDetailView(scrollToTop) {
    els.listView.classList.add("hidden");
    els.detailView.classList.remove("hidden");

    if (scrollToTop) {
      window.scrollTo({ top: 0 });
    }
  }


  // ============================================================
  // SAVED CITIES LIST
  // ============================================================

  function summarize(data, cached) {
    const current = data.current;
    const isDay = current.is_day === 1;
    const info = getWeatherInfo(current.weather_code, isDay);

    return {
      temperature: current.temperature_2m,
      condition: info.text,
      icon: info.icon,
      theme: isDay ? info.theme : "night",
      offset: data.utc_offset_seconds,
      high: data.daily.temperature_2m_max[0],
      low: data.daily.temperature_2m_min[0],
      cached
    };
  }

  async function getCitySummary(place) {
    const key = cacheKey(place);
    const hit = summaryCache.get(key);

    if (hit && Date.now() - hit.time < LIST_CACHE_MS) {
      return hit.summary;
    }

    try {
      const { data, cached } = await getForecast(place);
      const summary = summarize(data, cached);

      // Offline data gets time 0 so it is refetched next time
      summaryCache.set(key, { time: cached ? 0 : Date.now(), summary });

      return summary;

    } catch (error) {
      console.error("Saved city weather error:", error);
      return null;
    }
  }

  async function renderCitiesList() {
    const renderId = ++listRenderId;
    const saved = sortCities(loadSavedCities());

    if (saved.length === 0) {
      els.citiesList.innerHTML = "";
      els.emptyMessage.classList.remove("hidden");
      return;
    }

    els.emptyMessage.classList.add("hidden");

    // Loading placeholders on first render
    if (els.citiesList.children.length === 0) {
      els.citiesList.innerHTML = saved
        .map(() => `<div class="city-row skeleton" aria-hidden="true"></div>`)
        .join("");
    }

    // Fetch all cities at the same time
    const summaries = await Promise.all(saved.map(getCitySummary));

    // A newer render started while we were waiting, so drop this one
    if (renderId !== listRenderId) {
      return;
    }

    els.citiesList.innerHTML = "";

    saved.forEach((place, index) => {
      els.citiesList.appendChild(createCityCard(place, summaries[index]));
    });
  }

  function createCityCard(place, summary) {
    const wrapper = document.createElement("div");
    wrapper.className = "city-row-wrapper";

    // ---------- card ----------

    const row = document.createElement("div");
    row.className = `city-row row-${summary ? summary.theme : "unavailable"}`;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Open weather for ${place.name}`);

    const region = place.country || place.admin1 || "";
    const localTime = summary ? formatLocalTime(summary.offset) : "--:--";

    row.innerHTML = `
      <div class="row-left">
        <span class="city-name">
          ${escapeHTML(place.name)}${place.pinned ? ` <span class="pin-mark" title="Pinned">📌</span>` : ""}
        </span>

        <span class="city-time">
          ${localTime}${region ? ` · ${escapeHTML(region)}` : ""}
        </span>

        <span class="city-subtitle">
          ${summary ? `${summary.icon} ${escapeHTML(summary.condition)}` : "Weather unavailable"}${summary && summary.cached ? " · offline" : ""}
        </span>
      </div>

      <div class="row-right">
        <span class="city-temp">
          ${summary ? `${round(summary.temperature)}°` : "--"}
        </span>

        <span class="city-hilo">
          ${summary ? `H:${round(summary.high)}° L:${round(summary.low)}°` : ""}
        </span>
      </div>
    `;

    // ---------- actions ----------

    const actions = document.createElement("div");
    actions.className = "row-actions";

    actions.innerHTML = `
      <button class="action-btn pin-btn ${place.pinned ? "pinned" : ""}" type="button">
        <span class="action-icon" aria-hidden="true">📌</span>
        ${place.pinned ? "Unpin" : "Pin"}
      </button>

      <button class="action-btn delete-btn" type="button">
        <span class="action-icon" aria-hidden="true">🗑️</span>
        Delete
      </button>
    `;

    wrapper.appendChild(row);
    wrapper.appendChild(actions);

    // ---------- events ----------

    enableSwipe(wrapper);

    row.addEventListener("click", () => {
      // Tapping an open card closes it instead of opening the city
      if (wrapper.dataset.justDragged === "true") {
        return;
      }

      if (isSwipeOpen(wrapper)) {
        closeSwipe(wrapper);
        return;
      }

      openPlace(place);
    });

    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPlace(place);
      }
    });

    actions.querySelector(".pin-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      togglePin(place);
    });

    actions.querySelector(".delete-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteCity(place, wrapper);
    });

    return wrapper;
  }

  // ============================================================
  // SWIPE TO REVEAL PIN / DELETE
  // ============================================================

  let openSwipeWrapper = null;

  function isSwipeOpen(wrapper) {
    return wrapper.scrollLeft > 8;
  }

  function closeSwipe(wrapper, smooth = true) {
    wrapper.scrollTo({ left: 0, behavior: smooth ? "smooth" : "auto" });

    if (openSwipeWrapper === wrapper) {
      openSwipeWrapper = null;
    }
  }

  function enableSwipe(wrapper) {

    // Only one card open at a time
    wrapper.addEventListener("scroll", () => {
      if (isSwipeOpen(wrapper)) {
        if (openSwipeWrapper && openSwipeWrapper !== wrapper && openSwipeWrapper.isConnected) {
          closeSwipe(openSwipeWrapper);
        }
        openSwipeWrapper = wrapper;
      } else if (openSwipeWrapper === wrapper) {
        openSwipeWrapper = null;
      }
    }, { passive: true });

    // Touch screens and trackpads scroll natively.
    // This adds click-and-drag for mouse users.
    let startX = 0;
    let startScroll = 0;
    let pressed = false;
    let moved = false;

    wrapper.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if (event.target.closest(".action-btn")) return;

      pressed = true;
      moved = false;
      startX = event.clientX;
      startScroll = wrapper.scrollLeft;
    });

    wrapper.addEventListener("pointermove", (event) => {
      if (!pressed) return;

      const dx = event.clientX - startX;

      if (!moved && Math.abs(dx) > 5) {
        moved = true;
        wrapper.classList.add("dragging");
        wrapper.setPointerCapture(event.pointerId);
      }

      if (moved) {
        wrapper.scrollLeft = startScroll - dx;
      }
    });

    const endDrag = () => {
      if (!pressed) return;
      pressed = false;

      if (!moved) return;

      wrapper.classList.remove("dragging");

      // Snap open if dragged past half of the buttons, otherwise close
      const actionsWidth = wrapper.scrollWidth - wrapper.clientWidth;
      const open = wrapper.scrollLeft > actionsWidth / 2;

      wrapper.scrollTo({ left: open ? actionsWidth : 0, behavior: "smooth" });

      // Stop the click that follows a drag from opening the city
      wrapper.dataset.justDragged = "true";
      setTimeout(() => delete wrapper.dataset.justDragged, 0);
    };

    wrapper.addEventListener("pointerup", endDrag);
    wrapper.addEventListener("pointercancel", endDrag);
  }

  // Tapping anywhere else closes the open card
  document.addEventListener("pointerdown", (event) => {
    if (
      openSwipeWrapper &&
      openSwipeWrapper.isConnected &&
      !openSwipeWrapper.contains(event.target)
    ) {
      closeSwipe(openSwipeWrapper);
    }
  });


  function togglePin(place) {
    const updated = loadSavedCities().map((city) =>
      isSamePlace(city, place) ? { ...city, pinned: !city.pinned } : city
    );

    saveSavedCities(updated);
    renderCitiesList();
  }

  function deleteCity(place, wrapper) {
    const updated = loadSavedCities().filter((city) => !isSamePlace(city, place));

    saveSavedCities(updated);
    removeCachedForecasts(place);

    wrapper.remove(); // remove instantly, then re-render
    renderCitiesList();
  }


  // ============================================================
  // DETAIL VIEW RENDERING
  // ============================================================

  function findCurrentHourIndex(data) {
    const prefix = data.current.time.slice(0, 13);
    const index = data.hourly.time.findIndex((time) => time.startsWith(prefix));
    return index === -1 ? 0 : index;
  }

  function renderDetail(place, data, air) {
    const start = findCurrentHourIndex(data);
    const current = data.current;
    const isDay = current.is_day === 1;
    const info = getWeatherInfo(current.weather_code, isDay);

    applyTheme(info, isDay);

    renderCurrent(place, data, info);
    renderAlerts(data);
    renderHourly(data, start);
    renderDaily(data.daily, current.temperature_2m);
    renderDetails(data, start, air);
  }

  function renderCurrent(place, data, info) {
    const flag = countryFlag(place.country_code);

    els.location.textContent = place.name;

    els.locationSub.textContent = [
      [flag, placeRegion(place)].filter(Boolean).join(" "),
      `${formatLocalTime(data.utc_offset_seconds)} local time`
    ].filter(Boolean).join(" · ");

    els.temp.textContent = round(data.current.temperature_2m);
    els.icon.textContent = info.icon;
    els.condition.textContent = info.text;

    els.hilo.textContent =
      `H:${round(data.daily.temperature_2m_max[0])}°  ` +
      `L:${round(data.daily.temperature_2m_min[0])}°`;
  }


  // ---------- alerts ----------

  function buildAlerts(data) {
    const alerts = [];
    const daily = data.daily;
    const current = data.current;

    const hot = isFahrenheit() ? 95 : 35;
    const cold = isFahrenheit() ? 14 : -10;
    const windy = isFahrenheit() ? 31 : 50;

    const dayName = (i) => (i === 0 ? "today" : `on ${formatDayLabel(daily.time[i], i)}`);

    const stormDay = daily.weather_code.findIndex((code) => [95, 96, 99].includes(code));
    if (stormDay !== -1) {
      alerts.push({ icon: "⛈️", text: `Thunderstorms expected ${dayName(stormDay)}.` });
    }

    const snowDay = daily.weather_code.findIndex((code) => [75, 86].includes(code));
    if (snowDay !== -1) {
      alerts.push({ icon: "❄️", text: `Heavy snow expected ${dayName(snowDay)}.` });
    }

    const hotDay = daily.temperature_2m_max.findIndex((t) => t >= hot);
    if (hotDay !== -1) {
      alerts.push({
        icon: "🔥",
        text: `Extreme heat ${dayName(hotDay)}, up to ${round(daily.temperature_2m_max[hotDay])}°.`
      });
    }

    const coldDay = daily.temperature_2m_min.findIndex((t) => t <= cold);
    if (coldDay !== -1) {
      alerts.push({
        icon: "🥶",
        text: `Extreme cold ${dayName(coldDay)}, down to ${round(daily.temperature_2m_min[coldDay])}°.`
      });
    }

    if (current.wind_speed_10m >= windy) {
      alerts.push({
        icon: "💨",
        text: `Strong winds right now: ${round(current.wind_speed_10m)} ${windUnitLabel()}.`
      });
    }

    return alerts;
  }

  function renderAlerts(data) {
    const alerts = buildAlerts(data);

    if (alerts.length === 0) {
      els.alerts.classList.add("hidden");
      els.alerts.innerHTML = "";
      return;
    }

    els.alerts.innerHTML = alerts
      .map((alert) => `
        <div class="alert-item">
          <span class="alert-icon" aria-hidden="true">${alert.icon}</span>
          <span>${escapeHTML(alert.text)}</span>
        </div>
      `)
      .join("");

    els.alerts.classList.remove("hidden");
  }


  // ---------- hourly ----------

  function renderHourly(data, start) {
    const hourly = data.hourly;
    const end = Math.min(start + 24, hourly.time.length);
    const items = [];

    for (let i = start; i < end; i++) {
      const info = getWeatherInfo(hourly.weather_code[i], hourly.is_day[i] === 1);
      const rain = hourly.precipitation_probability ? hourly.precipitation_probability[i] : null;

      items.push(`
        <div class="hour-item ${i === start ? "now" : ""}">
          <span class="hour-label">${formatHourLabel(hourly.time[i], i - start)}</span>
          <span class="hour-icon" aria-hidden="true">${info.icon}</span>
          <span class="hour-rain">${rain >= 20 ? `${rain}%` : ""}</span>
          <span class="hour-temp">${round(hourly.temperature_2m[i])}°</span>
        </div>
      `);
    }

    els.hourlyRow.innerHTML = items.join("");
    els.hourlyRow.scrollLeft = 0;
  }


  // ---------- daily ----------

  function renderDaily(daily, currentTemp) {
    const lows = daily.temperature_2m_min;
    const highs = daily.temperature_2m_max;

    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const range = max - min || 1;

    els.dailyList.innerHTML = daily.time
      .map((date, index) => {
        const info = getWeatherInfo(daily.weather_code[index]);
        const low = lows[index];
        const high = highs[index];

        const width = Math.max(((high - low) / range) * 100, 8);
        let left = ((low - min) / range) * 100;
        if (left + width > 100) left = 100 - width;

        const rain = daily.precipitation_probability_max
          ? daily.precipitation_probability_max[index]
          : null;

        // White dot showing the current temperature on today's bar
        const dot =
          index === 0 && Number.isFinite(currentTemp)
            ? `<span class="day-bar-dot" style="left:${clamp(((currentTemp - min) / range) * 100, 0, 100)}%"></span>`
            : "";

        return `
          <div class="day-row">
            <span class="day-name">${formatDayLabel(date, index)}</span>

            <span class="day-icon">
              <span aria-hidden="true">${info.icon}</span>
              ${rain >= 20 ? `<small class="day-rain">${rain}%</small>` : ""}
            </span>

            <span class="day-low">${round(low)}°</span>

            <span class="day-bar-track">
              <span class="day-bar-fill" style="left:${left}%; width:${width}%;"></span>
              ${dot}
            </span>

            <span class="day-high">${round(high)}°</span>
          </div>
        `;
      })
      .join("");
  }


  // ---------- details grid ----------

  function detailTile(icon, label, value, note = "") {
    return `
      <div class="detail-tile">
        <div class="tile-label"><span aria-hidden="true">${icon}</span> ${label}</div>
        <div class="tile-value">${value}</div>
        ${note ? `<div class="tile-note">${escapeHTML(note)}</div>` : ""}
      </div>
    `;
  }

  function formatVisibility(data, index) {
    const value = data.hourly.visibility ? data.hourly.visibility[index] : null;

    if (!Number.isFinite(value)) {
      return { text: "--", note: "" };
    }

    const units = data.hourly_units && data.hourly_units.visibility;
    const meters = units === "ft" ? value * 0.3048 : value;

    const amount = isFahrenheit() ? meters / 1609.34 : meters / 1000;
    const label = isFahrenheit() ? "mi" : "km";
    const text = `${amount >= 10 ? Math.round(amount) : amount.toFixed(1)} ${label}`;

    let note = "Poor visibility";
    if (meters >= 10000) note = "Clear view";
    else if (meters >= 4000) note = "Slightly hazy";

    return { text, note };
  }

  function renderDetails(data, start, air) {
    const current = data.current;
    const daily = data.daily;
    const tiles = [];

    // Air quality
    if (air && Number.isFinite(air.us_aqi)) {
      tiles.push(detailTile("🍃", "Air quality", round(air.us_aqi), aqiLevel(air.us_aqi)));
    }

    // UV index
    const uv = data.hourly.uv_index ? data.hourly.uv_index[start] : null;
    const uvMax = daily.uv_index_max ? daily.uv_index_max[0] : null;
    tiles.push(detailTile(
      "🔆",
      "UV index",
      round(uv),
      [uvLevel(uv), Number.isFinite(uvMax) ? `Max today ${round(uvMax)}` : ""].filter(Boolean).join(" · ")
    ));

    // Feels like
    const diff = current.apparent_temperature - current.temperature_2m;
    let feelsNote = "Similar to the actual temperature";
    if (diff >= 2) feelsNote = "Feels warmer than it is";
    if (diff <= -2) feelsNote = "Feels cooler than it is";
    tiles.push(detailTile("🌡️", "Feels like", `${round(current.apparent_temperature)}°`, feelsNote));

    // Humidity
    const humidity = current.relative_humidity_2m;
    let humidityNote = "Humid";
    if (humidity < 30) humidityNote = "Dry";
    else if (humidity < 60) humidityNote = "Comfortable";
    tiles.push(detailTile("💧", "Humidity", `${round(humidity)}%`, humidityNote));

    // Wind
    tiles.push(detailTile(
      "💨",
      "Wind",
      `${round(current.wind_speed_10m)} ${windUnitLabel()}`,
      Number.isFinite(current.wind_direction_10m)
        ? `From the ${windDirection(current.wind_direction_10m)}`
        : ""
    ));

    // Rain chance
    const rainToday = daily.precipitation_probability_max
      ? daily.precipitation_probability_max[0]
      : null;
    tiles.push(detailTile(
      "☔",
      "Rain chance",
      Number.isFinite(rainToday) ? `${rainToday}%` : "--",
      "Highest chance today"
    ));

    // Sunrise / sunset
    tiles.push(detailTile("🌅", "Sunrise", formatClock(daily.sunrise && daily.sunrise[0])));
    tiles.push(detailTile("🌇", "Sunset", formatClock(daily.sunset && daily.sunset[0])));

    // Visibility
    const visibility = formatVisibility(data, start);
    tiles.push(detailTile("👁️", "Visibility", visibility.text, visibility.note));

    // Pressure
    const pressure = current.pressure_msl;
    tiles.push(detailTile(
      "🧭",
      "Pressure",
      Number.isFinite(pressure)
        ? (isFahrenheit() ? `${(pressure * 0.02953).toFixed(2)} inHg` : `${round(pressure)} hPa`)
        : "--"
    ));

    els.detailsGrid.innerHTML = tiles.join("");
  }


  // ============================================================
  // OPEN A PLACE (used by search, suggestions, cards, location)
  // ============================================================

  async function openPlace(place, { silent = false, keepScroll = false } = {}) {
    const requestId = ++weatherRequestId;
    const target = normalizePlace(place);

    if (!silent) {
      setBusy(true);
      setStatus("Loading weather…");
    }

    try {
      const [forecast, air] = await Promise.all([
        getForecast(target),
        getAirQuality(target)
      ]);

      // User already moved on to something else
      if (requestId !== weatherRequestId) {
        return;
      }

      currentPlace = target;

      renderDetail(target, forecast.data, air);
      updateSaveButton();
      showDetailView(!silent && !keepScroll);

      setStatus(
        forecast.cached
          ? `You're offline. Showing data from ${timeAgo(forecast.savedAt)}.`
          : ""
      );

    } catch (error) {
      if (requestId !== weatherRequestId) {
        return;
      }

      console.error("Weather error:", error);

      if (!silent) {
        setStatus("Unable to load weather. Check your connection and try again.");
      }

    } finally {
      if (requestId === weatherRequestId && !silent) {
        setBusy(false);
      }
    }
  }


  // ============================================================
  // SEARCH
  // ============================================================

  async function getWeather() {
    const query = els.cityInput.value.trim();

    // Stop any pending suggestions from popping up after the search
    debouncedSuggestions.cancel();
    suggestionRequestId++;
    hideSuggestions();

    if (!query) {
      setStatus("Enter a city name to search.");
      els.cityInput.focus();
      return;
    }

    setBusy(true);
    setStatus("Searching…");

    try {
      const results = await geocode(query, 1);

      if (results.length === 0) {
        setStatus(`No city found for "${query}". Check the spelling and try again.`);
        setBusy(false);
        return;
      }

      await openPlace(results[0]);

    } catch (error) {
      console.error("Search error:", error);
      setStatus("Connection error. Check your internet and try again.");
      setBusy(false);
    }
  }


  // ============================================================
  // MY LOCATION
  // ============================================================

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setStatus("Your browser doesn't support location.");
      return;
    }

    setBusy(true);
    setStatus("Finding your location…");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        openPlace({
          name: "My Location",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error) => {
        setBusy(false);
        setStatus(
          error.code === error.PERMISSION_DENIED
            ? "Location access is blocked. Allow it in your browser settings."
            : "Couldn't get your location. Try searching instead."
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 }
    );
  }


  // ============================================================
  // SAVE BUTTON
  // ============================================================

  function updateSaveButton() {
    if (!currentPlace) {
      return;
    }

    const exists = loadSavedCities().some((city) => isSamePlace(city, currentPlace));

    els.saveBtn.textContent = exists ? "★" : "☆";
    els.saveBtn.classList.toggle("saved", exists);
    els.saveBtn.setAttribute("aria-label", exists ? "Remove from saved cities" : "Save city");
    els.saveBtn.title = exists ? "Remove from saved cities" : "Save city";
  }

  function toggleSaveCurrentCity() {
    if (!currentPlace) {
      return;
    }

    let saved = loadSavedCities();
    const exists = saved.some((city) => isSamePlace(city, currentPlace));

    if (exists) {
      saved = saved.filter((city) => !isSamePlace(city, currentPlace));
    } else {
      saved.push({ ...currentPlace, pinned: false });
    }

    saveSavedCities(saved);
    updateSaveButton();
  }


  // ============================================================
  // SUGGESTIONS
  // ============================================================

  async function fetchSuggestions(query) {
    const text = query.trim();
    const requestId = ++suggestionRequestId;

    if (text.length < 2) {
      hideSuggestions();
      return;
    }

    try {
      const results = await geocode(text, 6);

      if (requestId !== suggestionRequestId) {
        return;
      }

      currentSuggestions = results;
      renderSuggestions();

    } catch (error) {
      console.error("Suggestion error:", error);

      if (requestId === suggestionRequestId) {
        hideSuggestions();
      }
    }
  }

  const debouncedSuggestions = debounce(fetchSuggestions, 300);

  function renderSuggestions() {
    activeSuggestionIndex = -1;
    els.cityInput.removeAttribute("aria-activedescendant");

    if (currentSuggestions.length === 0) {
      els.suggestions.innerHTML = `<div class="suggestion-empty">No matching cities</div>`;
    } else {
      els.suggestions.innerHTML = currentSuggestions
        .map((place, index) => `
          <div
            class="suggestion-item"
            id="suggestion-${index}"
            role="option"
            aria-selected="false"
            data-index="${index}"
          >
            <span class="suggestion-left">
              <span class="suggestion-flag" aria-hidden="true">${countryFlag(place.country_code)}</span>
              <span class="suggestion-name">${escapeHTML(place.name)}</span>
            </span>
            <span class="suggestion-region">${escapeHTML(placeRegion(place))}</span>
          </div>
        `)
        .join("");
    }

    els.suggestions.classList.remove("hidden");
    els.cityInput.setAttribute("aria-expanded", "true");
  }

  function setActiveSuggestion(index) {
    const items = els.suggestions.querySelectorAll(".suggestion-item");

    items.forEach((item, i) => {
      const active = i === index;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));

      if (active) {
        item.scrollIntoView({ block: "nearest" });
      }
    });

    activeSuggestionIndex = index;

    if (index >= 0) {
      els.cityInput.setAttribute("aria-activedescendant", `suggestion-${index}`);
    } else {
      els.cityInput.removeAttribute("aria-activedescendant");
    }
  }

  function hideSuggestions() {
    els.suggestions.classList.add("hidden");
    els.suggestions.innerHTML = "";
    els.cityInput.setAttribute("aria-expanded", "false");
    els.cityInput.removeAttribute("aria-activedescendant");

    currentSuggestions = [];
    activeSuggestionIndex = -1;
  }

  function selectSuggestion(index) {
    const place = currentSuggestions[index];

    if (!place) {
      return;
    }

    els.cityInput.value = place.name;
    hideSuggestions();
    openPlace(place);
  }

  function suggestionsOpen() {
    return (
      !els.suggestions.classList.contains("hidden") &&
      currentSuggestions.length > 0
    );
  }


  // ============================================================
  // EVENT LISTENERS
  // ============================================================

  els.searchBtn.addEventListener("click", getWeather);

  els.locationBtn.addEventListener("click", useMyLocation);

  els.cityInput.addEventListener("input", () => {
    debouncedSuggestions(els.cityInput.value);
  });

  // Keyboard: arrows move through suggestions, Enter selects, Escape closes
  els.cityInput.addEventListener("keydown", (event) => {
    const open = suggestionsOpen();
    const count = currentSuggestions.length;

    switch (event.key) {
      case "ArrowDown":
        if (!open) return;
        event.preventDefault();
        setActiveSuggestion((activeSuggestionIndex + 1) % count);
        break;

      case "ArrowUp":
        if (!open) return;
        event.preventDefault();
        setActiveSuggestion(activeSuggestionIndex <= 0 ? count - 1 : activeSuggestionIndex - 1);
        break;

      case "Enter":
        event.preventDefault();
        if (open && activeSuggestionIndex >= 0) {
          selectSuggestion(activeSuggestionIndex);
        } else {
          getWeather();
        }
        break;

      case "Escape":
        hideSuggestions();
        break;
    }
  });

  els.suggestions.addEventListener("click", (event) => {
    const item = event.target.closest(".suggestion-item");

    if (item) {
      selectSuggestion(Number(item.dataset.index));
    }
  });

  els.suggestions.addEventListener("mousemove", (event) => {
    const item = event.target.closest(".suggestion-item");

    if (item && Number(item.dataset.index) !== activeSuggestionIndex) {
      setActiveSuggestion(Number(item.dataset.index));
    }
  });

  document.addEventListener("click", (event) => {
    const searchWrapper = document.querySelector(".search-wrapper");

    if (searchWrapper && !searchWrapper.contains(event.target)) {
      hideSuggestions();
    }
  });

  els.unitToggle.addEventListener("click", (event) => {
    const button = event.target.closest(".unit-btn");

    if (button) {
      setUnit(button.dataset.unit);
    }
  });

  els.backBtn.addEventListener("click", showListView);

  els.saveBtn.addEventListener("click", toggleSaveCurrentCity);

  document.querySelectorAll(".chip-btn").forEach((button) => {
    button.addEventListener("click", () => {
      els.cityInput.value = button.dataset.city;
      getWeather();
    });
  });


  // ============================================================
  // AUTO REFRESH
  // ============================================================

  setInterval(() => {
    // Skip if the tab is hidden or the user is loading something
    if (document.hidden || els.searchBtn.disabled) {
      return;
    }

    if (isDetailOpen() && currentPlace) {
      openPlace(currentPlace, { silent: true });
    } else {
      summaryCache.clear();
      renderCitiesList();
    }
  }, AUTO_REFRESH_MS);


  // ============================================================
  // START APP
  // ============================================================

  updateUnitToggle();
  showListView();

});