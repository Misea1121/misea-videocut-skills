const path = require('path');
const fs = require('fs');

const inputFile = process.argv[2];

if (!inputFile) {
  console.log('用法：node auto_caption_gen.js <source.mp4 或資料夾內任一檔案路徑>');
  console.log('範例：node auto_caption_gen.js "D:\\Vid\\source.mp4"');
  process.exit(1);
}

const inputDir = path.dirname(path.resolve(inputFile));

function readJson(f) {
  const p = path.join(inputDir, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

const transcript    = readJson('transcript.json');
const confirmedCuts = readJson('confirmed_cuts.json');

if (!transcript) {
  console.error('❌ 找不到 transcript.json，請先執行 Skill 2 的 transcribe_tw.js');
  process.exit(1);
}

console.log('📝 正在生成字幕檔...');

// 決定要保留哪些片段
// - 有 confirmed_cuts.json：只保留 action=keep 的片段
// - 沒有：保留所有段落
let segments;
if (confirmedCuts) {
  const keepIds = new Set(
    (confirmedCuts.segments || [])
      .filter((s) => s.action === 'keep')
      .map((s) => s.id)
  );
  segments = transcript.segments.filter((s) => keepIds.has(s.id));
  console.log(`📋 使用 confirmed_cuts.json，保留 ${segments.length} 段（共 ${transcript.segments.length} 段）`);
} else {
  segments = transcript.segments;
  console.log(`📋 未找到 confirmed_cuts.json，輸出全部 ${segments.length} 段字幕`);
}

// 秒數轉 SRT 時間格式 (HH:MM:SS,mmm)
function toSrtTime(sec) {
  const ms = Math.round((sec % 1) * 1000);
  const s = Math.floor(sec) % 60;
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return [
    h.toString().padStart(2, '0'),
    m.toString().padStart(2, '0'),
    s.toString().padStart(2, '0')
  ].join(':') + ',' + ms.toString().padStart(3, '0');
}

// 生成 SRT 內容
const srtLines = segments
  .filter((s) => s.text && s.text.trim())
  .map((s, i) => {
    const startTime = toSrtTime(s.start);
    const endTime   = toSrtTime(s.end);
    // 每行最多 20 個中文字，超過換行
    const text = s.text.trim();
    const lines = [];
    for (let i = 0; i < text.length; i += 20) lines.push(text.slice(i, i + 20));
    return `${i + 1}\n${startTime} --> ${endTime}\n${lines.join('\n')}`;
  })
  .join('\n\n');

const outputSrt = path.join(inputDir, 'subtitle.srt');
fs.writeFileSync(outputSrt, srtLines + '\n', 'utf8');

// 也輸出 TXT 版純文字（方便複製貼上）
const plainText = segments
  .filter((s) => s.text && s.text.trim())
  .map((s) => s.text.trim())
  .join('　');
fs.writeFileSync(path.join(inputDir, 'transcript.txt'), plainText, 'utf8');

console.log('✅ 字幕生成完成！');
console.log('─────────────────────────');
console.log(`📝 字幕段落　：${segments.filter((s) => s.text?.trim()).length} 條`);
console.log(`💾 SRT 路徑　：${outputSrt}`);
console.log(`💾 純文字　　：${path.join(inputDir, 'transcript.txt')}`);
console.log('─────────────────────────');
console.log('\n📋 前 3 條字幕預覽：');
segments.slice(0, 3).forEach((s, i) => {
  console.log(`  ${i + 1}. [${toSrtTime(s.start)} → ${toSrtTime(s.end)}] ${(s.text || '').trim()}`);
});
