/**
 * feedback_loop.js
 * 記錄每次輸出影片的成效反饋，累積後自動調整剪輯規則
 *
 * 用法：
 *   node feedback_loop.js add <影片名稱> <分數1-10> [觀看數] [備註]
 *   node feedback_loop.js list
 *   node feedback_loop.js summary
 */

const path = require('path');
const fs = require('fs');

const cmd = process.argv[2];
const skillDir = path.join(__dirname, '..');
const historyPath = path.join(skillDir, 'feedback_history.json');
const rulesPath   = path.join(skillDir, 'my_style_rules.json');

function loadHistory() {
  return fs.existsSync(historyPath)
    ? JSON.parse(fs.readFileSync(historyPath, 'utf8'))
    : { records: [] };
}

function saveHistory(h) {
  fs.writeFileSync(historyPath, JSON.stringify(h, null, 2), 'utf8');
}

// ── add 指令：記錄一筆反饋 ──
if (cmd === 'add') {
  const videoName = process.argv[3];
  const score     = parseFloat(process.argv[4]);
  const views     = process.argv[5] ? parseInt(process.argv[5]) : null;
  const note      = process.argv[6] || '';

  if (!videoName || isNaN(score) || score < 1 || score > 10) {
    console.error('用法：node feedback_loop.js add <影片名稱> <分數1-10> [觀看數] [備註]');
    console.error('範例：node feedback_loop.js add "output_shorts.mp4" 8 1200 "觀眾反應很好"');
    process.exit(1);
  }

  const history = loadHistory();
  const record = {
    id: history.records.length,
    date: new Date().toISOString().split('T')[0],
    video: videoName,
    score,
    views,
    note,
    added_at: new Date().toISOString()
  };

  history.records.push(record);
  saveHistory(history);

  console.log('✅ 反饋已記錄！');
  console.log(`  📹 影片：${videoName}`);
  console.log(`  ⭐ 分數：${score}/10`);
  if (views) console.log(`  👁  觀看：${views.toLocaleString()}`);
  if (note)  console.log(`  📝 備註：${note}`);
  console.log(`  📊 累計紀錄：${history.records.length} 筆`);

  // 有 5 筆以上時，自動生成洞察
  if (history.records.length >= 5) {
    console.log('\n💡 已累積足夠資料，執行 summary 查看趨勢');
  }

// ── list 指令：列出所有紀錄 ──
} else if (cmd === 'list') {
  const history = loadHistory();
  if (history.records.length === 0) {
    console.log('⚠️  還沒有任何反饋紀錄。用 add 新增第一筆！');
    process.exit(0);
  }
  console.log(`📋 反饋紀錄（共 ${history.records.length} 筆）\n`);
  history.records.forEach((r) => {
    const stars = '⭐'.repeat(Math.round(r.score / 2));
    const views = r.views ? `👁 ${r.views.toLocaleString()}` : '';
    console.log(`  ${r.id.toString().padStart(3, ' ')}. [${r.date}] ${r.video}`);
    console.log(`       ${stars} ${r.score}/10 ${views}${r.note ? ' — ' + r.note : ''}`);
  });

// ── summary 指令：分析趨勢並更新規則 ──
} else if (cmd === 'summary') {
  const history = loadHistory();
  if (history.records.length === 0) {
    console.log('⚠️  還沒有任何反饋紀錄');
    process.exit(0);
  }

  const scores = history.records.map((r) => r.score);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10;
  const maxRecord = history.records.reduce((a, b) => a.score > b.score ? a : b);
  const minRecord = history.records.reduce((a, b) => a.score < b.score ? a : b);
  const withViews = history.records.filter((r) => r.views !== null);
  const avgViews  = withViews.length > 0
    ? Math.round(withViews.reduce((a, r) => a + r.views, 0) / withViews.length)
    : null;

  // 趨勢：最近 3 筆 vs 最早 3 筆
  const recent = history.records.slice(-3);
  const early  = history.records.slice(0, 3);
  const recentAvg = Math.round(recent.reduce((a, r) => a + r.score, 0) / recent.length * 10) / 10;
  const earlyAvg  = Math.round(early.reduce((a, r) => a + r.score, 0) / early.length * 10) / 10;
  const trend = recentAvg > earlyAvg ? '📈 上升' : recentAvg < earlyAvg ? '📉 下降' : '➡️  持平';

  console.log('📊 反饋摘要');
  console.log('─────────────────────────');
  console.log(`⭐ 平均分數　：${avgScore}/10`);
  console.log(`🏆 最高分　　：${maxRecord.score}/10（${maxRecord.video}）`);
  console.log(`⬇️  最低分　　：${minRecord.score}/10（${minRecord.video}）`);
  if (avgViews) console.log(`👁  平均觀看　：${avgViews.toLocaleString()}`);
  console.log(`📈 進步趨勢　：${trend}（早期 ${earlyAvg} → 近期 ${recentAvg}）`);
  console.log('─────────────────────────');

  // 根據平均分更新建議
  const insights = [];
  if (avgScore < 5) {
    insights.push('整體表現偏低，建議回頭檢查 highlight_detector.js 的關鍵詞清單是否符合你的內容風格');
    insights.push('嘗試在 Skill 3 審核時，更嚴格篩選片段，只保留最精彩的 30% 內容');
  } else if (avgScore < 7) {
    insights.push('表現中等，可以嘗試縮短每個片段的長度，讓節奏更緊湊');
    insights.push('考慮把最高分影片的片段結構（開頭/高潮/結尾比例）複製到下一支影片');
  } else {
    insights.push('表現良好！繼續這個風格');
    insights.push(`最佳影片「${maxRecord.video}」的剪輯邏輯值得分析並重複`);
  }

  if (recentAvg > earlyAvg + 1) {
    insights.push('近期明顯進步，說明你對剪輯規則的掌握越來越好');
  }

  console.log('\n💡 洞察：');
  insights.forEach((i) => console.log(`  → ${i}`));

  // 更新 my_style_rules.json 的 feedback_insights
  if (fs.existsSync(rulesPath)) {
    const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    rules.feedback_insights = {
      updated_at: new Date().toISOString(),
      avg_score: avgScore,
      trend,
      total_feedbacks: history.records.length,
      insights
    };
    fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2), 'utf8');
    console.log(`\n✅ 洞察已寫入 my_style_rules.json`);
  }

} else {
  console.log('🔄 feedback_loop.js — 反饋收集與規則進化');
  console.log('');
  console.log('指令：');
  console.log('  add <影片名> <分數1-10> [觀看數] [備註]   記錄一次成效反饋');
  console.log('  list                                       列出所有反饋記錄');
  console.log('  summary                                    分析趨勢並更新規則');
  console.log('');
  console.log('範例：');
  console.log('  node feedback_loop.js add "output_shorts.mp4" 8 1500 "觀眾喜歡哈哈哈片段"');
  console.log('  node feedback_loop.js list');
  console.log('  node feedback_loop.js summary');
}
