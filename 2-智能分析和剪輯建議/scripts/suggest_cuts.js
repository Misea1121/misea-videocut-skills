/**
 * suggest_cuts.js
 * 1. 輸出完整逐字稿 transcript_readable.txt（給你自己看）
 * 2. 根據內容評分，推薦值得留的段落 → suggested_cuts.txt + suggested_cuts.json
 *
 * 用法：node suggest_cuts.js <transcript.json 路徑>
 * 範例：node suggest_cuts.js "D:\code.2.0\Vid\transcript.json"
 */

const path = require('path');
const fs   = require('fs');

const inputFile = process.argv[2];
if (!inputFile) {
  console.log('用法：node suggest_cuts.js <transcript.json 路徑>');
  console.log('範例：node suggest_cuts.js "D:\\code.2.0\\Vid\\transcript.json"');
  process.exit(1);
}
if (!fs.existsSync(inputFile)) {
  console.error(`❌ 找不到檔案：${inputFile}`);
  process.exit(1);
}

const outputDir  = path.dirname(inputFile);
const transcript = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const segments   = transcript.segments || [];

if (segments.length === 0) {
  console.error('❌ transcript.json 裡沒有任何片段');
  process.exit(1);
}

// ── 時間格式轉換 ──
function toHMS(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ── 1. 輸出完整逐字稿 ──
const lines = segments.map(seg => {
  const duration = (seg.end - seg.start).toFixed(1);
  return `[${toHMS(seg.start)} → ${toHMS(seg.end)}] (${duration}s)  ${seg.text}`;
});
const readablePath = path.join(outputDir, 'transcript_readable.txt');
fs.writeFileSync(readablePath, lines.join('\n'), 'utf8');
console.log(`📄 完整逐字稿已輸出：${readablePath}`);
console.log(`   共 ${segments.length} 段\n`);

// ── 2. 評分系統 ──
// 分數越高 = 越值得保留

// 觸發加分的關鍵詞（台灣直播常見的有趣/反應詞）
const HIGH_SCORE_WORDS = [
  // 笑點/反應
  '哈哈','哈','笑死','笑','幹','靠','欸','哇','天啊','我的天',
  // 強調
  '超','真的','對啊','是喔','不是吧','什麼','怎麼','居然','竟然',
  // 說故事/高潮
  '然後','結果','所以','後來','重點是','告訴你','你知道嗎','我跟你說',
  // 互動感
  '大家','觀眾','留言','你看','對不對','有沒有',
  // 驚訝/趣味
  '厲害','猛','扯','誇張','傻眼','離譜','太好笑','好玩','有趣'
];

const LOW_VALUE_WORDS = ['嗯','啊','喔','對','好','嘿','唉','ㄟ'];

function scoreSegment(seg) {
  const text = seg.text || '';
  const dur  = seg.end - seg.start;
  let score  = 0;

  // 太短（< 1.5s）且文字很少 → 可能是語氣詞，扣分
  if (dur < 1.5 && text.length <= 3) {
    score -= 3;
  }

  // 長度基礎分（3-10 秒是最好的片段長度）
  if (dur >= 3 && dur <= 10) score += 2;
  else if (dur > 10) score += 1;

  // 文字量基礎分（字數多 = 說了實質內容）
  if (text.length >= 10) score += 2;
  else if (text.length >= 5) score += 1;

  // 關鍵詞加分
  for (const kw of HIGH_SCORE_WORDS) {
    if (text.includes(kw)) score += 2;
  }

  // 只有語氣詞扣分
  const isOnlyFiller = LOW_VALUE_WORDS.some(w => text.trim() === w || text.trim() === w + '。');
  if (isOnlyFiller) score -= 5;

  // 包含問號或感嘆號 → 有情緒/互動感
  if (text.includes('？') || text.includes('!') || text.includes('！')) score += 1;
  if (text.includes('哈哈哈') || text.includes('哈哈哈哈')) score += 2;

  return score;
}

// ── 3. 評分並排序 ──
const scored = segments.map(seg => ({
  ...seg,
  score: scoreSegment(seg),
  duration: seg.end - seg.start
}));

// 分數 >= 3 的才推薦（可調整）
const SCORE_THRESHOLD = 3;
let recommended = scored.filter(s => s.score >= SCORE_THRESHOLD);

// ── 4. 合併相近的片段（間隔 < 2 秒就合併，避免太碎）──
function mergeNearby(segs, gapSec = 2) {
  if (segs.length === 0) return [];
  const sorted = [...segs].sort((a, b) => a.start - b.start);
  const merged = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur  = sorted[i];
    if (cur.start - prev.end <= gapSec) {
      prev.end   = cur.end;
      prev.text  = prev.text + ' ' + cur.text;
      prev.score = Math.max(prev.score, cur.score);
      prev.duration = prev.end - prev.start;
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

const mergedRec = mergeNearby(recommended);

// 計算總秒數
const totalSec = mergedRec.reduce((acc, s) => acc + (s.end - s.start), 0);

// ── 5. 輸出推薦清單文字檔 ──
const recLines = [
  `📋 推薦剪輯清單`,
  `─────────────────────────────────────`,
  `推薦片段：${mergedRec.length} 段`,
  `加起來共：${Math.round(totalSec)} 秒（${(totalSec / 60).toFixed(1)} 分鐘）`,
  `（原始影片共 ${segments.length} 段字幕）`,
  `─────────────────────────────────────`,
  '',
  ...mergedRec.map((seg, i) => {
    const dur = (seg.end - seg.start).toFixed(1);
    return [
      `第 ${i + 1} 段  [${toHMS(seg.start)} → ${toHMS(seg.end)}]  共 ${dur} 秒  ⭐ 分數 ${seg.score}`,
      `  ${seg.text}`,
      ''
    ].join('\n');
  }),
  '',
  `─────────────────────────────────────`,
  `如果覺得某段不對，可以直接刪掉那幾行、再告訴 Claude 用哪幾段輸出影片。`
];

const suggestTextPath = path.join(outputDir, 'suggested_cuts.txt');
fs.writeFileSync(suggestTextPath, recLines.join('\n'), 'utf8');

// ── 6. 輸出 suggested_cuts.json（供 export 腳本直接用）──
const suggestJson = {
  generated_at: new Date().toISOString(),
  total_segments: mergedRec.length,
  total_seconds: Math.round(totalSec),
  highlights: mergedRec.map(s => ({
    start: Math.round(s.start * 100) / 100,
    end:   Math.round(s.end   * 100) / 100,
    text:  s.text,
    score: s.score
  }))
};
const suggestJsonPath = path.join(outputDir, 'suggested_cuts.json');
fs.writeFileSync(suggestJsonPath, JSON.stringify(suggestJson, null, 2), 'utf8');

// ── 7. 印出摘要 ──
console.log('✅ 推薦剪輯分析完成！');
console.log('─────────────────────────');
console.log(`📋 推薦片段　：${mergedRec.length} 段`);
console.log(`⏱  推薦總長度：${Math.round(totalSec)} 秒（${(totalSec / 60).toFixed(1)} 分鐘）`);
console.log(`💾 逐字稿　　：${readablePath}`);
console.log(`💡 推薦清單　：${suggestTextPath}`);
console.log(`📦 JSON 格式　：${suggestJsonPath}`);
console.log('─────────────────────────');
console.log('\n📋 前 5 個推薦片段預覽：');
mergedRec.slice(0, 5).forEach((seg, i) => {
  const dur = (seg.end - seg.start).toFixed(1);
  console.log(`  ${i + 1}. [${toHMS(seg.start)}] ${dur}s ⭐${seg.score}  ${seg.text.slice(0, 30)}...`);
});
console.log(`\n👉 用記事本開啟 transcript_readable.txt 看完整逐字稿`);
console.log(`👉 用記事本開啟 suggested_cuts.txt 看 AI 推薦段落`);
