const http = require('http');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const inputFile = process.argv[2];

if (!inputFile) {
  console.log('用法：node review_server.js <source.mp4 或資料夾內任一檔案路徑>');
  console.log('範例：node review_server.js "D:\\Vid\\source.mp4"');
  process.exit(1);
}

const dataDir = path.dirname(path.resolve(inputFile));
const PORT = 3000;

function readJson(f) {
  const p = path.join(dataDir, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

const transcript = readJson('transcript.json');
const silence    = readJson('silence.json');
const highlights = readJson('highlights.json');
const metadata   = readJson('metadata.json');
const style      = readJson('style_report.json');

if (!transcript) {
  console.error('❌ 找不到 transcript.json，請先執行 Skill 2 的各腳本');
  process.exit(1);
}

// 預先建立「建議動作」對照表
function buildInitialDecisions() {
  const deleteSilenceRanges = (silence?.segments || []).filter((s) => s.action === 'delete');
  const highlightMap = {};
  (highlights?.highlights || []).forEach((h) => { highlightMap[h.id] = h; });

  function isInDelete(start, end) {
    return deleteSilenceRanges.some((r) => r.start <= start && r.end >= end);
  }

  function getHighlight(start, end) {
    return (highlights?.highlights || []).find((h) => h.start <= end + 1 && h.end >= start - 1);
  }

  return (transcript.segments || []).map((seg) => {
    const h = getHighlight(seg.start, seg.end);
    const inDelete = isInDelete(seg.start, seg.end);
    return {
      id: seg.id,
      start: seg.start,
      end: seg.end,
      text: seg.text,
      action: inDelete ? 'delete' : (h ? 'keep' : 'optional'),
      reason: h?.reason ?? '',
      score: h?.score ?? 0,
      note: ''
    };
  });
}

let decisions = buildInitialDecisions();
const confirmedPath = path.join(dataDir, 'confirmed_cuts.json');

// ── 產生審核頁面 HTML ──
function buildPage() {
  const keepCount = decisions.filter((d) => d.action === 'keep').length;
  const deleteCount = decisions.filter((d) => d.action === 'delete').length;
  const optCount = decisions.filter((d) => d.action === 'optional').length;
  const score = style?.overall_score ?? '–';

  const rows = decisions.map((d) => {
    const cls = d.action === 'keep' ? 'keep' : d.action === 'delete' ? 'del' : 'opt';
    const badge = d.action === 'keep' ? '⭐ 保留' : d.action === 'delete' ? '✂️ 刪除' : '・可選';
    const time = `${fmt(d.start)} → ${fmt(d.end)}`;
    return `<tr class="row ${cls}" data-id="${d.id}">
      <td class="td-time">${time}</td>
      <td class="td-text">${d.text || ''}<div class="reason">${d.reason}</div></td>
      <td class="td-note"><input class="note-input" placeholder="備註" value="${d.note || ''}" onchange="updateNote(${d.id},this.value)"></td>
      <td class="td-action">
        <button onclick="setAction(${d.id},'keep')" class="btn-keep">保留</button>
        <button onclick="setAction(${d.id},'optional')" class="btn-opt">可選</button>
        <button onclick="setAction(${d.id},'delete')" class="btn-del">刪除</button>
      </td>
      <td class="td-badge badge-${d.action}">${badge}</td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>審核確認 — ${metadata?.filename || ''}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#0f0f0f;color:#e0e0e0}
  .header{background:#1a1a2e;padding:18px 28px;border-bottom:2px solid #16213e;display:flex;align-items:center;gap:20px;flex-wrap:wrap}
  .header h1{font-size:1.4rem;color:#e94560;flex:1}
  .stats{display:flex;gap:10px;flex-wrap:wrap;padding:14px 28px;background:#16213e}
  .sc{background:#1a1a2e;border-radius:6px;padding:10px 16px;text-align:center;min-width:100px}
  .sc .n{font-size:1.5rem;font-weight:bold}.sc .l{font-size:0.75rem;color:#888;margin-top:2px}
  .toolbar{padding:12px 28px;display:flex;gap:10px;align-items:center;background:#111;border-bottom:1px solid #222;flex-wrap:wrap}
  .save-btn{background:#e94560;color:#fff;border:none;padding:10px 24px;border-radius:6px;font-size:1rem;cursor:pointer;font-weight:bold}
  .save-btn:hover{background:#c73652}
  .filter-btn{background:#1a1a2e;color:#ccc;border:1px solid #333;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:0.85rem}
  .filter-btn.active{border-color:#e94560;color:#e94560}
  .saved{color:#4caf50;font-size:0.9rem;display:none}
  table{width:100%;border-collapse:collapse}
  .td-time{width:110px;font-family:monospace;font-size:0.8rem;color:#64b5f6;padding:10px 14px;vertical-align:top}
  .td-text{padding:10px 8px;font-size:0.9rem;vertical-align:top}
  .td-note{width:160px;padding:8px;vertical-align:top}
  .td-action{width:200px;padding:8px;vertical-align:top;white-space:nowrap}
  .td-badge{width:80px;text-align:center;font-size:0.8rem;vertical-align:top;padding:10px 4px}
  .reason{font-size:0.75rem;color:#ff9800;margin-top:3px}
  .note-input{background:#111;border:1px solid #333;color:#ccc;padding:4px 8px;border-radius:4px;width:100%;font-size:0.8rem}
  .note-input:focus{outline:none;border-color:#e94560}
  tr.keep{background:#0d1a0d;border-left:3px solid #4caf50}
  tr.del{background:#1a0d0d;border-left:3px solid #f44336;opacity:0.65}
  tr.opt{border-left:3px solid #333}
  tr:hover{filter:brightness(1.2)}
  .btn-keep,.btn-opt,.btn-del{border:none;border-radius:4px;padding:5px 10px;font-size:0.8rem;cursor:pointer;margin-right:4px}
  .btn-keep{background:#1b5e20;color:#a5d6a7}.btn-keep:hover{background:#2e7d32}
  .btn-opt{background:#263238;color:#90a4ae}.btn-opt:hover{background:#37474f}
  .btn-del{background:#b71c1c;color:#ef9a9a}.btn-del:hover{background:#c62828}
  .badge-keep{color:#a5d6a7}.badge-delete{color:#ef9a9a}.badge-optional{color:#78909c}
  .hidden{display:none!important}
</style>
</head>
<body>
<div class="header">
  <h1>🎬 審核確認</h1>
  <span style="color:#888;font-size:0.85rem">📁 ${metadata?.filename || ''} &nbsp;|&nbsp; ⏱ ${metadata ? Math.round(metadata.duration_seconds / 60 * 10) / 10 : '–'} 分鐘</span>
</div>

<div class="stats">
  <div class="sc"><div class="n" style="color:#ff9800">${score}</div><div class="l">綜合評分</div></div>
  <div class="sc" id="cnt-keep"><div class="n" style="color:#4caf50">${keepCount}</div><div class="l">保留</div></div>
  <div class="sc" id="cnt-opt"><div class="n" style="color:#888">${optCount}</div><div class="l">可選</div></div>
  <div class="sc" id="cnt-del"><div class="n" style="color:#f44336">${deleteCount}</div><div class="l">刪除</div></div>
  <div class="sc"><div class="n">${decisions.length}</div><div class="l">總段落</div></div>
</div>

<div class="toolbar">
  <button class="save-btn" onclick="saveDecisions()">💾 儲存確認結果</button>
  <span class="saved" id="saved-msg">✅ 已儲存 confirmed_cuts.json！</span>
  <button class="filter-btn active" onclick="filterAll(this)">全部</button>
  <button class="filter-btn" onclick="filterBy('keep',this)">⭐ 保留</button>
  <button class="filter-btn" onclick="filterBy('optional',this)">・可選</button>
  <button class="filter-btn" onclick="filterBy('delete',this)">✂️ 刪除</button>
</div>

<table id="main-table"><tbody>${rows}</tbody></table>

<script>
const state = ${JSON.stringify(decisions)};

function fmt(sec){const s=Math.floor(sec);return Math.floor(s/60)+':'+(s%60).toString().padStart(2,'0')}

function setAction(id, action) {
  const item = state.find(d => d.id === id);
  if (item) item.action = action;
  const row = document.querySelector('tr[data-id="'+id+'"]');
  row.className = 'row ' + (action === 'keep' ? 'keep' : action === 'delete' ? 'del' : 'opt');
  row.querySelector('.td-badge').className = 'td-badge badge-' + action;
  row.querySelector('.td-badge').textContent = action === 'keep' ? '⭐ 保留' : action === 'delete' ? '✂️ 刪除' : '・可選';
  updateCounts();
}

function updateNote(id, val) {
  const item = state.find(d => d.id === id);
  if (item) item.note = val;
}

function updateCounts() {
  document.querySelector('#cnt-keep .n').textContent = state.filter(d => d.action === 'keep').length;
  document.querySelector('#cnt-opt .n').textContent = state.filter(d => d.action === 'optional').length;
  document.querySelector('#cnt-del .n').textContent = state.filter(d => d.action === 'delete').length;
}

function filterBy(action, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#main-table tr').forEach(row => {
    row.classList.toggle('hidden', !row.classList.contains(action === 'keep' ? 'keep' : action === 'delete' ? 'del' : 'opt'));
  });
}

function filterAll(btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#main-table tr').forEach(row => row.classList.remove('hidden'));
}

function saveDecisions() {
  fetch('/api/save', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(state)
  }).then(r => r.json()).then(data => {
    const msg = document.getElementById('saved-msg');
    msg.style.display = 'inline';
    setTimeout(() => { msg.style.display = 'none'; }, 3000);
  });
}
</script>
</body>
</html>`;
}

function fmt(sec) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// ── HTTP 伺服器 ──
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildPage());
  } else if (req.method === 'POST' && req.url === '/api/save') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        decisions = data;
        const output = {
          confirmed_at: new Date().toISOString(),
          total: data.length,
          keep: data.filter((d) => d.action === 'keep').length,
          optional: data.filter((d) => d.action === 'optional').length,
          delete: data.filter((d) => d.action === 'delete').length,
          segments: data
        };
        fs.writeFileSync(confirmedPath, JSON.stringify(output, null, 2), 'utf8');
        console.log(`✅ 已儲存 confirmed_cuts.json（保留:${output.keep} 可選:${output.optional} 刪除:${output.delete}）`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400); res.end('{}');
      }
    });
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log(`✅ 審核伺服器已啟動！`);
  console.log(`─────────────────────────`);
  console.log(`🌐 請在瀏覽器打開：http://localhost:${PORT}`);
  console.log(`📁 資料來源：${dataDir}`);
  console.log(`💾 結果將存到：${confirmedPath}`);
  console.log(`─────────────────────────`);
  console.log(`按 Ctrl+C 停止伺服器`);
  // 自動開啟瀏覽器
  exec(`start http://localhost:${PORT}`);
});
