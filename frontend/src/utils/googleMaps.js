const KEY = 'AIzaSyCgJ0v4LEJaPxZUQR20A56GpBeFa8cf3LQ';
let loadPromise = null;

export function loadGoogleMaps() {
  if (window.google?.maps?.places) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    window.__gmInit = () => { resolve(); };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=places,geometry&callback=__gmInit`;
    s.async = true;
    s.defer = true;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return loadPromise;
}

// All Maps/Places calls go through the backend proxy to avoid API key restrictions.

// Address autocomplete predictions (India-restricted)
export async function getPlacePredictions(input) {
  if (!input || input.length < 3) return [];
  const res  = await fetch(`/api/maps/places/autocomplete?input=${encodeURIComponent(input)}`);
  const data = await res.json();
  return data.status === 'OK' ? data.predictions : [];
}

// Full address details for a selected prediction
export async function getPlaceDetails(placeId) {
  const res  = await fetch(`/api/maps/places/details?place_id=${encodeURIComponent(placeId)}`);
  const data = await res.json();
  if (data.status !== 'OK' || !data.result) return null;
  const get = (...types) => {
    const c = (data.result.address_components || []).find(
      (c) => types.some((t) => c.types.includes(t))
    );
    return c?.long_name || '';
  };
  return {
    lat:     data.result.geometry?.location?.lat,
    lng:     data.result.geometry?.location?.lng,
    street:  get('route', 'premise', 'street_number'),
    area:    get('sublocality_level_1', 'sublocality', 'neighborhood'),
    city:    get('locality', 'administrative_area_level_2', 'administrative_area_level_3'),
    pincode: get('postal_code'),
  };
}

// Reverse geocode lat/lng → address fields
export async function reverseGeocode(lat, lng) {
  const res  = await fetch(`/api/maps/geocode/reverse?lat=${lat}&lng=${lng}`);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.[0]) return null;
  const get = (...types) => {
    const c = (data.results[0].address_components || []).find(
      (c) => types.some((t) => c.types.includes(t))
    );
    return c?.long_name || '';
  };
  return {
    street:  get('route', 'premise', 'street_number'),
    area:    get('sublocality_level_1', 'sublocality', 'neighborhood'),
    city:    get('locality', 'administrative_area_level_2', 'administrative_area_level_3'),
    pincode: get('postal_code'),
  };
}

// Create a Google Map instance in a DOM element
export async function createGoogleMap(container, center = { lat: 20.5937, lng: 78.9629 }, zoom = 12) {
  await loadGoogleMaps();
  return new window.google.maps.Map(container, {
    center,
    zoom,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    zoomControlOptions: { position: window.google.maps.ControlPosition.RIGHT_BOTTOM },
  });
}
