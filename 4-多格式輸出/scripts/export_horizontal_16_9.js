const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const inputFile = process.argv[2];

if (!inputFile) {
  console.log('用法：node export_horizontal_16_9.js <source.mp4路徑>');
  console.log('範例：node export_horizontal_16_9.js "D:\\Vid\\source.mp4"');
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`❌ 找不到影片：${inputFile}`);
  process.exit(1);
}

const inputDir = path.dirname(path.resolve(inputFile));

function readJson(f) {
  const p = path.join(inputDir, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

const confirmedCuts = readJson('confirmed_cuts.json');
const highlights    = readJson('highlights.json');

// 決定要剪哪些片段
let keepSegs;
if (confirmedCuts) {
  keepSegs = (confirmedCuts.segments || [])
    .filter((s) => s.action === 'keep')
    .sort((a, b) => a.start - b.start);
  console.log(`📋 使用 confirmed_cuts.json（${keepSegs.length} 個保留片段）`);
} else if (highlights) {
  keepSegs = (highlights.highlights || [])
    .sort((a, b) => a.start - b.start);
  console.log(`📋 使用 highlights.json（${keepSegs.length} 個精彩片段）`);
} else {
  console.error('❌ 找不到 confirmed_cuts.json 或 highlights.json，請先執行 Skill 2');
  process.exit(1);
}

if (keepSegs.length === 0) {
  console.error('❌ 沒有可輸出的片段');
  process.exit(1);
}

const srtPath   = path.join(inputDir, 'subtitle.srt');
const hasSrt    = fs.existsSync(srtPath);
const outputMp4 = path.join(inputDir, 'output_full.mp4');

console.log(`🎬 開始輸出橫屏版本（16:9）`);
console.log(`✂️  剪輯片段數：${keepSegs.length}`);
console.log(`📝 字幕：${hasSrt ? '有（subtitle.srt）' : '無'}`);
console.log('⏳ 請稍候，這可能需要幾分鐘...\n');

// 建立 filter_complex：每段做 trim + setpts，最後 concat
const vParts = [];
const aParts = [];
let filterParts = [];

keepSegs.forEach((seg, i) => {
  filterParts.push(
    `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[v${i}]`,
    `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}]`
  );
  vParts.push(`[v${i}]`);
  aParts.push(`[a${i}]`);
});

const concatInputs = keepSegs.map((_, i) => `[v${i}][a${i}]`).join('');
filterParts.push(`${concatInputs}concat=n=${keepSegs.length}:v=1:a=1[vout][aout]`);

const filterComplex = filterParts.join(';');

// 字幕濾鏡（燒錄進影片）
const subtitleFilter = hasSrt
  ? `[vout]subtitles='${srtPath.replace(/\\/g, '/').replace(/:/g, '\\:')}':force_style='FontName=Arial,FontSize=22,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=2'[vfinal]`
  : null;

const finalFilter = subtitleFilter
  ? `${filterComplex};${subtitleFilter}`
  : filterComplex;

const finalVideo = subtitleFilter ? '[vfinal]' : '[vout]';

const args = [
  '-i', inputFile,
  '-filter_complex', finalFilter,
  '-map', finalVideo,
  '-map', '[aout]',
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-b:v', '8M',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-r', '30',
  '-y',
  outputMp4
];

const ff = spawn('ffmpeg', args);
let stderrBuf = '';

ff.stderr.setEncoding('utf8');
ff.stderr.on('data', (d) => {
  stderrBuf += d;
  // 顯示 ffmpeg 的時間進度
  const m = d.match(/time=(\d+:\d+:\d+)/);
  if (m) process.stdout.write(`\r⏳ 編碼進度：${m[1]}   `);
});

ff.on('close', (code) => {
  if (code !== 0) {
    console.error('\n❌ ffmpeg 失敗：', stderrBuf.slice(-500));
    process.exit(1);
  }
  const sizeMB = Math.round(fs.statSync(outputMp4).size / 1024 / 1024 * 10) / 10;
  const totalSec = keepSegs.reduce((acc, s) => acc + (s.end - s.start), 0);
  console.log('\n✅ 橫屏版本輸出完成！');
  console.log('─────────────────────────');
  console.log(`🎬 格式　　：1920×1080（16:9）30fps`);
  console.log(`⏱  剪輯時長：${Math.round(totalSec)} 秒（${Math.round(totalSec / 60 * 10) / 10} 分鐘）`);
  console.log(`💾 檔案大小：${sizeMB} MB`);
  console.log(`📁 輸出路徑：${outputMp4}`);
  console.log('─────────────────────────');
});
