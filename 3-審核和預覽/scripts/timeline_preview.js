const path = require('path');
const fs = require('fs');

const inputFile = process.argv[2];

if (!inputFile) {
  console.log('用法：node timeline_preview.js <source.mp4 或資料夾內任一檔案路徑>');
  console.log('範例：node timeline_preview.js "D:\\Vid\\source.mp4"');
  process.exit(1);
}

const inputDir = path.dirname(inputFile);

function readJson(f) {
  const p = path.join(inputDir, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

const metadata  = readJson('metadata.json');
const silence   = readJson('silence.json');
const highlights = readJson('highlights.json');
const transcript = readJson('transcript.json');
const scenes    = readJson('scene_changes.json');

if (!metadata) {
  console.error('❌ 找不到 metadata.json，請先執行 Skill 1 的 format_detection.js');
  process.exit(1);
}

console.log('📊 正在生成時間軸預覽...');

const duration = metadata.duration_seconds;

// 把秒數轉成 0~100 的百分比位置
function pct(sec) { return Math.round((sec / duration) * 10000) / 100; }

function formatTime(sec) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// ── 靜音軌道 ──
const silenceBars = (silence?.segments || []).map((s) => {
  if (s.start === null || s.end === null) return '';
  const color = s.action === 'delete' ? '#f44336aa' : '#ff980066';
  const left = pct(s.start);
  const width = Math.max(0.1, pct(s.end) - pct(s.start));
  return `<div class="bar" style="left:${left}%;width:${width}%;background:${color}" title="${formatTime(s.start)}→${formatTime(s.end)} (${s.action})"></div>`;
}).join('');

// ── 精彩時刻軌道 ──
const highlightBars = (highlights?.highlights || []).map((h) => {
  const left = pct(h.start);
  const width = Math.max(0.2, pct(h.end) - pct(h.start));
  const intensity = Math.min(h.score * 20, 100);
  return `<div class="bar" style="left:${left}%;width:${width}%;background:rgba(233,69,96,${intensity / 100})" title="⭐${h.score} ${formatTime(h.start)}→${formatTime(h.end)}&#10;${(h.reason||'').slice(0,40)}"></div>`;
}).join('');

// ── 說話段落軌道 ──
const segBars = (transcript?.segments || []).map((s) => {
  const left = pct(s.start);
  const width = Math.max(0.05, pct(s.end) - pct(s.start));
  return `<div class="bar" style="left:${left}%;width:${width}%;background:#4caf5088" title="${formatTime(s.start)} ${(s.text||'').slice(0,30)}"></div>`;
}).join('');

// ── 場景切換標記 ──
const sceneMarkers = (scenes?.scenes || []).map((s) => {
  if (s.timestamp === null) return '';
  const left = pct(s.timestamp);
  return `<div class="marker" style="left:${left}%" title="場景切換 ${formatTime(s.timestamp)}"></div>`;
}).join('');

// ── 時間刻度 ──
const tickCount = 10;
const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
  const sec = (duration / tickCount) * i;
  return `<div class="tick" style="left:${(i / tickCount) * 100}%">${formatTime(sec)}</div>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>時間軸預覽 — ${metadata.filename || path.basename(inputFile)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f0f0f; color: #e0e0e0; padding: 28px 32px; }
  h1 { color: #e94560; margin-bottom: 6px; }
  .meta { color: #888; font-size: 0.85rem; margin-bottom: 28px; }
  .track-wrap { margin-bottom: 20px; }
  .track-label { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .track { position: relative; height: 28px; background: #1a1a2e; border-radius: 4px; overflow: hidden; }
  .bar { position: absolute; top: 0; height: 100%; border-radius: 2px; }
  .marker { position: absolute; top: 0; width: 2px; height: 100%; background: #fff; opacity: 0.6; }
  .ticks { position: relative; height: 20px; margin-top: 4px; }
  .tick { position: absolute; font-size: 0.7rem; color: #555; transform: translateX(-50%); }
  .legend { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 28px; font-size: 0.8rem; color: #888; }
  .dot { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
  .stats { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 28px; }
  .stat { background: #1a1a2e; border-radius: 8px; padding: 12px 18px; text-align: center; }
  .stat .n { font-size: 1.6rem; font-weight: bold; }
  .stat .l { font-size: 0.75rem; color: #888; margin-top: 2px; }
</style>
</head>
<body>
<h1>📊 時間軸預覽</h1>
<div class="meta">
  📁 ${metadata.filename || path.basename(inputFile)} &nbsp;|&nbsp;
  ⏱ ${Math.round(duration / 60 * 10) / 10} 分鐘 &nbsp;|&nbsp;
  ${metadata.resolution} ${metadata.fps}fps &nbsp;|&nbsp;
  生成：${new Date().toLocaleString('zh-TW')}
</div>

<div class="stats">
  <div class="stat"><div class="n" style="color:#4caf50">${transcript?.segments?.length ?? 0}</div><div class="l">說話段落</div></div>
  <div class="stat"><div class="n" style="color:#e94560">${highlights?.summary?.total_highlights ?? 0}</div><div class="l">精彩片段</div></div>
  <div class="stat"><div class="n" style="color:#f44336">${silence?.summary?.delete_suggested_count ?? 0}</div><div class="l">建議刪除靜音</div></div>
  <div class="stat"><div class="n" style="color:#888">${scenes?.summary?.total_scene_changes ?? 0}</div><div class="l">場景切換</div></div>
</div>

<div class="track-wrap">
  <div class="track-label">說話段落</div>
  <div class="track">${segBars}</div>
</div>

<div class="track-wrap">
  <div class="track-label">靜音區域（橘=標記 紅=建議刪除）</div>
  <div class="track">${silenceBars}</div>
</div>

<div class="track-wrap">
  <div class="track-label">精彩時刻（顏色越深分數越高）</div>
  <div class="track">${highlightBars}${sceneMarkers}</div>
</div>

<div class="ticks">${ticks}</div>

<div class="legend">
  <span><span class="dot" style="background:#4caf5088"></span>說話段落</span>
  <span><span class="dot" style="background:#ff980066"></span>靜音（標記）</span>
  <span><span class="dot" style="background:#f44336aa"></span>靜音（建議刪除）</span>
  <span><span class="dot" style="background:#e9456099"></span>精彩時刻</span>
  <span><span class="dot" style="background:#fff6"></span>場景切換</span>
</div>
</body>
</html>`;

const outputHtml = path.join(inputDir, 'timeline.html');
fs.writeFileSync(outputHtml, html, 'utf8');

console.log('✅ 時間軸預覽生成完成！');
console.log(`💾 輸出路徑：${outputHtml}`);
console.log('👉 用瀏覽器打開 timeline.html 查看完整時間軸！');
