# turnpike-tee-times — feature/map-and-proxy

This branch adds a single-page map-based viewer and a minimal server proxy to fetch tee times.

What I added
- index.html, style.css, app.js — single-page app using Leaflet.
- data/courses.json — course list (Francis Byrne, Old Bridge, Heron Glen).
- server-proxy.js — minimal Express proxy that fetches tee times from configured templates.
- fetch-geojson.sh — helper script to download NJ counties GeoJSON into data/nj-counties.geojson.

How it works
- Frontend attempts to load data/nj-counties.geojson locally; if missing it falls back to the NJ Open Data ArcGIS GeoJSON URL.
- Courses are loaded from data/courses.json and shown as markers.
- Clicking a course opens a modal; the frontend calls /api/teetimes?courseId=<id>&date=YYYY-MM-DD to get tee times.
- The proxy looks up the course.teeTimesUrlTemplate, fetches it, and returns parsed times (or raw HTML snippet) as JSON.

Run locally
1) Clone the repo and checkout feature/map-and-proxy branch.
2) (Optional) Download NJ GeoJSON into data/:
   ./fetch-geojson.sh
3) Serve the frontend as a static site (or use the proxy):
   - To run the proxy + static files:
     npm install express node-fetch@2
     node server-proxy.js
     Open http://localhost:3000 in the browser (the express server serves only the API and static files if you place them under public/ — otherwise run a static server in repo root)

Notes
- foreUP (Francis Byrne) may not allow scraping and likely requires official API credentials. The proxy will return raw HTML for non-JSON endpoints; you'll need to implement HTML parsing or obtain API access.
- teeitup endpoints (Old Bridge, Heron Glen) provided in the branch are used in data/courses.json and may return HTML or JSON — the proxy attempts to parse time strings but this is best-effort.

Next steps I can take
- Improve server parsing for teeitup/foreup to return structured JSON reliably.
- Add UI for uploading new courses, clustering, search, and mobile improvements.

