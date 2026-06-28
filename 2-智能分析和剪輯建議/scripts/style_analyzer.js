const path = require('path');
const fs = require('fs');

const inputFile = process.argv[2];

if (!inputFile) {
  console.log('用法：node style_analyzer.js <source.mp4 或資料夾內任一檔案路徑>');
  console.log('範例：node style_analyzer.js "D:\\Vid\\source.mp4"');
  process.exit(1);
}

const inputDir = path.dirname(inputFile);

// 讀取前面各腳本產生的 JSON
function readJson(filename) {
  const p = path.join(inputDir, filename);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const metadata = readJson('metadata.json');
const transcript = readJson('transcript.json');
const silence = readJson('silence.json');
const highlights = readJson('highlights.json');
const scenes = readJson('scene_changes.json');

const missing = ['metadata.json', 'transcript.json', 'silence.json', 'highlights.json']
  .filter((f) => !fs.existsSync(path.join(inputDir, f)));

if (missing.length > 0) {
  console.error(`❌ 缺少必要檔案：${missing.join(', ')}`);
  console.error('請先依序執行：screen_record_prep → format_detection → extract_livestream → transcribe_tw → silence_detector → highlight_detector');
  process.exit(1);
}

console.log('📊 開始風格分析...');
console.log('');

// ── 熱門短影片的基準參數（根據 YouTube Shorts / TikTok 常見規律） ──
const BENCHMARKS = {
  ideal_highlight_density: 0.05,   // 每分鐘至少 3 個精彩片段（3/60=0.05/秒）
  ideal_silence_ratio: 0.15,       // 靜音占比理想值 ≤ 15%
  ideal_avg_segment_length: 8,     // 每段說話平均長度 ≤ 8 秒
  ideal_delete_silence_ratio: 0.03 // 應刪靜音占比 ≤ 3%
};

const durationSec = metadata ? metadata.duration_seconds : null;
const durationMin = durationSec ? durationSec / 60 : null;

// 計算各項指標
const totalSegments = transcript ? transcript.segments.length : 0;
const avgSegmentLength = (totalSegments > 0 && durationSec)
  ? durationSec / totalSegments
  : null;

const totalSilenceSec = silence ? silence.summary.total_silence_seconds : 0;
const silenceRatio = durationSec ? totalSilenceSec / durationSec : null;

const deleteSilenceSec = silence
  ? silence.segments.filter((s) => s.action === 'delete').reduce((acc, s) => acc + (s.duration || 0), 0)
  : 0;
const deleteSilenceRatio = durationSec ? deleteSilenceSec / durationSec : null;

const highlightCount = highlights ? highlights.summary.total_highlights : 0;
const highlightDensity = durationSec ? highlightCount / durationSec : null;

const sceneChangeCount = scenes ? scenes.summary.total_scene_changes : 0;

// ── 評分函式（每項 0~100 分） ──
function score(value, ideal, lowerIsBetter = false) {
  if (value === null) return null;
  const ratio = lowerIsBetter ? ideal / Math.max(value, 0.001) : value / ideal;
  return Math.min(100, Math.round(ratio * 100));
}

const scores = {
  highlight_density: score(highlightDensity, BENCHMARKS.ideal_highlight_density),
  silence_ratio: score(silenceRatio, BENCHMARKS.ideal_silence_ratio, true),
  segment_length: score(avgSegmentLength, BENCHMARKS.ideal_avg_segment_length, true),
  delete_silence: score(deleteSilenceRatio, BENCHMARKS.ideal_delete_silence_ratio, true)
};

const validScores = Object.values(scores).filter((v) => v !== null);
const overallScore = validScores.length > 0
  ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
  : null;

// ── 生成建議 ──
const recommendations = [];

if (silenceRatio !== null && silenceRatio > BENCHMARKS.ideal_silence_ratio) {
  const pct = Math.round(silenceRatio * 100);
  recommendations.push(`靜音占比 ${pct}%，偏高（建議 ≤ 15%）。可用 silence_detector 找出的 ${silence.summary.delete_suggested_count} 個長靜音段落來剪輯。`);
}

if (highlightDensity !== null && highlightDensity < BENCHMARKS.ideal_highlight_density) {
  const perMin = Math.round(highlightDensity * 60 * 10) / 10;
  recommendations.push(`精彩密度每分鐘約 ${perMin} 個，偏低（建議 ≥ 3 個/分鐘）。剪成短片時可以優先保留 highlights.json 中高分段落。`);
}

if (avgSegmentLength !== null && avgSegmentLength > BENCHMARKS.ideal_avg_segment_length) {
  recommendations.push(`每段平均 ${Math.round(avgSegmentLength * 10) / 10} 秒，節奏稍慢（建議 ≤ 8 秒/段）。剪輯時可以刪掉每段之間的停頓。`);
}

if (sceneChangeCount === 0) {
  recommendations.push('偵測到 0 個場景切換，是連續錄屏/直播素材。剪成短片時可依 highlights 時間點人工分段。');
}

if (recommendations.length === 0) {
  recommendations.push('各項指標表現良好，素材節奏適合直接剪輯！');
}

const outputJson = path.join(inputDir, 'style_report.json');
const result = {
  source_dir: inputDir,
  video_info: metadata ? {
    duration_seconds: metadata.duration_seconds,
    resolution: metadata.resolution,
    fps: metadata.fps
  } : null,
  metrics: {
    total_segments: totalSegments,
    avg_segment_length_sec: avgSegmentLength ? Math.round(avgSegmentLength * 10) / 10 : null,
    silence_ratio_pct: silenceRatio ? Math.round(silenceRatio * 1000) / 10 : null,
    delete_silence_ratio_pct: deleteSilenceRatio ? Math.round(deleteSilenceRatio * 1000) / 10 : null,
    highlight_count: highlightCount,
    highlight_per_minute: durationMin ? Math.round(highlightCount / durationMin * 10) / 10 : null,
    scene_change_count: sceneChangeCount
  },
  scores,
  overall_score: overallScore,
  recommendations,
  generated_at: new Date().toISOString()
};

fs.writeFileSync(outputJson, JSON.stringify(result, null, 2), 'utf8');

console.log('✅ 風格分析完成！');
console.log('─────────────────────────');
if (metadata) {
  console.log(`📹 影片長度　：${Math.round(metadata.duration_seconds / 60 * 10) / 10} 分鐘`);
}
console.log(`📝 說話段落　：${totalSegments} 段（平均 ${result.metrics.avg_segment_length_sec}s/段）`);
console.log(`🔇 靜音占比　：${result.metrics.silence_ratio_pct}%`);
console.log(`🎯 精彩片段　：${highlightCount} 個（每分鐘 ${result.metrics.highlight_per_minute} 個）`);
console.log(`🎬 場景切換　：${sceneChangeCount} 次`);
console.log('');
console.log(`⭐ 綜合評分　：${overallScore} / 100`);
console.log('');
console.log('💡 建議：');
recommendations.forEach((r) => console.log(`  → ${r}`));
console.log('─────────────────────────');
console.log(`💾 輸出路徑　：${outputJson}`);
