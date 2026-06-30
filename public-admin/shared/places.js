// shared/places.js
import { state } from "./state.js";

let googlePlacesPromise = null;
let addressAutocompleteBound = false;

function getGoogleMapsKey() {
  return window.GOOGLE_MAPS_KEY || "";
}

function hasGooglePlacesLoaded() {
  return !!(window.google && window.google.maps && window.google.maps.places && window.google.maps.Geocoder);
}

export function loadGooglePlaces() {
  if (googlePlacesPromise) return googlePlacesPromise;

  googlePlacesPromise = new Promise((resolve, reject) => {
    if (hasGooglePlacesLoaded()) {
      resolve(window.google);
      return;
    }

    const key = getGoogleMapsKey();
    if (!key) {
      resolve(null);
      return;
    }

    const existing = document.querySelector('script[data-google-places="1"]');
    if (existing) {
      const t0 = Date.now();
      const timer = setInterval(() => {
        if (hasGooglePlacesLoaded()) {
          clearInterval(timer);
          resolve(window.google);
        } else if (Date.now() - t0 > 15000) {
          clearInterval(timer);
          reject(new Error("Timeout cargando Google Places"));
        }
      }, 150);
      return;
    }

    const script = document.createElement("script");
    script.dataset.googlePlaces = "1";
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&libraries=places&language=es&region=ES`;

    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("No se pudo cargar Google Places"));

    document.head.appendChild(script);
  })
    .catch((err) => {
      googlePlacesPromise = null;
      throw err;
    });

  return googlePlacesPromise;
}

export async function initPlaces() {
  try {
    await loadGooglePlaces();
    if (window.google && window.google.maps && window.google.maps.places) {
      state.autocompleteService = new window.google.maps.places.AutocompleteService();
      return;
    }
  } catch (_) {}

  state.autocompleteService = null;
}

function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export async function setupAddressAutocomplete() {
  if (addressAutocompleteBound) return;

  const input = document.getElementById("address");
  const list = document.getElementById("addressList");
  if (!input || !list) return;

  addressAutocompleteBound = true;

  if (!state.autocompleteService) {
    await initPlaces();
  }

  const closeList = () => {
    list.classList.remove("active");
    list.innerHTML = "";
  };

  const renderPredictions = (predictions) => {
    list.innerHTML = "";
    if (!predictions || predictions.length === 0) {
      list.classList.remove("active");
      return;
    }

    predictions.slice(0, 5).forEach((prediction) => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";
      item.textContent = prediction.description;
      item.addEventListener("click", () => handleAddressSelected(prediction));
      list.appendChild(item);
    });

    list.classList.add("active");
  };

  const fetchPredictions = debounce((value) => {
    if (!state.autocompleteService) {
      closeList();
      return;
    }

    state.autocompleteService.getPlacePredictions(
      {
        input: value,
        componentRestrictions: { country: "es" },
        types: ["geocode"],
      },
      (predictions, status) => {
        if (status !== "OK") {
          closeList();
          return;
        }
        renderPredictions(predictions);
      }
    );
  }, 220);

  input.addEventListener("input", (e) => {
    const value = String(e.target.value || "").trim();

    if (!value || value.length <= 3) {
      closeList();
      return;
    }

    fetchPredictions(value);
  });

  document.addEventListener("click", (e) => {
    if (!list.contains(e.target) && e.target !== input) closeList();
  });
}

export async function initPlacesProfile() {
  await setupAddressAutocomplete();
}

async function handleAddressSelected(prediction) {
  const input = document.getElementById("address");
  const list = document.getElementById("addressList");
  if (!input || !list) return;

  input.value = prediction.description || "";
  list.classList.remove("active");
  list.innerHTML = "";

  try {
    await loadGooglePlaces();
  } catch (_) {
    return;
  }

  if (!window.google || !window.google.maps || !window.google.maps.Geocoder) return;

  const geocoder = new window.google.maps.Geocoder();
  const req = prediction.place_id ? { placeId: prediction.place_id } : { address: prediction.description };

  geocoder.geocode(req, (results, status) => {
    if (status !== "OK" || !results || !results[0]) return;

    const comps = results[0].address_components || [];
    const getComponent = (types) => {
      const c = comps.find((comp) => types.every((t) => comp.types.includes(t)));
      return c ? c.long_name : "";
    };

    const zipcode = getComponent(["postal_code"]);
    const city =
      getComponent(["locality"]) ||
      getComponent(["postal_town"]) ||
      getComponent(["administrative_area_level_3"]);
    const province =
      getComponent(["administrative_area_level_2"]) ||
      getComponent(["administrative_area_level_1"]);

    const zipcodeEl = document.getElementById("zipcode");
    const cityEl = document.getElementById("city");
    const provinceEl = document.getElementById("province");

    if (zipcodeEl && zipcode && !zipcodeEl.value) zipcodeEl.value = zipcode;
    if (cityEl && city && !cityEl.value) cityEl.value = city;
    if (provinceEl && province && !provinceEl.value) provinceEl.value = province;
  });
}

export function selectAddress(description) {
  handleAddressSelected({ description });
}