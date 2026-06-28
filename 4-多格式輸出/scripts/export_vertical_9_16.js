const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');


const inputFile = process.argv[2];

if (!inputFile) {
  console.log('用法：node export_vertical_9_16.js <source.mp4路徑>');
  process.exit(1);
}
if (!fs.existsSync(inputFile)) { console.error(`❌ 找不到影片：${inputFile}`); process.exit(1); }

const inputDir  = path.dirname(path.resolve(inputFile));
const outputMp4 = path.join(inputDir, 'output_shorts.mp4');

function readJson(f) {
  const p = path.join(inputDir, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

const confirmedCuts = readJson('confirmed_cuts.json');
const highlights    = readJson('highlights.json');
const transcript    = readJson('transcript.json');

let keepSegs;
if (confirmedCuts) {
  keepSegs = (confirmedCuts.segments || []).filter(s => s.action === 'keep').sort((a,b) => a.start - b.start);
  console.log(`📋 使用 confirmed_cuts.json（${keepSegs.length} 段）`);
} else if (highlights) {
  keepSegs = (highlights.highlights || []).sort((a,b) => a.start - b.start);
  console.log(`📋 使用 highlights.json（${keepSegs.length} 段）`);
} else {
  console.error('❌ 找不到 confirmed_cuts.json 或 highlights.json'); process.exit(1);
}
if (keepSegs.length === 0) { console.error('❌ 沒有可輸出的片段'); process.exit(1); }

// ── 字幕時間重新對應 ──
// 原始字幕時間是整部影片的時間軸，剪輯後需要換算成新影片的時間
function remapSubtitles(keepSegs, transcriptSegs) {
  if (!transcriptSegs) return [];
  const result = [];
  let cumTime = 0;
  for (const clip of keepSegs) {
    const clipDur = clip.end - clip.start;
    for (const ts of transcriptSegs) {
      if (ts.start >= clip.end || ts.end <= clip.start) continue;
      const newStart = cumTime + Math.max(0, ts.start - clip.start);
      const newEnd   = cumTime + Math.min(clipDur, ts.end - clip.start);
      if (newEnd > newStart && ts.text?.trim()) {
        result.push({ start: newStart, end: newEnd, text: ts.text.trim() });
      }
    }
    cumTime += clipDur;
  }
  return result;
}

// ── 生成 ASS 字幕（Shorts 風格：大字、彩色、輪流黃白） ──
function generateASS(remappedSegs) {
  function toT(sec) {
    const h  = Math.floor(sec / 3600);
    const m  = Math.floor((sec % 3600) / 60);
    const s  = Math.floor(sec % 60);
    const cs = Math.round((sec % 1) * 100);
    return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}.${cs.toString().padStart(2,'0')}`;
  }

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: White,Arial,62,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,5,1,2,60,60,130,1
Style: Yellow,Arial,62,&H0000FFFF,&H0000FFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,5,1,2,60,60,130,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = [];
  let toggle = false;

  for (const seg of remappedSegs) {
    const dur = seg.end - seg.start;
    if (dur <= 0) continue;
    const text = seg.text;

    // 每 8 個中文字換一行，讓字幕快速切換（Shorts 感）
    const MAX = 8;
    const chunks = [];
    for (let i = 0; i < text.length; i += MAX) chunks.push(text.slice(i, i + MAX));

    const chunkDur = dur / chunks.length;
    for (let i = 0; i < chunks.length; i++) {
      const t0 = seg.start + i * chunkDur;
      const t1 = seg.start + (i + 1) * chunkDur;
      events.push(`Dialogue: 0,${toT(t0)},${toT(t1)},${toggle ? 'Yellow' : 'White'},,0,0,0,,${chunks[i]}`);
    }
    toggle = !toggle; // 每段對話切換顏色
  }

  return header + '\n' + events.join('\n') + '\n';
}

const remapped = remapSubtitles(keepSegs, transcript?.segments);
console.log(`📝 字幕：${remapped.length} 段（已重新對應剪輯後時間軸）`);

// 把 ASS 寫到影片同資料夾（避免 tmpdir 短路徑造成 ffmpeg 解析失敗）
const assPath = path.join(inputDir, '_shorts_subtitle.ass');
if (remapped.length > 0) {
  fs.writeFileSync(assPath, generateASS(remapped), 'utf8');
}

console.log(`🎬 開始輸出豎屏版本（9:16 Shorts 滿版）`);
console.log(`✂️  剪輯片段數：${keepSegs.length}`);
console.log('⏳ 請稍候...\n');

// ── 建立 filter_complex：trim + 中心裁切到 9:16 ──
const filterParts = [];
const vParts = [], aParts = [];

keepSegs.forEach((seg, i) => {
  // 從 1920x1080 中心裁出 608x1080，再縮放到 1080x1920（滿版 9:16）
  filterParts.push(
    `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS,` +
    `crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920[v${i}]`
  );
  filterParts.push(
    `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}]`
  );
  vParts.push(`[v${i}]`);
  aParts.push(`[a${i}]`);
});

const concatStr = keepSegs.map((_,i) => `[v${i}][a${i}]`).join('');
filterParts.push(`${concatStr}concat=n=${keepSegs.length}:v=1:a=1[vout][aout]`);

let filterComplex = filterParts.join(';');
let finalVideo = '[vout]';

// 燒錄字幕（subtitles 濾鏡，與橫屏版本用同樣的路徑跳脫方式）
if (remapped.length > 0) {
  const assEsc = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  filterComplex += `;[vout]subtitles='${assEsc}'[vfinal]`;
  finalVideo = '[vfinal]';
}

const args = [
  '-i', inputFile,
  '-filter_complex', filterComplex,
  '-map', finalVideo,
  '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'fast',
  '-b:v', '5M',
  '-c:a', 'aac', '-b:a', '192k',
  '-r', '30',
  '-y', outputMp4
];

const ff = spawn('ffmpeg', args);
let stderrBuf = '';
ff.stderr.setEncoding('utf8');
ff.stderr.on('data', d => {
  stderrBuf += d;
  const m = d.match(/time=(\d+:\d+:\d+)/);
  if (m) process.stdout.write(`\r⏳ 編碼進度：${m[1]}   `);
});

ff.on('close', code => {
  if (code !== 0) {
    console.error('\n❌ ffmpeg 失敗：', stderrBuf.slice(-600));
    process.exit(1);
  }
  const sizeMB  = Math.round(fs.statSync(outputMp4).size / 1024 / 1024 * 10) / 10;
  const totalSec = keepSegs.reduce((acc, s) => acc + (s.end - s.start), 0);
  console.log('\n✅ Shorts 豎屏版本輸出完成！');
  console.log('─────────────────────────');
  console.log(`🎬 格式　　：1080×1920（9:16）30fps 滿版`);
  console.log(`📐 裁切方式：中心裁切（最大化畫面利用率）`);
  console.log(`🔤 字幕　　：大字彩色（白/黃輪流），已對應新時間軸`);
  console.log(`⏱  剪輯時長：${Math.round(totalSec)} 秒`);
  console.log(`💾 檔案大小：${sizeMB} MB`);
  console.log(`📁 輸出路徑：${outputMp4}`);
  console.log('─────────────────────────');
});
