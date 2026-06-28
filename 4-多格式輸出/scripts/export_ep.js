/**
 * export_ep.js
 * 從指定時間段輸出一段影片（支援 9:16 Shorts 或原始 16:9 橫屏）
 *
 * 用法：node export_ep.js <source.mp4> <開始秒> <結束秒> <輸出檔名> [--horizontal]
 * 範例（Shorts）：  node export_ep.js "D:\Vid\source.mp4" 59 178 ep1_報備
 * 範例（橫屏）：    node export_ep.js "D:\Vid\source.mp4" 59 178 ep1_報備 --horizontal
 */

const { spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');

const [,, inputFile, startArg, endArg, epName, modeFlag] = process.argv;
const isHorizontal = modeFlag === '--horizontal';

if (!inputFile || !startArg || !endArg || !epName) {
  console.log('用法：node export_ep.js <source.mp4> <開始秒> <結束秒> <輸出檔名> [--horizontal]');
  console.log('範例：node export_ep.js "D:\\code.2.0\\Vid\\source.mp4" 59 178 ep1_報備 --horizontal');
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`❌ 找不到影片：${inputFile}`); process.exit(1);
}

const startSec = parseFloat(startArg);
const endSec   = parseFloat(endArg);
const inputDir  = path.dirname(path.resolve(inputFile));
const outputMp4 = path.join(inputDir, `${epName}.mp4`);
const assPath   = path.join(inputDir, `_${epName}_sub.ass`);

// ── 讀 transcript.json 取得這段的字幕 ──
const transcriptPath = path.join(inputDir, 'transcript.json');
let subtitleSegs = [];
if (fs.existsSync(transcriptPath)) {
  const tr = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
  const segs = tr.segments || [];
  for (const s of segs) {
    if (s.end <= startSec || s.start >= endSec) continue;
    const newStart = Math.max(0, s.start - startSec);
    const newEnd   = Math.min(endSec - startSec, s.end - startSec);
    if (newEnd > newStart && s.text?.trim()) {
      subtitleSegs.push({ start: newStart, end: newEnd, text: s.text.trim() });
    }
  }
}

// ── 生成 ASS 字幕（Shorts 風格） ──
function toT(sec) {
  const h  = Math.floor(sec / 3600);
  const m  = Math.floor((sec % 3600) / 60);
  const s  = Math.floor(sec % 60);
  const cs = Math.round((sec % 1) * 100);
  return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}.${cs.toString().padStart(2,'0')}`;
}

const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: White,Arial,68,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,5,2,2,60,60,140,1
Style: Yellow,Arial,68,&H0000FFFF,&H0000FFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,5,2,2,60,60,140,1
Style: Red,Arial,72,&H002222FF,&H002222FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,5,2,2,60,60,140,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

const events = [];
let toggle = false;
const LAUGH_ONLY = /^[哈呵嗯啊喔欸嘿唉]+[。！？]*$/;
const MAX_CHARS = 10;

for (const seg of subtitleSegs) {
  const dur = seg.end - seg.start;
  if (dur <= 0) continue;
  if (LAUGH_ONLY.test(seg.text) && seg.text.length <= 4) continue; // 略過純笑聲短句

  const chunks = [];
  for (let i = 0; i < seg.text.length; i += MAX_CHARS) {
    chunks.push(seg.text.slice(i, i + MAX_CHARS));
  }
  const chunkDur = dur / chunks.length;
  for (let i = 0; i < chunks.length; i++) {
    const t0 = seg.start + i * chunkDur;
    const t1 = seg.start + (i + 1) * chunkDur;
    events.push(`Dialogue: 0,${toT(t0)},${toT(t1)},${toggle ? 'Yellow' : 'White'},,0,0,0,,${chunks[i]}`);
  }
  toggle = !toggle;
}

const assContent = assHeader + '\n' + events.join('\n') + '\n';
fs.writeFileSync(assPath, assContent, 'utf8');

// ── ffmpeg：trim → (裁切或保持原比例) → 燒字幕 ──
const dur = endSec - startSec;
const assEsc = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');

let filterComplex;
if (isHorizontal) {
  // 16:9 橫屏：不裁切，保持原始畫面
  filterComplex = `[0:v]trim=start=${startSec}:end=${endSec},setpts=PTS-STARTPTS`;
  if (events.length > 0) {
    filterComplex += `,subtitles='${assEsc}':force_style='FontName=Arial,FontSize=26,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=3,Shadow=1,Alignment=2'`;
  }
  filterComplex += `[vout]`;
} else {
  // 9:16 Shorts：中心裁切 + 大字 ASS 字幕
  filterComplex = `[0:v]trim=start=${startSec}:end=${endSec},setpts=PTS-STARTPTS,` +
    `crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920`;
  if (events.length > 0) {
    filterComplex += `,subtitles='${assEsc}'`;
  }
  filterComplex += `[vout]`;
}

filterComplex += `;[0:a]atrim=start=${startSec}:end=${endSec},asetpts=PTS-STARTPTS[aout]`;

const args = [
  '-i', inputFile,
  '-filter_complex', filterComplex,
  '-map', '[vout]',
  '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'fast',
  '-b:v', isHorizontal ? '8M' : '6M',
  '-c:a', 'aac', '-b:a', '192k',
  '-r', '30',
  '-y', outputMp4
];

console.log(`🎬 輸出 ${epName}`);
console.log(`✂️  時間段：${startSec}s → ${endSec}s（共 ${Math.round(dur)} 秒）`);
console.log(`📝 字幕段數：${events.length}`);
console.log('⏳ 請稍候...\n');

const ff = spawn('ffmpeg', args);
let stderrBuf = '';
ff.stderr.setEncoding('utf8');
ff.stderr.on('data', d => {
  stderrBuf += d;
  const m = d.match(/time=(\d+:\d+:\d+)/);
  if (m) process.stdout.write(`\r⏳ 進度：${m[1]}   `);
});
ff.on('close', code => {
  if (code !== 0) {
    console.error('\n❌ ffmpeg 失敗：', stderrBuf.slice(-600));
    process.exit(1);
  }
  const sizeMB = Math.round(fs.statSync(outputMp4).size / 1024 / 1024 * 10) / 10;
  console.log(`\n✅ 完成！`);
  console.log(`📁 ${outputMp4}（${sizeMB} MB）`);
});
