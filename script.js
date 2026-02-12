const modeSettings = {
  walk: {
    profile: "foot-walking",
    minMove: 5,
    routeDelay: 1500,
    accuracyLimit: 50,
    animationDelay: 80
  },
  bike: {
    profile: "cycling-regular",
    minMove: 15,
    routeDelay: 1200,
    accuracyLimit: 60,
    animationDelay: 50
  },
  car: {
    profile: "driving-car",
    minMove: 30,
    routeDelay: 1000,
    accuracyLimit: 80,
    animationDelay: 30
  }
};

let trackingMode = "bike";

let watchId = null;
let isTracking = false;
let lastRouteTime = 0;
let isFetchingRoute = false;
let marker = null;
let lastPoint = null;
let animationToken = 0;


const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const downloadBtn = document.getElementById("downloadBtn");
const latEl = document.getElementById("lat");
const lngEl = document.getElementById("lng");


const map = L.map('map').setView([28.6139, 77.2090], 15);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

const canvasRenderer = L.canvas();

const polyline = L.polyline([], {
  color: "blue",
  weight: 4,
  opacity: 0.8,
  renderer: canvasRenderer
}).addTo(map);



const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImQ5MDQ0MzIwZTY4NTQxNWFiMWUxM2QwYWI3ZjQ1NTMzIiwiaCI6Im11cm11cjY0In0="; 

function metersBetween(a, b) {
  const R = 6371000;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
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
    if (!data.features) return null;
    return data.features[0].geometry.coordinates.map(c => [c[1], c[0]]);
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

    map.panTo(point, { animate: true });

    i++;
    setTimeout(step, modeSettings[trackingMode].animationDelay);
  }

  step();
}

async function handlePosition(position) {
  if (!isTracking) return;

  const mode = modeSettings[trackingMode];
  if (!mode) return;

  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const newPoint = [lat, lng];

  // if (position.coords.accuracy > mode.accuracyLimit) {
  //   console.log("Blocked by accuracy filter:", position.coords.accuracy);
  //   return;
  // }

  if (!marker) {
    marker = L.marker(newPoint).addTo(map);
    map.setView(newPoint, 17);
    lastPoint = newPoint;
    polyline.addLatLng(newPoint);
    latEl.textContent = lat.toFixed(6);
    lngEl.textContent = lng.toFixed(6);
    return;
  }

  if (metersBetween(lastPoint, newPoint) < mode.minMove) return;
  if (Date.now() - lastRouteTime < mode.routeDelay) return;

  lastRouteTime = Date.now();

  if (isFetchingRoute) return;
  isFetchingRoute = true;

  const route = await getRoute(lastPoint, newPoint);
  isFetchingRoute = false;

  if (route && route.length > 0) {
    animateMarker(route);
  } else {
    marker.setLatLng(newPoint);
    polyline.addLatLng(newPoint);
    map.panTo(newPoint, { animate: true });
  }

  lastPoint = newPoint;
  latEl.textContent = newPoint[0].toFixed(6);
  lngEl.textContent = newPoint[1].toFixed(6);
}

startBtn.onclick = () => {

  if (isTracking) return;

  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }

  startBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(

    (position) => {

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const currentPoint = [lat, lng];

      polyline.setLatLngs([]);
      lastPoint = currentPoint;

      if (!marker) marker = L.marker(currentPoint).addTo(map);
      else marker.setLatLng(currentPoint);

      map.setView(currentPoint, 17);
      polyline.addLatLng(currentPoint);

      latEl.textContent = lat.toFixed(6);
      lngEl.textContent = lng.toFixed(6);

      isTracking = true;

      stopBtn.disabled = false;

      watchId = navigator.geolocation.watchPosition(
        handlePosition,
        (err) => console.log("GPS Error:", err),
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10000
        }
      );

    },

    (err) => {
      console.log(err);
      startBtn.disabled = false;
    },

    { enableHighAccuracy: true }
  );
};


stopBtn.onclick = () => {

  if (!isTracking) return;

  isTracking = false;
  animationToken++;

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
};

downloadBtn.onclick = () => {
  const latlngs = polyline.getLatLngs();
  if (latlngs.length === 0) {
    alert("No route tracked yet!");
    return;
  }

  const mapWindow = window.open("", "_blank");
  mapWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Tracked Route Map</title>
      <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
      <style>
        #map { height: 100vh; width: 100vw; margin: 0; padding: 0; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
      <script>
        const map = L.map('map').fitBounds(${JSON.stringify(latlngs)});
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }).addTo(map);

        const polyline = L.polyline(${JSON.stringify(latlngs)}, {
          color: 'blue',
          weight: 4
        }).addTo(map);

        // Optional: add marker at start and end
        L.marker(${JSON.stringify(latlngs[0])}).addTo(map).bindPopup("Start").openPopup();
        L.marker(${JSON.stringify(latlngs[latlngs.length - 1])}).addTo(map).bindPopup("End");
      </script>
    </body>
    </html>
  `);
};


stopBtn.disabled = true;
