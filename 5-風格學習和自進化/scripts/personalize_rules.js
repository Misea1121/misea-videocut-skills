/**
 * personalize_rules.js
 * 比較「火紅影片指標」和「你的影片風格」，產生個性化剪輯規則
 * 輸入：viral_analysis.json + style_report.json（Skill 2 產出）
 * 輸出：my_style_rules.json
 */

const path = require('path');
const fs = require('fs');

const inputFile = process.argv[2];

if (!inputFile) {
  console.log('用法：node personalize_rules.js <style_report.json 或資料夾路徑>');
  console.log('範例：node personalize_rules.js "D:\\Vid\\style_report.json"');
  process.exit(1);
}

const userDataDir = fs.statSync(inputFile).isDirectory()
  ? inputFile
  : path.dirname(inputFile);

const skillDir = path.join(__dirname, '..');

function readJson(dir, f) {
  const p = path.join(dir, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

const viralData  = readJson(skillDir, 'viral_analysis.json');
const styleReport = readJson(userDataDir, 'style_report.json');

if (!styleReport) {
  console.error('❌ 找不到 style_report.json，請先執行 Skill 2 的 style_analyzer.js');
  process.exit(1);
}

if (!viralData || !viralData.aggregated) {
  console.warn('⚠️  找不到 viral_analysis.json 或資料不完整，將只根據通用標準生成規則');
}

console.log('🧠 正在生成個性化剪輯規則...\n');

const viral = viralData?.aggregated || {
  avg_duration_sec: 45,
  avg_cuts_per_minute: 20,
  avg_clip_length_sec: 3,
  dominant_pacing: 'fast'
};

const user = styleReport.metrics || {};

// ── 比較各項指標，生成具體規則 ──

const rules = [];
const comparisons = [];

// 1. 片段長度
const userAvgSeg = user.avg_segment_length_sec;
const viralAvgClip = viral.avg_clip_length_sec;
if (userAvgSeg && viralAvgClip) {
  const diff = userAvgSeg - viralAvgClip;
  comparisons.push({ metric: '平均片段長度', user: `${userAvgSeg}s`, viral: `${viralAvgClip}s` });
  if (diff > 2) {
    rules.push({
      category: '節奏',
      priority: 'high',
      rule: `縮短每個片段長度：目前 ${userAvgSeg}s，目標靠近 ${viralAvgClip}s`,
      action: `在 silence_detector.js 中把靜音門檻從 1s 降到 0.5s，更積極地刪除停頓`,
      impact: '加快節奏，讓觀眾保持注意力'
    });
  } else if (diff < -1) {
    rules.push({
      category: '節奏',
      priority: 'medium',
      rule: `片段稍長可以接受，目前 ${userAvgSeg}s vs 火紅影片 ${viralAvgClip}s`,
      action: '保持現有節奏，適合需要理解複雜內容的影片',
      impact: '觀眾理解度更高，適合教學或故事型內容'
    });
  } else {
    rules.push({
      category: '節奏',
      priority: 'low',
      rule: `片段長度表現良好（${userAvgSeg}s，接近火紅影片的 ${viralAvgClip}s）`,
      action: '維持現有剪輯節奏',
      impact: '節奏已達火紅標準'
    });
  }
}

// 2. 靜音占比
const userSilenceRatio = user.silence_ratio_pct;
if (userSilenceRatio) {
  comparisons.push({ metric: '靜音占比', user: `${userSilenceRatio}%`, viral: '<10%（估計）' });
  if (userSilenceRatio > 20) {
    rules.push({
      category: '靜音處理',
      priority: 'high',
      rule: `靜音過多（${userSilenceRatio}%），嚴重拖慢節奏`,
      action: '在 Skill 3 審核時，把所有 action=delete 的靜音片段全部確認刪除',
      impact: `可縮短影片約 ${Math.round(userSilenceRatio - 8)}%，節奏大幅提升`
    });
  } else if (userSilenceRatio > 10) {
    rules.push({
      category: '靜音處理',
      priority: 'medium',
      rule: `靜音占比 ${userSilenceRatio}%，稍高`,
      action: '刪除 >0.8s 的靜音，保留短停頓讓內容更自然',
      impact: '節奏提升同時保持自然感'
    });
  }
}

// 3. 精彩密度
const userHighlightPerMin = user.highlight_per_minute;
const viralCutsPerMin = viral.avg_cuts_per_minute;
if (userHighlightPerMin) {
  comparisons.push({ metric: '精彩片段密度', user: `${userHighlightPerMin}/分鐘`, viral: `${viralCutsPerMin}/分鐘` });
  if (userHighlightPerMin < viralCutsPerMin * 0.3) {
    rules.push({
      category: '內容密度',
      priority: 'high',
      rule: `精彩密度偏低（${userHighlightPerMin}/min vs 火紅影片 ${viralCutsPerMin}/min）`,
      action: '在 highlight_detector.js 的關鍵詞清單中加入更多符合你頻道風格的詞彙，提高捕捉率',
      impact: '找出更多高潮時刻，讓成片更精彩'
    });
  }
}

// 4. 字幕風格建議（基於火紅影片常見做法）
rules.push({
  category: '字幕',
  priority: 'medium',
  rule: '字幕風格：大字、粗體、帶描邊（火紅短影片標準）',
  action: 'export scripts 的 subtitles force_style 已設定粗體+描邊，可調整 FontSize（目前 22-28）',
  impact: '提升字幕可讀性，尤其在手機小螢幕觀看時'
});

// 5. 結構建議
rules.push({
  category: '內容結構',
  priority: 'high',
  rule: '開頭 3 秒要抓住注意力（火紅影片黃金定律）',
  action: '在 highlights.json 中找最高分的片段，放到影片最前面（而非按時間順序）',
  impact: '大幅提升留存率，減少觀眾跳離'
});

rules.push({
  category: '輸出長度',
  priority: 'medium',
  rule: `YouTube Shorts 最佳長度：${viral.avg_duration_sec}s 左右`,
  action: `目前輸出的精彩剪輯若超過 60s，考慮只保留評分最高的前幾段`,
  impact: 'Shorts 演算法對 <60s 的影片推播更積極'
});

// ── 彙總輸出 ──

const myRules = {
  generated_at: new Date().toISOString(),
  based_on: {
    viral_videos_analyzed: viralData?.success_count ?? 0,
    user_video_score: styleReport.overall_score ?? null
  },
  comparison: comparisons,
  rules: rules.sort((a, b) => {
    const priority = { high: 0, medium: 1, low: 2 };
    return priority[a.priority] - priority[b.priority];
  }),
  quick_wins: rules.filter((r) => r.priority === 'high').map((r) => r.rule)
};

const outputPath = path.join(skillDir, 'my_style_rules.json');
fs.writeFileSync(outputPath, JSON.stringify(myRules, null, 2), 'utf8');

console.log('✅ 個性化規則生成完成！');
console.log('─────────────────────────');
console.log(`📋 規則總數　：${rules.length} 條`);
console.log(`🔴 高優先　　：${rules.filter((r) => r.priority === 'high').length} 條`);
console.log(`🟡 中優先　　：${rules.filter((r) => r.priority === 'medium').length} 條`);
console.log(`💾 輸出路徑　：${outputPath}`);
console.log('─────────────────────────');
console.log('\n🚀 立刻可做的改善（高優先）：');
myRules.quick_wins.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
