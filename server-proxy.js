// server-proxy.js
// Minimal Express proxy to fetch tee times from known provider endpoints.
// It looks up the course by id in data/courses.json and fetches the course.teeTimesUrlTemplate
// replacing {date} with the requested date. If response is JSON it is returned as-is.
// If HTML, the server returns the HTML for debugging and also tries to extract time strings
// and return a minimal JSON array.

const express = require('express');
const fetch = require('node-fetch'); // npm i node-fetch@2
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const COURSES_PATH = path.join(__dirname, 'data', 'courses.json');
let courses = [];
try { courses = JSON.parse(fs.readFileSync(COURSES_PATH, 'utf8')); } catch (e) { console.warn('Could not load courses.json', e.message); }

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/teetimes', async (req, res) => {
  const { courseId, date } = req.query;
  if (!courseId || !date) return res.status(400).json({ error: 'Missing courseId or date' });
  const course = courses.find(c => String(c.id) === String(courseId));
  if (!course) return res.status(404).json({ error: 'Course not found' });
  if (!course.teeTimesUrlTemplate) return res.status(400).json({ error: 'No teeTimesUrlTemplate for course' });

  const url = course.teeTimesUrlTemplate.replace('{date}', encodeURIComponent(date));
  try {
    const upstreamRes = await fetch(url, { headers: { 'User-Agent':'TeeTimesMap/1.0' } });
    const contentType = upstreamRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await upstreamRes.json();
      return res.json(json);
    }
    const text = await upstreamRes.text();
    // try to extract time strings (simple)
    const times = extractTimesFromHtml(text);
    // return both html and parsed times for debugging
    return res.json({ parsed: times, rawHtmlSnippet: text.slice(0, 800) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

function extractTimesFromHtml(html){
  const re = /([0-1]?\d:[0-5]\d\s?(?:AM|PM))/ig;
  const matches = Array.from(new Set((html.match(re) || []).map(s=>s.trim())));
  return matches.map(t => ({ time: t }));
}

app.listen(PORT, () => console.log(`Proxy listening on http://localhost:${PORT}`));
