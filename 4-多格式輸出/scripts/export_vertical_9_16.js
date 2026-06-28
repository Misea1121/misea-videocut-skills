const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const inputFile = process.argv[2];

if (!inputFile) {
  console.log('用法：node export_vertical_9_16.js <source.mp4路徑>');
  console.log('範例：node export_vertical_9_16.js "D:\\Vid\\source.mp4"');
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
  console.error('❌ 找不到 confirmed_cuts.json 或 highlights.json');
  process.exit(1);
}

if (keepSegs.length === 0) {
  console.error('❌ 沒有可輸出的片段');
  process.exit(1);
}

const srtPath   = path.join(inputDir, 'subtitle.srt');
const hasSrt    = fs.existsSync(srtPath);
const outputMp4 = path.join(inputDir, 'output_shorts.mp4');

console.log(`🎬 開始輸出豎屏版本（9:16 Shorts）`);
console.log(`✂️  剪輯片段數：${keepSegs.length}`);
console.log(`📝 字幕：${hasSrt ? '有（subtitle.srt）' : '無'}`);
console.log('⏳ 請稍候，這可能需要幾分鐘...\n');

// 每段：trim → 模糊背景（1080x1920）疊加原始置中畫面
// 背景：原始 16:9 拉伸到 1080x1920 再套 boxblur
// 前景：原始縮放到寬 1080（自然高 607），置中疊加
const filterParts = [];
const vParts = [];
const aParts = [];

keepSegs.forEach((seg, i) => {
  // 剪輯原始段落
  filterParts.push(`[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[raw${i}]`);
  filterParts.push(`[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}]`);

  // split 成背景/前景兩條流（同一個 pad 不能給兩個濾鏡用）
  filterParts.push(`[raw${i}]split[rawbg${i}][rawfg${i}]`);

  // 背景：拉伸到 1080x1920，強模糊
  filterParts.push(`[rawbg${i}]scale=1080:1920:force_original_aspect_ratio=disable,boxblur=20:5[bg${i}]`);

  // 前景：等比縮放到寬 1080（高度 607），疊加到背景正中央
  filterParts.push(`[rawfg${i}]scale=1080:607[fg${i}]`);

  // 疊合
  filterParts.push(`[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2[v${i}]`);

  vParts.push(`[v${i}]`);
  aParts.push(`[a${i}]`);
});

const concatInputs = keepSegs.map((_, i) => `[v${i}][a${i}]`).join('');
filterParts.push(`${concatInputs}concat=n=${keepSegs.length}:v=1:a=1[vout][aout]`);

let filterComplex = filterParts.join(';');
let finalVideo = '[vout]';

// 燒錄字幕（豎屏字幕放在底部 1/6 處）
if (hasSrt) {
  const srtEsc = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  filterComplex += `;[vout]subtitles='${srtEsc}':force_style='FontName=Arial,FontSize=28,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=2,MarginV=160'[vfinal]`;
  finalVideo = '[vfinal]';
}

const args = [
  '-i', inputFile,
  '-filter_complex', filterComplex,
  '-map', finalVideo,
  '-map', '[aout]',
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-b:v', '5M',
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
  console.log('\n✅ Shorts 豎屏版本輸出完成！');
  console.log('─────────────────────────');
  console.log(`🎬 格式　　：1080×1920（9:16）30fps`);
  console.log(`🖼  背景特效：模糊背景＋原始畫面置中`);
  console.log(`⏱  剪輯時長：${Math.round(totalSec)} 秒（${Math.round(totalSec / 60 * 10) / 10} 分鐘）`);
  console.log(`💾 檔案大小：${sizeMB} MB`);
  console.log(`📁 輸出路徑：${outputMp4}`);
  console.log('─────────────────────────');
});
