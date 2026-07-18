import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

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
  players?: number | null;
  rate?: number | null;
}

const app = express();
const PORT = process.env.PORT || 3000;
const ENV = process.env.NODE_ENV || 'development';
const COURSES_PATH = path.join(__dirname, '../data/courses.json');

let courses: Course[] = [];

try {
  const raw = fs.readFileSync(COURSES_PATH, 'utf8');
  courses = JSON.parse(raw) as Course[];
} catch (error) {
  console.warn('Could not load courses.json', error);
}

async function setupServer(): Promise<void> {
  if (ENV === 'development') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, '../dist')));
  }

  app.use(express.static(path.join(__dirname, '../data')));
  app.use('/data', express.static(path.join(__dirname, '../data')));

  app.get('/api/teetimes', async (req, res) => {
  const courseId = String(req.query.courseId || '');
  const date = String(req.query.date || '');

  if (!courseId || !date) {
    return res.status(400).json({ error: 'Missing courseId or date' });
  }

  const course = courses.find(c => String(c.id) === courseId);
  if (!course) {
    return res.status(404).json({ error: 'Course not found' });
  }

  if (!course.teeTimesUrlTemplate) {
    return res.status(400).json({ error: 'No teeTimesUrlTemplate for course' });
  }

  const url = course.teeTimesUrlTemplate.replace('{date}', encodeURIComponent(date));

  try {
    const upstreamRes = await fetch(url, { headers: { 'User-Agent': 'TeeTimesMap/1.0' } });
    const contentType = upstreamRes.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const json = await upstreamRes.json();
      return res.json(json);
    }

    const text = await upstreamRes.text();
    const times = extractTimesFromHtml(text);
    return res.json({ parsed: times, rawHtmlSnippet: text.slice(0, 800) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: String(error) });
  }
  });
}

function extractTimesFromHtml(html: string): TeeTime[] {
  const re = /([0-1]?\d:[0-5]\d\s?(?:AM|PM))/ig;
  const matches = Array.from(new Set((html.match(re) || []).map(s => s.trim())));
  return matches.map(time => ({ time }));
}

setupServer().then(() => {
  app.listen(PORT, () => {
    console.log(`Proxy listening on http://localhost:${PORT}`);
  });
}).catch(error => {
  console.error('Failed to set up server:', error);
  process.exit(1);
});
