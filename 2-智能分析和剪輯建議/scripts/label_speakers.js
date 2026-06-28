/**
 * label_speakers.js
 * 根據停頓間隔自動把對話分配 A/B/C/D... 說話者標籤
 * 不是真正的聲紋辨識，但能讓你看出對話輪次
 *
 * 用法：node label_speakers.js <transcript.json 路徑>
 * 輸出：transcript_labeled.txt（每行有說話者標籤）
 */

const path = require('path');
const fs   = require('fs');

const inputFile = process.argv[2];
if (!inputFile || !fs.existsSync(inputFile)) {
  console.error('用法：node label_speakers.js <transcript.json 路徑>');
  process.exit(1);
}

const data     = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const segments = data.segments || [];
const outputDir = path.dirname(inputFile);

// ── 說話者分配邏輯 ──
// 停頓 > GAP_SEC 秒 = 可能換人說話
const GAP_SEC = 0.8;
const LABELS  = 'ABCDEFGH'.split('');

let speakerIdx  = 0;
let lastEnd     = -10;
let lastIsDash  = null;

const labeled = segments.map(seg => {
  const text    = seg.text || '';
  const isDash  = text.startsWith('- ');
  const gap     = seg.start - lastEnd;
  const cleanText = isDash ? text.slice(2) : text;

  // 換說話者的條件：停頓夠長，或從 dash/非 dash 換另一種
  const switchSpeaker =
    gap > GAP_SEC ||
    (lastIsDash !== null && isDash !== lastIsDash);

  if (switchSpeaker) {
    speakerIdx = (speakerIdx + 1) % LABELS.length;
  }

  lastEnd    = seg.end;
  lastIsDash = isDash;

  return {
    ...seg,
    speaker: LABELS[speakerIdx],
    cleanText
  };
});

// ── 輸出（保持原始一行一段的格式，只在前面加說話者標籤） ──
function toHMS(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

const lines = labeled.map(seg => {
  const startT = toHMS(seg.start);
  const endT   = toHMS(seg.end);
  const dur    = (seg.end - seg.start).toFixed(1);
  return `[${seg.speaker}][${startT} → ${endT}] (${dur}s)  ${seg.cleanText}`;
});

const outPath = path.join(outputDir, 'transcript_labeled.txt');
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

// 統計每個說話者
const speakerStats = {};
for (const s of labeled) {
  if (!speakerStats[s.speaker]) speakerStats[s.speaker] = { count: 0, chars: 0 };
  speakerStats[s.speaker].count++;
  speakerStats[s.speaker].chars += s.cleanText.length;
}

console.log('✅ 說話者標籤完成！');
console.log('─────────────────────────');
Object.entries(speakerStats).sort().forEach(([sp, st]) => {
  console.log(`  說話者 ${sp}：${st.count} 段，共 ${st.chars} 字`);
});
console.log(`📁 輸出：${outPath}`);
console.log('─────────────────────────');
console.log('⚠️  這是用停頓時間猜測的，不保證 100% 準確');
console.log('   看完後你可以告訴 Claude 誰是誰，以後就能記住');
