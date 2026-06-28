/**
 * update_transcript.js
 * 把手動修正過的 transcript_readable.txt 寫回 transcript.json
 *
 * 用法：node update_transcript.js <transcript_readable.txt 路徑>
 */

const path = require('path');
const fs   = require('fs');

const inputFile = process.argv[2];
if (!inputFile || !fs.existsSync(inputFile)) {
  console.error('用法：node update_transcript.js <transcript_readable.txt 路徑>');
  process.exit(1);
}

function parseTime(t) {
  const parts = t.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

const lines = fs.readFileSync(inputFile, 'utf8').split('\n');
const re = /^\[(\d+:\d+(?::\d+)?) → (\d+:\d+(?::\d+)?)\] \([\d.]+s\)\s+(.*)$/;

const segments = [];
for (const line of lines) {
  const m = line.trim().match(re);
  if (!m) continue;
  let text = m[3].trim();
  if (text.startsWith('- ')) text = text.slice(2);
  if (!text) continue;
  segments.push({
    id: segments.length,
    start: Math.round(parseTime(m[1]) * 100) / 100,
    end:   Math.round(parseTime(m[2]) * 100) / 100,
    text
  });
}

const dir = path.dirname(inputFile);
const jsonPath = path.join(dir, 'transcript.json');
const existing = fs.existsSync(jsonPath)
  ? JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  : {};

existing.segments    = segments;
existing.char_count  = segments.reduce((a, s) => a + s.text.length, 0);
existing.updated_at  = new Date().toISOString();

fs.writeFileSync(jsonPath, JSON.stringify(existing, null, 2), 'utf8');
console.log(`✅ transcript.json 已更新（${segments.length} 段，修正版）`);
