declare const L: any;

interface Course {
  id: number;
  name: string;
  city: string;
  coords: [number, number];
  bookingUrl: string;
  teeTimesUrlTemplate: string | null;
}

interface TeeTime {
  time: string;
  players: number | null;
  rate: number | null;
}

interface CountyFeatureProperties {
  NAME?: string;
  county?: string;
  COUNTY?: string;
  County?: string;
  COUNTY_NAM?: string;
  [key: string]: any;
}

import { NJ_BOUNDS } from './newjersey-bounds';

const COURSES_URL = '/courses.json';
const NJ_GEOJSON_LOCAL = '/nj-counties.geojson';

const courses: Course[] = [];
const map = L.map('map', {
  preferCanvas: true,
  maxBounds: L.latLngBounds(NJ_BOUNDS),
  maxBoundsViscosity: 0.8,
  zoomSnap: 0.1,
}).setView([40.150, -74.5], 8);

let njBounds: any = null;

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '© OpenStreetMap contributors',
}).addTo(map);

let countiesLayer: any = null;
let highlightedLayer: any = null;

const countySelect = document.getElementById('countySelect') as HTMLSelectElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const dateInput = document.getElementById('dateInput') as HTMLInputElement;
const modal = document.getElementById('courseModal') as HTMLElement;
const modalBody = document.getElementById('modalBody') as HTMLElement;
const modalTitle = document.getElementById('modalTitle') as HTMLElement;
const modalClose = document.getElementById('modalClose') as HTMLButtonElement;

fetch(COURSES_URL)
  .then(response => response.json())
  .then((json: Course[]) => {
    courses.push(...json);
    addCourseMarkers();
  })
  .catch(error => {
    console.error('Failed to load courses.json', error);
  });

async function loadCounties(): Promise<any> {
  const response = await fetch(NJ_GEOJSON_LOCAL);
  if (!response.ok) {
    throw new Error('Local NJ counties GeoJSON not found');
  }
  return await response.json();
}

loadCounties()
  .then(geojson => {
    countiesLayer = L.geoJSON(geojson, {
      style: { color: '#444', weight: 1, fillOpacity: 0.05 },
      onEachFeature: (feature: any, layer: any) => {
        const name = getFeatureName(feature);
        layer.bindTooltip(name, { sticky: true });

        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        countySelect.appendChild(opt);

        (layer as any).featureName = name;
      },
    }).addTo(map);

    countySelect.addEventListener('change', event => {
      const name = (event.target as HTMLSelectElement).value;
      if (!name) {
        resetView();
        return;
      }

      let found: any = null;
      countiesLayer.eachLayer((layer: any) => {
        if (layer.featureName === name) {
          found = layer;
        }
      });

      if (found) {
        highlightCounty(found);
        map.fitBounds(found.getBounds(), { padding: [20, 20] });
      } else {
        alert('County not found in GeoJSON: ' + name);
      }
    });

    njBounds = countiesLayer.getBounds();
    map.fitBounds(njBounds, { padding: [20, 20] });
    map.setMaxBounds(njBounds.pad(0.08));
  })
  .catch(error => {
    console.error(error);
    alert('Failed to load NJ counties GeoJSON. See console.');
  });

resetBtn.addEventListener('click', resetView);
modalClose.addEventListener('click', closeModal);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeModal();
  }
});

function getFeatureName(feature: any): string {
  const props = feature.properties as CountyFeatureProperties;
  return (
    props.NAME || props.county || props.COUNTY || props.County || props.COUNTY_NAM || 'Unknown'
  );
}

function highlightCounty(layer: any): void {
  if (highlightedLayer && countiesLayer) {
    countiesLayer.resetStyle(highlightedLayer);
  }
  highlightedLayer = layer;
  layer.setStyle({ color: '#2a7bd7', weight: 2, fillOpacity: 0.12 });
}

function resetView(): void {
  if (highlightedLayer && countiesLayer) {
    countiesLayer.resetStyle(highlightedLayer);
  }
  highlightedLayer = null;
  countySelect.value = '';
  if (njBounds) {
    map.fitBounds(njBounds, { padding: [20, 20] });
  } else {
    map.setView([40.150, -74.5], 8);
  }
}

function openCourseModal(course: Course | undefined): void {
  if (!course) {
    return;
  }

  modal.setAttribute('aria-hidden', 'false');
  modalTitle.textContent = course.name;

  const dateValue = dateInput.value || new Date().toISOString().slice(0, 10);
  modalBody.innerHTML = `<div class="small-muted">Fetching tee times for ${dateValue}…</div>`;

  fetchTeeTimes(course.id, dateValue)
    .then(times => {
      if (!times || times.length === 0) {
        modalBody.innerHTML = `<div>No tee times available for ${dateValue}.</div><div style="margin-top:8px"><a href="${course.bookingUrl}" target="_blank" rel="noopener">Open booking page</a></div>`;
        return;
      }

      const container = document.createElement('div');
      container.className = 'tee-list';

      times.forEach(time => {
        const row = document.createElement('div');
        row.className = 'tee-item';
        row.innerHTML = `<div><strong>${time.time}</strong> <div class="small-muted">${time.players || ''} players · ${time.rate ? '$' + time.rate : ''}</div></div><div><button data-time="${time.time}" class="bookBtn">Book</button></div>`;
        container.appendChild(row);
      });

      modalBody.innerHTML = '';
      modalBody.appendChild(container);

      container.querySelectorAll<HTMLButtonElement>('.bookBtn').forEach(button => {
        button.addEventListener('click', () => {
          window.open(course.bookingUrl, '_blank', 'noopener');
        });
      });
    })
    .catch(error => {
      console.error(error);
      modalBody.innerHTML = `<div>Error fetching tee times. See console.</div><div style="margin-top:8px"><a href="${course.bookingUrl}" target="_blank" rel="noopener">Open booking page</a></div>`;
    });
}

function closeModal(): void {
  modal.setAttribute('aria-hidden', 'true');
}

async function fetchTeeTimes(courseId: number, dateISO: string): Promise<TeeTime[]> {
  try {
    const params = new URLSearchParams({ courseId: String(courseId), date: dateISO });
    const response = await fetch('/api/teetimes?' + params.toString(), { cache: 'no-store' });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await response.json();
      }

      const text = await response.text();
      const times = extractTimesFromHtml(text);
      if (times.length > 0) {
        return times;
      }
    }
  } catch (error) {
    console.warn('Proxy fetch failed:', (error as Error).message);
  }

  return [
    { time: '07:00 AM', players: 2, rate: 25 },
    { time: '08:30 AM', players: 1, rate: 30 },
    { time: '10:00 AM', players: 4, rate: 40 },
  ];
}

function extractTimesFromHtml(html: string): TeeTime[] {
  const re = /([0-1]?\d:[0-5]\d\s?(?:AM|PM))/ig;
  const matches = Array.from(new Set((html.match(re) || []).map(s => s.trim())));
  return matches.map(time => ({ time, players: null, rate: null }));
}

function addCourseMarkers(): void {
  courses.forEach(course => {
    const marker = L.circleMarker(course.coords, {
      radius: 7,
      color: '#c53',
      fillColor: '#f55',
      fillOpacity: 0.9,
    }).addTo(map);

    marker.bindPopup(`<strong>${course.name}</strong><div class="small-muted">${course.city}</div><div style="margin-top:8px"><button data-id="${course.id}" class="openCourseBtn">View tee times</button></div>`, { minWidth: 180 });

    marker.on('popupopen', () => {
      document.querySelectorAll<HTMLButtonElement>('.openCourseBtn').forEach(button => {
        button.addEventListener('click', () => {
          openCourseModal(getCourseById(button.dataset.id));
        });
      });
    });
  });
}

function getCourseById(id: string | undefined): Course | undefined {
  return courses.find(course => String(course.id) === String(id));
}
