// app.js - main single-page app logic
// Uses Leaflet and a small server-side proxy at /api/teetimes

const COURSES_URL = 'data/courses.json';
const NJ_GEOJSON_LOCAL = 'data/nj-counties.geojson';
const NJ_GEOJSON_REMOTE = 'https://opendata.arcgis.com/datasets/58d0bbaef3b942efbfa8a311cf52c061_1.geojson';

let courses = [];

const map = L.map('map', { preferCanvas: true }).setView([40.150, -74.5], 8);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let countiesLayer = null;
let highlightedLayer = null;

// load courses list
fetch(COURSES_URL).then(r=>r.json()).then(json=>{ courses = json; addCourseMarkers(); }).catch(e=>{ console.error('Failed to load courses.json', e); });

// load counties geojson: try local first, then remote ARCgis URL
async function loadCounties() {
  try {
    let res = await fetch(NJ_GEOJSON_LOCAL);
    if (!res.ok) throw new Error('local not found');
    return await res.json();
  } catch (err) {
    console.warn('Local GeoJSON not found, fetching remote source:', NJ_GEOJSON_REMOTE);
    const res = await fetch(NJ_GEOJSON_REMOTE);
    if (!res.ok) throw new Error('Failed to fetch remote geojson');
    return await res.json();
  }
}

loadCounties().then(geojson => {
  countiesLayer = L.geoJSON(geojson, {
    style: { color: "#444", weight: 1, fillOpacity: 0.05 },
    onEachFeature: (feature, layer) => {
      const name = feature.properties && (feature.properties.NAME || feature.properties.county || feature.properties.COUNTY || feature.properties.County) || feature.properties.COUNTY_NAM || 'Unknown';
      layer.bindTooltip(name, {sticky:true});

      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      document.getElementById('countySelect').appendChild(opt);
      layer.featureName = name;
    }
  }).addTo(map);

  document.getElementById('countySelect').addEventListener('change', (e) => {
    const name = e.target.value;
    if (!name) return resetView();
    let found = null;
    countiesLayer.eachLayer(layer => { if (layer.featureName === name) found = layer; });
    if (found) {
      highlightCounty(found);
      map.fitBounds(found.getBounds(), {padding:[20,20]});
    } else {
      alert('County not found in GeoJSON: ' + name);
    }
  });
}).catch(err => {
  console.error(err);
  alert('Failed to load NJ counties GeoJSON. See console.');
});

function highlightCounty(layer) {
  if (highlightedLayer) countiesLayer.resetStyle(highlightedLayer);
  highlightedLayer = layer;
  layer.setStyle({ color: '#2a7bd7', weight: 2, fillOpacity: 0.12 });
}

// Reset
document.getElementById('resetBtn').addEventListener('click', resetView);
function resetView(){
  if (highlightedLayer) countiesLayer.resetStyle(highlightedLayer);
  highlightedLayer = null;
  document.getElementById('countySelect').value = '';
  map.setView([40.150, -74.5], 8);
}

// Modal logic
const modal = document.getElementById('courseModal');
const modalBody = document.getElementById('modalBody');
const modalTitle = document.getElementById('modalTitle');
document.getElementById('modalClose').addEventListener('click', closeModal);

function openCourseModal(course){
  modal.setAttribute('aria-hidden','false');
  modalTitle.textContent = course.name;
  const dateVal = document.getElementById('dateInput').value || new Date().toISOString().slice(0,10);
  modalBody.innerHTML = `<div class="small-muted">Fetching tee times for ${dateVal}…</div>`;
  fetchTeeTimes(course.id, dateVal).then(times => {
    if (!times || times.length === 0) {
      modalBody.innerHTML = `<div>No tee times available for ${dateVal}.</div><div style="margin-top:8px"><a href="${course.bookingUrl}" target="_blank" rel="noopener">Open booking page</a></div>`;
      return;
    }
    const container = document.createElement('div');
    container.className = 'tee-list';
    times.forEach(t => {
      const row = document.createElement('div');
      row.className = 'tee-item';
      row.innerHTML = `<div><strong>${t.time}</strong> <div class="small-muted">${t.players || ''} players · ${t.rate ? '$'+t.rate : ''}</div></div><div><button data-time="${t.time}" class="bookBtn">Book</button></div>`;
      container.appendChild(row);
    });
    modalBody.innerHTML = '';
    modalBody.appendChild(container);

    container.querySelectorAll('.bookBtn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.open(course.bookingUrl, '_blank', 'noopener');
      });
    });

  }).catch(err => {
    console.error(err);
    modalBody.innerHTML = `<div>Error fetching tee times. See console.</div><div style="margin-top:8px"><a href="${course.bookingUrl}" target="_blank" rel="noopener">Open booking page</a></div>`;
  });
}

function closeModal(){ modal.setAttribute('aria-hidden','true'); }

async function fetchTeeTimes(courseId, dateISO){
  try {
    const q = new URLSearchParams({ courseId: courseId, date: dateISO });
    const res = await fetch('/api/teetimes?' + q.toString(), {cache:'no-store'});
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) return await res.json();
      // if html, try to parse minimal time strings from returned html
      const text = await res.text();
      const times = extractTimesFromHtml(text);
      if (times.length) return times;
    }
  } catch(e) {
    console.warn('Proxy fetch failed:', e.message);
  }
  // last-resort mock
  return [
    { time: '07:00 AM', players: 2, rate: 25 },
    { time: '08:30 AM', players: 1, rate: 30 },
    { time: '10:00 AM', players: 4, rate: 40 }
  ];
}

function extractTimesFromHtml(html){
  // crude regex to find times like 07:00 AM or 7:00 PM
  const re = /([0-1]?\d:[0-5]\d\s?(?:AM|PM))/ig;
  const matches = Array.from(new Set((html.match(re) || []).map(s=>s.trim())));
  return matches.map(t=>({ time: t, players: null, rate: null }));
}

// add course markers
function addCourseMarkers(){
  if (!Array.isArray(courses)) return;
  courses.forEach(course => {
    const mk = L.circleMarker(course.coords, { radius:7, color:'#c53', fillColor:'#f55', fillOpacity:0.9 }).addTo(map);
    mk.bindPopup(`<strong>${course.name}</strong><div class="small-muted">${course.city}</div><div style="margin-top:8px"><button data-id="${course.id}" class="openCourseBtn">View tee times</button></div>`, {minWidth:180});
    mk.on('popupopen', () => {
      document.querySelectorAll('.openCourseBtn').forEach(btn => {
        btn.addEventListener('click', () => {
          openCourseModal(getCourseById(btn.dataset.id));
        });
      });
    });
  });
}

function getCourseById(id){ return courses.find(c=>String(c.id)===String(id)); }

document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeModal(); });
