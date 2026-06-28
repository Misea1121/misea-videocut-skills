const path = require('path');
const fs = require('fs');

const inputFile = process.argv[2];

if (!inputFile) {
  console.log('用法：node auto_cut_suggestion.js <source.mp4 或資料夾內任一檔案路徑>');
  console.log('範例：node auto_cut_suggestion.js "D:\\Vid\\source.mp4"');
  process.exit(1);
}

const inputDir = path.dirname(inputFile);

function readJson(filename) {
  const p = path.join(inputDir, filename);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const metadata   = readJson('metadata.json');
const transcript = readJson('transcript.json');
const silence    = readJson('silence.json');
const highlights = readJson('highlights.json');
const scenes     = readJson('scene_changes.json');
const styleReport = readJson('style_report.json');

const missing = ['transcript.json', 'silence.json', 'highlights.json']
  .filter((f) => !fs.existsSync(path.join(inputDir, f)));

if (missing.length > 0) {
  console.error(`❌ 缺少必要檔案：${missing.join(', ')}`);
  process.exit(1);
}

console.log('🎬 正在生成分鏡建議頁面...');

// ── 把字幕轉成「時間軸上的事件」供 HTML 用 ──
function formatTime(sec) {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

const highlightSet = new Set(
  (highlights?.highlights || []).map((h) => h.id)
);

const deleteSet = new Set(
  (silence?.segments || [])
    .filter((s) => s.action === 'delete')
    .map((s) => `${s.start}-${s.end}`)
);

function isInDeleteZone(start, end) {
  for (const seg of silence?.segments || []) {
    if (seg.action === 'delete' && seg.start <= start && seg.end >= end) return true;
  }
  return false;
}

function getHighlightForTime(start, end) {
  return (highlights?.highlights || []).find(
    (h) => h.start <= end + 1 && h.end >= start - 1
  );
}

// 建立時間軸上的「剪輯建議清單」
const suggestions = [];
for (const seg of transcript?.segments || []) {
  const h = getHighlightForTime(seg.start, seg.end);
  const inDelete = isInDeleteZone(seg.start, seg.end);
  suggestions.push({
    start: seg.start,
    end: seg.end,
    text: seg.text,
    action: inDelete ? 'delete' : (h ? 'keep' : 'optional'),
    highlight: h || null
  });
}

// 統計
const keepCount = suggestions.filter((s) => s.action === 'keep').length;
const deleteCount = suggestions.filter((s) => s.action === 'delete').length;
const optionalCount = suggestions.filter((s) => s.action === 'optional').length;

const overallScore = styleReport?.overall_score ?? '–';
const recs = styleReport?.recommendations ?? [];

// ── 生成 HTML ──
const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>剪輯建議 — ${metadata?.filename || path.basename(inputFile)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f0f0f; color: #e0e0e0; line-height: 1.6; }
  .header { background: #1a1a2e; padding: 24px 32px; border-bottom: 2px solid #16213e; }
  .header h1 { font-size: 1.6rem; color: #e94560; margin-bottom: 8px; }
  .header .meta { font-size: 0.9rem; color: #888; }
  .stats { display: flex; gap: 16px; padding: 20px 32px; background: #16213e; flex-wrap: wrap; }
  .stat-card { background: #1a1a2e; border-radius: 8px; padding: 16px 20px; flex: 1; min-width: 140px; text-align: center; }
  .stat-card .num { font-size: 2rem; font-weight: bold; }
  .stat-card .label { font-size: 0.8rem; color: #888; margin-top: 4px; }
  .green { color: #4caf50; } .yellow { color: #ff9800; } .red { color: #f44336; } .blue { color: #2196f3; }
  .score-circle { font-size: 2.5rem; font-weight: bold; color: ${overallScore >= 80 ? '#4caf50' : overallScore >= 60 ? '#ff9800' : '#f44336'}; }
  .recs { padding: 16px 32px; background: #1a1a2e; border-left: 4px solid #ff9800; margin: 16px 32px; border-radius: 4px; }
  .recs h3 { color: #ff9800; margin-bottom: 8px; }
  .recs li { margin-left: 16px; margin-bottom: 4px; font-size: 0.9rem; color: #ccc; }
  .timeline { padding: 0 32px 32px; }
  .timeline h2 { padding: 20px 0 12px; color: #aaa; font-size: 1rem; text-transform: uppercase; letter-spacing: 1px; }
  .segment { display: flex; gap: 12px; padding: 10px 14px; border-radius: 6px; margin-bottom: 6px; border-left: 4px solid transparent; transition: background 0.15s; }
  .segment:hover { background: #1e1e3a; }
  .seg-keep { border-left-color: #4caf50; background: #0d1f0d; }
  .seg-delete { border-left-color: #f44336; background: #1f0d0d; opacity: 0.6; }
  .seg-optional { border-left-color: #444; }
  .seg-time { font-size: 0.8rem; color: #666; min-width: 80px; padding-top: 2px; font-family: monospace; }
  .seg-text { flex: 1; font-size: 0.95rem; }
  .seg-badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 12px; white-space: nowrap; align-self: flex-start; }
  .badge-keep { background: #1b5e20; color: #a5d6a7; }
  .badge-delete { background: #b71c1c; color: #ef9a9a; }
  .badge-optional { background: #263238; color: #78909c; }
  .badge-reason { font-size: 0.7rem; color: #777; margin-top: 2px; }
  .legend { display: flex; gap: 20px; padding: 12px 32px; font-size: 0.8rem; color: #888; }
  .dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; margin-right: 4px; }
</style>
</head>
<body>
<div class="header">
  <h1>🎬 剪輯分鏡建議</h1>
  <div class="meta">
    📁 ${metadata?.filename || path.basename(inputFile)} &nbsp;|&nbsp;
    ⏱ ${metadata ? Math.round(metadata.duration_seconds / 60 * 10) / 10 : '–'} 分鐘 &nbsp;|&nbsp;
    📐 ${metadata?.resolution || '–'} &nbsp;|&nbsp;
    🎞 ${metadata?.fps || '–'} fps &nbsp;|&nbsp;
    生成時間：${new Date().toLocaleString('zh-TW')}
  </div>
</div>

<div class="stats">
  <div class="stat-card"><div class="num score-circle">${overallScore}</div><div class="label">綜合評分 /100</div></div>
  <div class="stat-card"><div class="num green">${keepCount}</div><div class="label">保留片段</div></div>
  <div class="stat-card"><div class="num yellow">${optionalCount}</div><div class="label">可選片段</div></div>
  <div class="stat-card"><div class="num red">${deleteCount}</div><div class="label">建議刪除</div></div>
  <div class="stat-card"><div class="num blue">${highlights?.summary?.total_highlights ?? 0}</div><div class="label">精彩時刻</div></div>
  <div class="stat-card"><div class="num">${silence?.summary?.delete_suggested_count ?? 0}</div><div class="label">長靜音段落</div></div>
</div>

${recs.length > 0 ? `
<div class="recs">
  <h3>💡 剪輯建議</h3>
  <ul>${recs.map((r) => `<li>${r}</li>`).join('')}</ul>
</div>` : ''}

<div class="legend">
  <span><span class="dot" style="background:#4caf50"></span>綠色 = 精彩，優先保留</span>
  <span><span class="dot" style="background:#f44336"></span>紅色 = 長靜音，建議刪除</span>
  <span><span class="dot" style="background:#444"></span>灰色 = 普通，可視需要保留</span>
</div>

<div class="timeline">
  <h2>逐段時間軸（共 ${suggestions.length} 段）</h2>
  ${suggestions.map((s) => {
    const cls = `seg-${s.action}`;
    const badgeCls = `badge-${s.action}`;
    const badgeText = s.action === 'keep' ? '⭐ 精彩' : s.action === 'delete' ? '✂️ 刪除' : '・普通';
    const reason = s.highlight?.reason ?? '';
    return `<div class="segment ${cls}">
      <div class="seg-time">${formatTime(s.start)} → ${formatTime(s.end)}</div>
      <div class="seg-text">
        ${s.text || '<em style="color:#555">（無字幕）</em>'}
        ${reason ? `<div class="badge-reason">${reason}</div>` : ''}
      </div>
      <span class="seg-badge ${badgeCls}">${badgeText}</span>
    </div>`;
  }).join('\n  ')}
</div>
</body>
</html>`;

const outputHtml = path.join(inputDir, 'suggestions.html');
fs.writeFileSync(outputHtml, html, 'utf8');

console.log('✅ 分鏡建議頁面生成完成！');
console.log('─────────────────────────');
console.log(`📊 綜合評分　　：${overallScore} / 100`);
console.log(`✅ 保留片段　　：${keepCount} 段`);
console.log(`⚠️  可選片段　　：${optionalCount} 段`);
console.log(`✂️  建議刪除　　：${deleteCount} 段`);
console.log(`💾 輸出路徑　　：${outputHtml}`);
console.log('─────────────────────────');
console.log('👉 用瀏覽器打開 suggestions.html 就可以看到完整分鏡建議！');
