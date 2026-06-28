const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const inputFile = process.argv[2];

if (!inputFile) {
  console.log('用法：node generate_storyboard.js <source.mp4路徑>');
  console.log('範例：node generate_storyboard.js "D:\\Vid\\source.mp4"');
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`❌ 找不到檔案：${inputFile}`);
  process.exit(1);
}

const inputDir = path.dirname(inputFile);

function readJson(f) {
  const p = path.join(inputDir, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

const highlights = readJson('highlights.json');
const transcript = readJson('transcript.json');
const metadata   = readJson('metadata.json');

if (!highlights) {
  console.error('❌ 找不到 highlights.json，請先執行 Skill 2 的 highlight_detector.js');
  process.exit(1);
}

const thumbDir = path.join(inputDir, 'thumbnails');
if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir);

const items = highlights.highlights || [];
console.log(`🎬 開始生成分鏡頁面，共 ${items.length} 個精彩片段`);
console.log('📷 正在擷取縮圖（每個片段抽 1 張）...');

// 用 ffmpeg 擷取每個 highlight 起始幀的縮圖
async function extractThumb(item) {
  return new Promise((resolve) => {
    const outPath = path.join(thumbDir, `thumb_${item.id}.jpg`);
    if (fs.existsSync(outPath)) { resolve(outPath); return; }

    const ff = spawn('ffmpeg', [
      '-ss', String(item.start),
      '-i', inputFile,
      '-frames:v', '1',
      '-q:v', '3',
      '-vf', 'scale=320:-1',
      '-y', outPath
    ]);
    ff.stderr.on('data', () => {});
    ff.on('close', () => resolve(fs.existsSync(outPath) ? outPath : null));
  });
}

(async () => {
  // 依序擷取（避免同時開太多 ffmpeg process）
  const thumbPaths = [];
  for (let i = 0; i < items.length; i++) {
    process.stdout.write(`\r  進度：${i + 1}/${items.length}`);
    thumbPaths.push(await extractThumb(items[i]));
  }
  console.log('\n');

  function formatTime(sec) {
    const s = Math.floor(sec);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  }

  const cards = items.map((item, i) => {
    const thumbFile = thumbPaths[i] ? `thumbnails/thumb_${item.id}.jpg` : '';
    const imgTag = thumbFile
      ? `<img src="${thumbFile}" alt="縮圖" loading="lazy">`
      : `<div class="no-thumb">無縮圖</div>`;
    const scoreColor = item.score >= 4 ? '#e94560' : item.score >= 2 ? '#ff9800' : '#4caf50';
    return `
    <div class="card" data-id="${item.id}" data-start="${item.start}" data-end="${item.end}">
      <div class="thumb">${imgTag}</div>
      <div class="info">
        <div class="time">⏱ ${formatTime(item.start)} → ${formatTime(item.end)}</div>
        <div class="reason">${item.reason || ''}</div>
        <div class="text">${(item.text || '').trim().slice(0, 60)}</div>
        <div class="score" style="color:${scoreColor}">⭐ 分數 ${item.score}</div>
      </div>
    </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>分鏡頁面 — ${metadata?.filename || path.basename(inputFile)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f0f0f; color: #e0e0e0; margin: 0; padding: 24px; }
  h1 { color: #e94560; margin-bottom: 8px; }
  .meta { color: #888; font-size: 0.85rem; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
  .card { background: #1a1a2e; border-radius: 10px; overflow: hidden; border: 2px solid #16213e; transition: border-color 0.2s; }
  .card:hover { border-color: #e94560; }
  .thumb img { width: 100%; height: 160px; object-fit: cover; display: block; }
  .no-thumb { width: 100%; height: 160px; background: #111; display: flex; align-items: center; justify-content: center; color: #555; font-size: 0.8rem; }
  .info { padding: 12px 14px; }
  .time { font-family: monospace; font-size: 0.85rem; color: #64b5f6; margin-bottom: 4px; }
  .reason { font-size: 0.75rem; color: #ff9800; margin-bottom: 6px; min-height: 1em; }
  .text { font-size: 0.9rem; color: #ccc; margin-bottom: 8px; min-height: 1.4em; }
  .score { font-size: 0.8rem; font-weight: bold; }
</style>
</head>
<body>
<h1>🎬 分鏡頁面</h1>
<div class="meta">
  📁 ${metadata?.filename || path.basename(inputFile)} &nbsp;|&nbsp;
  ⏱ ${metadata ? Math.round(metadata.duration_seconds / 60 * 10) / 10 : '–'} 分鐘 &nbsp;|&nbsp;
  共 ${items.length} 個精彩片段 &nbsp;|&nbsp;
  生成：${new Date().toLocaleString('zh-TW')}
</div>
<div class="grid">
${cards}
</div>
</body>
</html>`;

  const outputHtml = path.join(inputDir, 'storyboard.html');
  fs.writeFileSync(outputHtml, html, 'utf8');

  console.log('✅ 分鏡頁面生成完成！');
  console.log('─────────────────────────');
  console.log(`🎬 精彩片段　：${items.length} 個`);
  console.log(`📷 縮圖位置　：${thumbDir}`);
  console.log(`💾 輸出路徑　：${outputHtml}`);
  console.log('─────────────────────────');
  console.log('👉 用瀏覽器打開 storyboard.html 查看視覺分鏡！');
})();
