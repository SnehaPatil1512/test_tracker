let trackingMode = "walk";

const modeSettings = {
  walk: {
    profile: "foot-walking",
    minMove: 25,
    routeDelay: 4000,
    accuracyLimit: 30
  },

  vehicle: {
    profile: "driving-car",
    minMove: 50,
    routeDelay: 2500,
    accuracyLimit: 50
  }
};

const map = L.map('map').setView([28.6139, 77.2090], 15);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);


const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImQ5MDQ0MzIwZTY4NTQxNWFiMWUxM2QwYWI3ZjQ1NTMzIiwiaCI6Im11cm11cjY0In0=";

let watchId = null;
let isTracking = false;
let lastRouteTime = 0;

let marker = null;
let lastPoint = null;
let animationToken = 0;

const polyline = L.polyline([], { color: "blue" }).addTo(map);

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const latEl = document.getElementById("lat");
const lngEl = document.getElementById("lng");

const modeSelect = document.getElementById("modeSelect");
modeSelect.onchange = () => {
  trackingMode = modeSelect.value;
}

function metersBetween(a, b) {

  const R = 6371000;

  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;

  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function getRoute(from, to) {

  try {

    const res = await fetch(
      `https://api.openrouteservice.org/v2/directions/${modeSettings[trackingMode].profile}/geojson`,
      {
        method: "POST",
        headers: {
          "Authorization": ORS_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          coordinates: [
            [from[1], from[0]],
            [to[1], to[0]]
          ]
        })
      }
    );

    const data = await res.json();

    if (!data.features) {
      console.log("ORS route failed", data);
      return null;
    }

    return data.features[0].geometry.coordinates
      .map(c => [c[1], c[0]]);

  } catch (e) {
    console.log("Route error", e);
    return null;
  }
}

function animateMarker(route) {

  animationToken++; 
  const currentToken = animationToken;

  let i = 0;

  function step() {

    if (!isTracking || currentToken !== animationToken) return;

    if (i >= route.length) return;

    const point = route[i];

    marker.setLatLng(point);
    polyline.addLatLng(point);

    latEl.textContent = point[0].toFixed(6);
    lngEl.textContent = point[1].toFixed(6);

    map.setView(point, 17, { animate: true });

    i++;

    setTimeout(step, 120);
  }

  step();
}

async function handlePosition(position) {

  if (!isTracking) return;

  const lat = position.coords.latitude;
  const lng = position.coords.longitude;

  latEl.textContent = lat.toFixed(6);
  lngEl.textContent = lng.toFixed(6);

  const newPoint = [lat, lng];

  //if (position.coords.accuracy > modeSettings[trackingMode].accuracyLimit) { 
   // console.log("Blocked by accuracy filter")
   // return;
  //}

  if (!marker) {
    marker = L.marker(newPoint).addTo(map);
    map.setView(newPoint, 17);
    lastPoint = newPoint;
    polyline.addLatLng(newPoint);
    return;
  }

  if (metersBetween(lastPoint, newPoint) < modeSettings[trackingMode].minMove) return;

  if (Date.now() - lastRouteTime < modeSettings[trackingMode].routeDelay) return;

  lastRouteTime = Date.now();

  const route = await getRoute(lastPoint, newPoint);

  if (route && route.length > 0) {

  animateMarker(route);

} else {

  polyline.addLatLng(newPoint);
  marker.setLatLng(newPoint);

  latEl.textContent = newPoint[0].toFixed(6);
  lngEl.textContent = newPoint[1].toFixed(6);

  map.setView(newPoint, 17, { animate: true   });
}
  lastPoint = newPoint;
}

startBtn.onclick = () => {

  if (isTracking) return;

    lastRouteTime = 0; 

  if (!navigator.geolocation) {
    alert("Geolocation is not supported on this device");
    return;
  }

  navigator.geolocation.getCurrentPosition((position) => {

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    const currentPoint = [lat, lng];

    latEl.textContent = lat.toFixed(6);
    lngEl.textContent = lng.toFixed(6);


    polyline.setLatLngs([]);
    lastPoint = currentPoint;
    if (!marker) {
      marker = L.marker(currentPoint).addTo(map);
    } else {
      marker.setLatLng(currentPoint);
    }
    map.setView(currentPoint, 17);

    polyline.addLatLng(currentPoint);

    isTracking = true;

    watchId = navigator.geolocation.watchPosition(
      handlePosition,
      (err) => {
      console.log("GPS Error:", err);
      },
      {
        enableHighAccuracy: true, //m-t, l-f
        maximumAge: 5000, //m-5000, l-10000
        timeout: 15000  //m-15000, l-20000 
      }
    );

  }, console.error, { enableHighAccuracy: true });

};


stopBtn.onclick = () => {

  isTracking = false;

  animationToken++;
  lastRouteTime = 0;  

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
};


