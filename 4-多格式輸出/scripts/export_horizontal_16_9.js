const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const inputFile = process.argv[2];

if (!inputFile) {
  console.log('用法：node export_horizontal_16_9.js <source.mp4路徑>');
  process.exit(1);
}
if (!fs.existsSync(inputFile)) { console.error(`❌ 找不到影片：${inputFile}`); process.exit(1); }

const inputDir  = path.dirname(path.resolve(inputFile));
const outputMp4 = path.join(inputDir, 'output_full.mp4');

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

// ── 字幕時間重新對應（剪輯後時間軸） ──
function remapToSRT(keepSegs, transcriptSegs) {
  if (!transcriptSegs) return null;

  function toSrtTime(sec) {
    const ms = Math.round((sec % 1) * 1000);
    const s  = Math.floor(sec) % 60;
    const m  = Math.floor(sec / 60) % 60;
    const h  = Math.floor(sec / 3600);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')},${ms.toString().padStart(3,'0')}`;
  }

  const remapped = [];
  let cumTime = 0;

  for (const clip of keepSegs) {
    const clipDur = clip.end - clip.start;
    for (const ts of transcriptSegs) {
      if (ts.start >= clip.end || ts.end <= clip.start) continue;
      const newStart = cumTime + Math.max(0, ts.start - clip.start);
      const newEnd   = cumTime + Math.min(clipDur, ts.end - clip.start);
      if (newEnd > newStart && ts.text?.trim()) {
        remapped.push({ start: newStart, end: newEnd, text: ts.text.trim() });
      }
    }
    cumTime += clipDur;
  }

  if (remapped.length === 0) return null;

  return remapped.map((s, i) =>
    `${i + 1}\n${toSrtTime(s.start)} --> ${toSrtTime(s.end)}\n${s.text}`
  ).join('\n\n') + '\n';
}

const srtContent = remapToSRT(keepSegs, transcript?.segments);
let tempSrtPath = null;

if (srtContent) {
  tempSrtPath = path.join(os.tmpdir(), '_full_subtitle.srt');
  fs.writeFileSync(tempSrtPath, srtContent, 'utf8');
  console.log(`📝 字幕：${srtContent.split('\n\n').length} 條（已重新對應剪輯後時間軸）`);
} else {
  console.log('📝 字幕：無');
}

console.log(`🎬 開始輸出橫屏版本（16:9）`);
console.log(`✂️  剪輯片段數：${keepSegs.length}`);
console.log('⏳ 請稍候...\n');

const filterParts = [];

keepSegs.forEach((seg, i) => {
  filterParts.push(
    `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[v${i}]`,
    `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}]`
  );
});

const concatStr = keepSegs.map((_,i) => `[v${i}][a${i}]`).join('');
filterParts.push(`${concatStr}concat=n=${keepSegs.length}:v=1:a=1[vout][aout]`);

let filterComplex = filterParts.join(';');
let finalVideo = '[vout]';

if (tempSrtPath) {
  const srtEsc = tempSrtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  filterComplex += `;[vout]subtitles='${srtEsc}':force_style='FontName=Arial,FontSize=26,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=3,Shadow=1,Alignment=2'[vfinal]`;
  finalVideo = '[vfinal]';
}

const args = [
  '-i', inputFile,
  '-filter_complex', filterComplex,
  '-map', finalVideo,
  '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'fast',
  '-b:v', '8M',
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
  if (code !== 0) { console.error('\n❌ ffmpeg 失敗：', stderrBuf.slice(-500)); process.exit(1); }
  const sizeMB  = Math.round(fs.statSync(outputMp4).size / 1024 / 1024 * 10) / 10;
  const totalSec = keepSegs.reduce((acc,s) => acc + (s.end - s.start), 0);
  console.log('\n✅ 橫屏版本輸出完成！');
  console.log('─────────────────────────');
  console.log(`🎬 格式　　：1920×1080（16:9）30fps`);
  console.log(`🔤 字幕　　：已重新對應剪輯時間軸`);
  console.log(`⏱  剪輯時長：${Math.round(totalSec)} 秒（${Math.round(totalSec/60*10)/10} 分鐘）`);
  console.log(`💾 檔案大小：${sizeMB} MB`);
  console.log(`📁 輸出路徑：${outputMp4}`);
  console.log('─────────────────────────');
});
