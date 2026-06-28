/**
 * export_cut.js
 * 讀取片段清單 JSON，把多個不連續的片段拼成一支影片
 * 保持原始 16:9 比例，不加字幕（字幕下一步處理）
 *
 * 用法：node export_cut.js <source.mp4> <clips.json>
 * 範例：node export_cut.js "D:\Vid\source.mp4" "D:\Vid\ep1_cuts.json"
 */

const { spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');

const [,, inputFile, cutsFile] = process.argv;

if (!inputFile || !cutsFile) {
  console.log('用法：node export_cut.js <source.mp4> <clips.json>');
  console.log('範例：node export_cut.js "D:\\code.2.0\\Vid\\source.mp4" "D:\\code.2.0\\Vid\\ep1_cuts.json"');
  process.exit(1);
}
if (!fs.existsSync(inputFile)) { console.error(`❌ 找不到影片：${inputFile}`); process.exit(1); }
if (!fs.existsSync(cutsFile))  { console.error(`❌ 找不到清單：${cutsFile}`);  process.exit(1); }

const config  = JSON.parse(fs.readFileSync(cutsFile, 'utf8'));
const clips   = config.clips;
const title   = config.title || 'output';
const outDir  = path.dirname(path.resolve(inputFile));
const outputMp4 = path.join(outDir, `${title}.mp4`);

const totalSec = clips.reduce((a, c) => a + (c.end - c.start), 0);

console.log(`🎬 片段剪接：${title}`);
console.log(`✂️  共 ${clips.length} 個片段，合計 ${Math.round(totalSec)} 秒`);
clips.forEach((c, i) => {
  console.log(`   ${String(i+1).padStart(2,'0')}. [${c.start}s→${c.end}s] ${c.note || ''}`);
});
console.log('⏳ 開始輸出...\n');

// ── 建立 filter_complex ──
const filterParts = [];
const vParts = [], aParts = [];

clips.forEach((clip, i) => {
  filterParts.push(
    `[0:v]trim=start=${clip.start}:end=${clip.end},setpts=PTS-STARTPTS[v${i}]`,
    `[0:a]atrim=start=${clip.start}:end=${clip.end},asetpts=PTS-STARTPTS[a${i}]`
  );
  vParts.push(`[v${i}]`);
  aParts.push(`[a${i}]`);
});

const concatIn = clips.map((_, i) => `[v${i}][a${i}]`).join('');
filterParts.push(`${concatIn}concat=n=${clips.length}:v=1:a=1[vout][aout]`);

const args = [
  '-i', inputFile,
  '-filter_complex', filterParts.join(';'),
  '-map', '[vout]',
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
  if (m) process.stdout.write(`\r⏳ 進度：${m[1]}   `);
});

ff.on('close', code => {
  if (code !== 0) {
    console.error('\n❌ ffmpeg 失敗：', stderrBuf.slice(-600));
    process.exit(1);
  }
  const sizeMB = Math.round(fs.statSync(outputMp4).size / 1024 / 1024 * 10) / 10;
  console.log(`\n✅ 完成！`);
  console.log('─────────────────────────');
  console.log(`📋 片段數：${clips.length}`);
  console.log(`⏱  總長度：${Math.round(totalSec)} 秒`);
  console.log(`💾 大小　：${sizeMB} MB`);
  console.log(`📁 路徑　：${outputMp4}`);
  console.log('─────────────────────────');
  console.log('👉 想調整片段：修改 ep1_cuts.json 再重跑');
});
