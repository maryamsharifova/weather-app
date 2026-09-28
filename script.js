document.addEventListener("DOMContentLoaded", () => {

  // ============================================================
  // ELEMENTS
  // ============================================================

  const cityInput = document.getElementById("city-input");
  const searchBtn = document.getElementById("search-btn");
  const statusEl = document.getElementById("status");
  const suggestionsEl = document.getElementById("suggestions");

  const listViewEl = document.getElementById("list-view");
  const citiesListEl = document.getElementById("cities-list");
  const emptyMessageEl = document.getElementById("empty-message");

  const detailViewEl = document.getElementById("detail-view");
  const backBtn = document.getElementById("back-btn");
  const saveBtn = document.getElementById("save-btn");

  const locationEl = document.getElementById("location-value");
  const tempEl = document.getElementById("temp-value");
  const iconEl = document.getElementById("weather-icon");
  const conditionEl = document.getElementById("condition-text");

  const hourlyRowEl = document.getElementById("hourly-row");
  const dailyListEl = document.getElementById("daily-list");


  // ============================================================
  // CHECK ELEMENTS
  // ============================================================

  if (
    !cityInput ||
    !searchBtn ||
    !statusEl ||
    !suggestionsEl ||
    !listViewEl ||
    !citiesListEl ||
    !emptyMessageEl ||
    !detailViewEl ||
    !backBtn ||
    !saveBtn ||
    !locationEl ||
    !tempEl ||
    !iconEl ||
    !conditionEl ||
    !hourlyRowEl ||
    !dailyListEl
  ) {
    console.error("Weather App: HTML elements are missing.");
    return;
  }


  // ============================================================
  // STATE
  // ============================================================

  let currentPlace = null;
  let currentSuggestions = [];
  let activeSuggestionIndex = -1;
  let searchRequestId = 0;

  const STORAGE_KEY = "weatherApp.savedCities";


  // ============================================================
  // WEATHER CODES
  // ============================================================

  const WEATHER_CODES = {

    0: {
      text: "Clear Sky",
      icon: "☀️",
      theme: "sunny"
    },

    1: {
      text: "Mainly Clear",
      icon: "🌤️",
      theme: "sunny"
    },

    2: {
      text: "Partly Cloudy",
      icon: "⛅",
      theme: "cloudy"
    },

    3: {
      text: "Overcast",
      icon: "☁️",
      theme: "cloudy"
    },

    45: {
      text: "Fog",
      icon: "🌫️",
      theme: "cloudy"
    },

    48: {
      text: "Depositing Rime Fog",
      icon: "🌫️",
      theme: "cloudy"
    },

    51: {
      text: "Light Drizzle",
      icon: "🌦️",
      theme: "rain"
    },

    53: {
      text: "Drizzle",
      icon: "🌦️",
      theme: "rain"
    },

    55: {
      text: "Dense Drizzle",
      icon: "🌧️",
      theme: "rain"
    },

    61: {
      text: "Slight Rain",
      icon: "🌧️",
      theme: "rain"
    },

    63: {
      text: "Rain",
      icon: "🌧️",
      theme: "rain"
    },

    65: {
      text: "Heavy Rain",
      icon: "🌧️",
      theme: "rain"
    },

    71: {
      text: "Slight Snow",
      icon: "🌨️",
      theme: "snow"
    },

    73: {
      text: "Snow",
      icon: "🌨️",
      theme: "snow"
    },

    75: {
      text: "Heavy Snow",
      icon: "❄️",
      theme: "snow"
    },

    80: {
      text: "Rain Showers",
      icon: "🌦️",
      theme: "rain"
    },

    81: {
      text: "Moderate Rain",
      icon: "🌧️",
      theme: "rain"
    },

    82: {
      text: "Violent Rain",
      icon: "⛈️",
      theme: "rain"
    },

    95: {
      text: "Thunderstorm",
      icon: "⛈️",
      theme: "rain"
    }

  };


  // ============================================================
  // STATUS
  // ============================================================

  function setStatus(message) {
    statusEl.textContent = message;
  }


  // ============================================================
  // THEME
  // ============================================================

  function applyTheme(weatherCode, isDay) {

    document.body.className = "";

    if (!isDay) {
      document.body.classList.add("theme-night");
      return;
    }

    const info = WEATHER_CODES[weatherCode];

    const theme = info
      ? info.theme
      : "sunny";

    document.body.classList.add(
      `theme-${theme}`
    );
  }


  // ============================================================
  // DEBOUNCE
  // ============================================================

  function debounce(fn, delay) {

    let timeout;

    return (...args) => {

      clearTimeout(timeout);

      timeout = setTimeout(() => {
        fn(...args);
      }, delay);

    };
  }


  // ============================================================
  // FORMAT TIME
  // ============================================================

  function formatHourLabel(time, index) {

    if (index === 0) {
      return "Now";
    }

    let hour =
      parseInt(
        time.slice(11, 13),
        10
      );

    const suffix =
      hour >= 12
        ? "PM"
        : "AM";

    hour =
      hour % 12 || 12;

    return `${hour}${suffix}`;
  }


  function formatDayLabel(dateString, index) {

    if (index === 0) {
      return "Today";
    }

    const parts =
      dateString
        .split("-")
        .map(Number);

    const date =
      new Date(
        parts[0],
        parts[1] - 1,
        parts[2]
      );

    return date.toLocaleDateString(
      undefined,
      {
        weekday: "short"
      }
    );
  }


  function formatLocalTime(offsetSeconds) {

    const nowUtc =
      Date.now() +
      new Date().getTimezoneOffset() * 60000;

    const localDate =
      new Date(
        nowUtc +
        offsetSeconds * 1000
      );

    let hours =
      localDate.getHours();

    const minutes =
      String(
        localDate.getMinutes()
      ).padStart(2, "0");

    const suffix =
      hours >= 12
        ? "PM"
        : "AM";

    hours =
      hours % 12 || 12;

    return `${hours}:${minutes}${suffix}`;
  }


  // ============================================================
  // CITY COMPARISON
  // ============================================================

  function isSamePlace(a, b) {

    return (
      Math.round(a.latitude * 100) ===
      Math.round(b.latitude * 100) &&

      Math.round(a.longitude * 100) ===
      Math.round(b.longitude * 100)
    );
  }


  // ============================================================
  // LOCAL STORAGE
  // ============================================================

  function loadSavedCities() {

    const raw =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (!raw) {
      return [];
    }

    try {

      const cities =
        JSON.parse(raw);

      return cities.map(city => ({
        pinned: false,
        ...city
      }));

    } catch {

      return [];
    }
  }


  function saveSavedCities(cities) {

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(cities)
    );
  }


  // ============================================================
  // SCREEN
  // ============================================================

  function showListView() {

    detailViewEl.classList.add(
      "hidden"
    );

    listViewEl.classList.remove(
      "hidden"
    );

    document.body.className =
      "theme-sunny";

    renderCitiesList();
  }


  function showDetailView() {

    listViewEl.classList.add(
      "hidden"
    );

    detailViewEl.classList.remove(
      "hidden"
    );
  }


  // ============================================================
  // RENDER SAVED CITIES
  // ============================================================

  async function renderCitiesList() {

    const saved =
      loadSavedCities().sort(
        (a, b) =>
          Number(b.pinned) -
          Number(a.pinned)
      );


    citiesListEl.innerHTML = "";


    if (saved.length === 0) {

      emptyMessageEl.classList.remove(
        "hidden"
      );

      return;
    }


    emptyMessageEl.classList.add(
      "hidden"
    );


    for (const place of saved) {

      let weather = {
        temperature: null,
        condition: "Unavailable",
        isDay: true,
        localTime: "--:--",
        high: null,
        low: null
      };


      try {

        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${place.latitude}` +
          `&longitude=${place.longitude}` +
          `&current_weather=true` +
          `&daily=temperature_2m_max,temperature_2m_min` +
          `&timezone=auto`;


        const response =
          await fetch(url);


        const data =
          await response.json();


        const current =
          data.current_weather;


        const info =
          WEATHER_CODES[
            current.weathercode
          ] || {
            text: "Unknown"
          };


        weather = {

          temperature:
            Math.round(
              current.temperature
            ),

          condition:
            info.text,

          isDay:
            current.is_day === 1,

          localTime:
            formatLocalTime(
              data.utc_offset_seconds
            ),

          high:
            Math.round(
              data.daily.temperature_2m_max[0]
            ),

          low:
            Math.round(
              data.daily.temperature_2m_min[0]
            )

        };

      } catch (error) {

        console.error(
          "Saved city weather error:",
          error
        );
      }


      // ======================================================
      // CITY WRAPPER
      // ======================================================

      const wrapper =
        document.createElement("div");

      wrapper.className =
        "city-row-wrapper";


      // ======================================================
      // CITY CARD
      // ======================================================

      const row =
        document.createElement("div");

      row.className =
        `city-row ${
          weather.isDay
            ? "row-day"
            : "row-night"
        }`;


      row.innerHTML = `

        <div class="row-left">

          <span class="city-name">
            ${place.name}
            ${place.pinned ? " 📌" : ""}
          </span>

          <span class="city-time">
            ${weather.localTime}
          </span>

          <span class="city-subtitle">
            ${weather.condition}
          </span>

        </div>


        <div class="row-right">

          <span class="city-temp">
            ${
              weather.temperature === null
                ? "--"
                : weather.temperature + "°"
            }
          </span>

          <span class="city-hilo">
            ${
              weather.high === null
                ? "--"
                : `H:${weather.high}° L:${weather.low}°`
            }
          </span>

        </div>

      `;


      // ======================================================
      // ACTIONS
      // ======================================================

      const actions =
        document.createElement("div");

      actions.className =
        "row-actions";


      actions.innerHTML = `

        <button
          class="action-btn pin-btn ${
            place.pinned
              ? "pinned"
              : ""
          }"
          type="button"
        >
          📌
          ${
            place.pinned
              ? "Unpin"
              : "Pin"
          }
        </button>


        <button
          class="action-btn delete-btn"
          type="button"
        >
          🗑️ Delete
        </button>

      `;


      wrapper.appendChild(row);
      wrapper.appendChild(actions);

      citiesListEl.appendChild(
        wrapper
      );


      // ======================================================
      // OPEN CITY
      // ======================================================

      row.addEventListener(
        "click",
        async () => {

          await fetchWeatherForPlace(
            place
          );

          showDetailView();

        }
      );


      // ======================================================
      // PIN
      // ======================================================

      const pinButton =
        actions.querySelector(
          ".pin-btn"
        );


      pinButton.addEventListener(
        "click",
        (event) => {

          event.stopPropagation();


          const cities =
            loadSavedCities();


          const updated =
            cities.map(city => {

              if (
                isSamePlace(
                  city,
                  place
                )
              ) {

                return {
                  ...city,
                  pinned:
                    !city.pinned
                };
              }

              return city;
            });


          saveSavedCities(
            updated
          );


          renderCitiesList();
        }
      );


      // ======================================================
      // DELETE
      // ======================================================

      const deleteButton =
        actions.querySelector(
          ".delete-btn"
        );


      deleteButton.addEventListener(
        "click",
        (event) => {

          event.stopPropagation();


          const updated =
            loadSavedCities().filter(
              city =>
                !isSamePlace(
                  city,
                  place
                )
            );


          saveSavedCities(
            updated
          );


          renderCitiesList();
        }
      );

    }
  }


  // ============================================================
  // HOURLY FORECAST
  // ============================================================

  function renderHourly(
    hourly,
    currentTime
  ) {

    hourlyRowEl.innerHTML = "";


    const prefix =
      currentTime.slice(0, 13);


    let start =
      hourly.time.findIndex(
        time =>
          time.startsWith(prefix)
      );


    if (start === -1) {
      start = 0;
    }


    for (
      let i = start;
      i < start + 12 &&
      i < hourly.time.length;
      i++
    ) {

      const info =
        WEATHER_CODES[
          hourly.weathercode[i]
        ] || {
          icon: "❓"
        };


      const item =
        document.createElement("div");

      item.className =
        "hour-item";


      item.innerHTML = `

        <span class="hour-label">
          ${
            formatHourLabel(
              hourly.time[i],
              i - start
            )
          }
        </span>

        <span class="hour-icon">
          ${info.icon}
        </span>

        <span class="hour-temp">
          ${
            Math.round(
              hourly.temperature_2m[i]
            )
          }°
        </span>

      `;


      hourlyRowEl.appendChild(
        item
      );
    }
  }


  // ============================================================
  // DAILY FORECAST
  // ============================================================

  function renderDaily(daily) {

    dailyListEl.innerHTML = "";


    const min =
      Math.min(
        ...daily.temperature_2m_min
      );

    const max =
      Math.max(
        ...daily.temperature_2m_max
      );

    const range =
      max - min || 1;


    daily.time.forEach(
      (date, index) => {

        const info =
          WEATHER_CODES[
            daily.weathercode[index]
          ] || {
            icon: "❓"
          };


        const low =
          daily.temperature_2m_min[index];

        const high =
          daily.temperature_2m_max[index];


        const left =
          ((low - min) / range) *
          100;


        const width =
          Math.max(
            ((high - low) / range) *
            100,
            10
          );


        const row =
          document.createElement("div");

        row.className =
          "day-row";


        row.innerHTML = `

          <span class="day-name">
            ${
              formatDayLabel(
                date,
                index
              )
            }
          </span>

          <span class="day-icon">
            ${info.icon}
          </span>

          <span class="day-low">
            ${Math.round(low)}°
          </span>

          <span class="day-bar-track">

            <span
              class="day-bar-fill"
              style="
                left:${left}%;
                width:${width}%;
              "
            ></span>

          </span>

          <span class="day-high">
            ${Math.round(high)}°
          </span>

        `;


        dailyListEl.appendChild(
          row
        );

      }
    );
  }


  // ============================================================
  // WEATHER REQUEST
  // ============================================================

  async function fetchWeatherForPlace(place) {

    setStatus("Loading...");

    searchBtn.disabled = true;


    try {

      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${place.latitude}` +
        `&longitude=${place.longitude}` +
        `&current_weather=true` +
        `&hourly=temperature_2m,weathercode` +
        `&daily=weathercode,temperature_2m_max,temperature_2m_min` +
        `&timezone=auto`;


      const response =
        await fetch(url);


      if (!response.ok) {
        throw new Error(
          "Weather request failed"
        );
      }


      const data =
        await response.json();


      const current =
        data.current_weather;


      const info =
        WEATHER_CODES[
          current.weathercode
        ] || {
          text: "Unknown",
          icon: "❓",
          theme: "sunny"
        };


      applyTheme(
        current.weathercode,
        current.is_day === 1
      );


      locationEl.textContent =
        place.name;


      tempEl.textContent =
        Math.round(
          current.temperature
        );


      iconEl.textContent =
        info.icon;


      conditionEl.textContent =
        info.text;


      renderHourly(
        data.hourly,
        current.time
      );


      renderDaily(
        data.daily
      );


      currentPlace = {
        name: place.name,
        country: place.country,
        latitude: place.latitude,
        longitude: place.longitude
      };


      updateSaveButton();


      setStatus("");


    } catch (error) {

      console.error(
        "Weather error:",
        error
      );

      setStatus(
        "Unable to load weather."
      );

    } finally {

      searchBtn.disabled = false;
    }
  }


  // ============================================================
  // SEARCH CITY
  // ============================================================

  async function getWeather() {

    const city =
      cityInput.value.trim();


    if (!city) {

      setStatus(
        "Please enter a city."
      );

      return;
    }


    hideSuggestions();

    searchBtn.disabled = true;

    setStatus("Searching...");


    try {

      const url =
        `https://geocoding-api.open-meteo.com/v1/search` +
        `?name=${encodeURIComponent(city)}` +
        `&count=1`;


      const response =
        await fetch(url);


      if (!response.ok) {
        throw new Error(
          "Geocoding request failed"
        );
      }


      const data =
        await response.json();


      if (
        !data.results ||
        data.results.length === 0
      ) {

        setStatus(
          `Couldn't find "${city}".`
        );

        return;
      }


      await fetchWeatherForPlace(
        data.results[0]
      );


      showDetailView();


    } catch (error) {

      console.error(
        "Search error:",
        error
      );

      setStatus(
        "Connection error."
      );

    } finally {

      searchBtn.disabled = false;
    }
  }


  // ============================================================
  // SAVE BUTTON
  // ============================================================

  function updateSaveButton() {

    if (!currentPlace) {
      return;
    }


    const saved =
      loadSavedCities();


    const exists =
      saved.some(
        city =>
          isSamePlace(
            city,
            currentPlace
          )
      );


    saveBtn.textContent =
      exists
        ? "★"
        : "☆";


    saveBtn.classList.toggle(
      "saved",
      exists
    );
  }


  function toggleSaveCurrentCity() {

    if (!currentPlace) {
      return;
    }


    let saved =
      loadSavedCities();


    const exists =
      saved.some(
        city =>
          isSamePlace(
            city,
            currentPlace
          )
      );


    if (exists) {

      saved =
        saved.filter(
          city =>
            !isSamePlace(
              city,
              currentPlace
            )
        );

    } else {

      saved.push({
        ...currentPlace,
        pinned: false
      });
    }


    saveSavedCities(
      saved
    );


    updateSaveButton();
  }


  // ============================================================
  // SUGGESTIONS
  // ============================================================

  async function fetchSuggestions(query) {

    if (
      query.trim().length < 2
    ) {

      hideSuggestions();

      return;
    }


    const requestId =
      ++searchRequestId;


    try {

      const url =
        `https://geocoding-api.open-meteo.com/v1/search` +
        `?name=${encodeURIComponent(query)}` +
        `&count=6`;


      const response =
        await fetch(url);


      const data =
        await response.json();


      if (
        requestId !== searchRequestId
      ) {
        return;
      }


      currentSuggestions =
        data.results || [];


      renderSuggestions();


    } catch (error) {

      console.error(
        "Suggestion error:",
        error
      );

      hideSuggestions();
    }
  }


  const debouncedSuggestions =
    debounce(
      fetchSuggestions,
      300
    );


  function renderSuggestions() {

    activeSuggestionIndex = -1;


    if (
      currentSuggestions.length === 0
    ) {

      suggestionsEl.innerHTML = `
        <div
          style="
            padding:12px;
            color:rgba(255,255,255,0.6)
          "
        >
          No matching cities
        </div>
      `;

      suggestionsEl.classList.remove(
        "hidden"
      );

      return;
    }


    suggestionsEl.innerHTML =
      currentSuggestions
        .map(
          (place, index) => {

            const region =
              [
                place.admin1,
                place.country
              ]
                .filter(Boolean)
                .join(", ");


            return `

              <div
                class="suggestion-item"
                data-index="${index}"
              >

                <span
                  class="suggestion-name"
                >
                  ${place.name}
                </span>

                <span
                  class="suggestion-region"
                >
                  ${region}
                </span>

              </div>

            `;
          }
        )
        .join("");


    suggestionsEl.classList.remove(
      "hidden"
    );
  }


  function hideSuggestions() {

    suggestionsEl.classList.add(
      "hidden"
    );

    suggestionsEl.innerHTML = "";

    currentSuggestions = [];

    activeSuggestionIndex = -1;
  }


  function selectSuggestion(index) {

    const place =
      currentSuggestions[index];


    if (!place) {
      return;
    }


    cityInput.value =
      place.name;


    hideSuggestions();


    fetchWeatherForPlace(
      place
    ).then(
      showDetailView
    );
  }


  // ============================================================
  // SEARCH BUTTON
  // ============================================================

  searchBtn.addEventListener(
    "click",
    getWeather
  );


  // ============================================================
  // ENTER KEY
  // ============================================================

  cityInput.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {

        event.preventDefault();

        getWeather();
      }
    }
  );


  // ============================================================
  // SEARCH INPUT
  // ============================================================

  cityInput.addEventListener(
    "input",
    () => {

      debouncedSuggestions(
        cityInput.value
      );
    }
  );


  // ============================================================
  // CLICK SUGGESTION
  // ============================================================

  suggestionsEl.addEventListener(
    "click",
    event => {

      const item =
        event.target.closest(
          ".suggestion-item"
        );


      if (!item) {
        return;
      }


      selectSuggestion(
        Number(
          item.dataset.index
        )
      );
    }
  );


  // ============================================================
  // CLOSE SUGGESTIONS
  // ============================================================

  document.addEventListener(
    "click",
    event => {

      const searchWrapper =
        document.querySelector(
          ".search-wrapper"
        );


      if (
        searchWrapper &&
        !searchWrapper.contains(
          event.target
        )
      ) {

        hideSuggestions();
      }
    }
  );


  // ============================================================
  // BACK BUTTON
  // ============================================================

  backBtn.addEventListener(
    "click",
    showListView
  );


  // ============================================================
  // SAVE BUTTON
  // ============================================================

  saveBtn.addEventListener(
    "click",
    toggleSaveCurrentCity
  );


  // ============================================================
  // POPULAR CITY BUTTONS
  // ============================================================

  document
    .querySelectorAll(".chip-btn")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const city =
            button.dataset.city;


          cityInput.value =
            city;


          getWeather();
        }
      );

    });


  // ============================================================
  // START APP
  // ============================================================

  renderCitiesList();

});
