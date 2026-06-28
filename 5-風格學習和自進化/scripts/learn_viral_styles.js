/**
 * learn_viral_styles.js
 * 分析「火紅影片」的節奏、剪輯頻率、音量特徵，輸出 viral_analysis.json
 *
 * 用法（兩種模式）：
 *   有 yt-dlp：node learn_viral_styles.js <YouTube網址1> <網址2> ...
 *   本機影片：node learn_viral_styles.js <影片1.mp4> <影片2.mp4> ...
 *
 * 安裝 yt-dlp（可選）：pip install yt-dlp
 */

const { execFileSync, execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const inputs = process.argv.slice(2);

if (inputs.length === 0) {
  console.log('用法：');
  console.log('  node learn_viral_styles.js <YouTube網址或本機影片路徑> [...]');
  console.log('');
  console.log('範例（本機）：');
  console.log('  node learn_viral_styles.js "D:\\Vid\\viral1.mp4" "D:\\Vid\\viral2.mp4"');
  console.log('');
  console.log('範例（YouTube，需先安裝 yt-dlp）：');
  console.log('  node learn_viral_styles.js "https://www.youtube.com/shorts/xxx"');
  console.log('');
  console.log('安裝 yt-dlp：pip install yt-dlp');
  process.exit(1);
}

// 確認 yt-dlp 是否可用
let hasYtDlp = false;
try { execSync('yt-dlp --version', { stdio: 'pipe' }); hasYtDlp = true; } catch {}

const outputDir = path.join(__dirname, '..');
const outputJson = path.join(outputDir, 'viral_analysis.json');
const tmpDir = path.join(os.tmpdir(), 'viral_analysis');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

console.log(`🔥 開始分析火紅影片（共 ${inputs.length} 個）`);
console.log(`📦 yt-dlp：${hasYtDlp ? '可用（支援 URL 下載）' : '未安裝（僅支援本機影片）'}`);
console.log('');

// ── 工具函式 ──

function getVideoInfo(filePath) {
  const raw = execFileSync('ffprobe', [
    '-v', 'quiet', '-print_format', 'json',
    '-show_format', '-show_streams', filePath
  ], { encoding: 'utf8' });
  return JSON.parse(raw);
}

function detectSceneChanges(filePath) {
  return new Promise((resolve) => {
    let stderr = '';
    const ff = spawn('ffmpeg', [
      '-i', filePath,
      '-vf', 'scdet=threshold=30',
      '-an', '-f', 'null', '-'
    ]);
    ff.stderr.setEncoding('utf8');
    ff.stderr.on('data', (d) => { stderr += d; });
    ff.on('close', () => {
      const matches = stderr.match(/lavfi\.scd\.time:/g);
      resolve(matches ? matches.length : 0);
    });
  });
}

function getAudioLoudness(filePath) {
  return new Promise((resolve) => {
    let stderr = '';
    const ff = spawn('ffmpeg', [
      '-i', filePath,
      '-af', 'volumedetect',
      '-vn', '-f', 'null', '-'
    ]);
    ff.stderr.setEncoding('utf8');
    ff.stderr.on('data', (d) => { stderr += d; });
    ff.on('close', () => {
      const maxDb  = stderr.match(/max_volume:\s*([-\d.]+)\s*dB/)?.[1];
      const meanDb = stderr.match(/mean_volume:\s*([-\d.]+)\s*dB/)?.[1];
      resolve({
        max_db:  maxDb  ? parseFloat(maxDb)  : null,
        mean_db: meanDb ? parseFloat(meanDb) : null
      });
    });
  });
}

async function downloadVideo(url) {
  if (!hasYtDlp) return null;
  const outTemplate = path.join(tmpDir, '%(id)s.%(ext)s');
  console.log(`  ⬇️  下載：${url}`);
  try {
    execSync(
      `yt-dlp -f "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o "${outTemplate}" "${url}"`,
      { stdio: 'pipe' }
    );
    // 找到下載的檔案
    const files = fs.readdirSync(tmpDir).map((f) => path.join(tmpDir, f));
    files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return files[0] || null;
  } catch (e) {
    console.error(`  ❌ 下載失敗：${e.message.slice(0, 100)}`);
    return null;
  }
}

function classifyPacing(cutsPerMin) {
  if (cutsPerMin >= 20) return 'ultra-fast';
  if (cutsPerMin >= 12) return 'fast';
  if (cutsPerMin >= 6)  return 'medium';
  return 'slow';
}

// ── 主流程 ──

async function analyzeOne(input) {
  const isUrl = /^https?:\/\//.test(input);
  let filePath = input;
  let source = input;

  if (isUrl) {
    if (!hasYtDlp) {
      return {
        source, error: 'yt-dlp 未安裝，無法下載 URL。請改用本機影片，或執行：pip install yt-dlp'
      };
    }
    filePath = await downloadVideo(input);
    if (!filePath) return { source, error: '下載失敗' };
  }

  if (!fs.existsSync(filePath)) return { source, error: `找不到檔案：${filePath}` };

  console.log(`  🔍 分析：${path.basename(filePath)}`);

  try {
    const info = getVideoInfo(filePath);
    const duration = parseFloat(info.format?.duration || 0);
    const videoStream = (info.streams || []).find((s) => s.codec_type === 'video');
    const fps = videoStream?.r_frame_rate
      ? eval(videoStream.r_frame_rate)  // e.g. "30/1"
      : null;

    const [sceneChanges, loudness] = await Promise.all([
      detectSceneChanges(filePath),
      getAudioLoudness(filePath)
    ]);

    const cutsPerMin = duration > 0 ? Math.round((sceneChanges / duration) * 60 * 10) / 10 : 0;
    const avgClipLen = sceneChanges > 0 ? Math.round(duration / sceneChanges * 10) / 10 : duration;

    return {
      source,
      file: path.basename(filePath),
      duration_sec: Math.round(duration * 10) / 10,
      resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : null,
      fps: fps ? Math.round(fps) : null,
      scene_changes: sceneChanges,
      cuts_per_minute: cutsPerMin,
      avg_clip_length_sec: avgClipLen,
      pacing: classifyPacing(cutsPerMin),
      audio: loudness,
      content_structure: {
        opening_0_20pct: `${Math.round(duration * 0.2)}s 以內`,
        climax_40_70pct: `${Math.round(duration * 0.4)}-${Math.round(duration * 0.7)}s`,
        ending_80pct_on: `${Math.round(duration * 0.8)}s 之後`
      }
    };
  } catch (e) {
    return { source, error: e.message };
  }
}

(async () => {
  const results = [];
  for (const input of inputs) {
    const r = await analyzeOne(input);
    results.push(r);
    if (r.error) {
      console.log(`  ⚠️  ${r.source} → ${r.error}`);
    } else {
      console.log(`  ✅ 時長 ${r.duration_sec}s｜${r.cuts_per_minute} 剪/分鐘（${r.pacing}）｜平均 ${r.avg_clip_length_sec}s/段`);
    }
  }

  const valid = results.filter((r) => !r.error);
  const agg = valid.length > 0 ? {
    avg_duration_sec:      Math.round(valid.reduce((a, r) => a + r.duration_sec, 0) / valid.length * 10) / 10,
    avg_cuts_per_minute:   Math.round(valid.reduce((a, r) => a + r.cuts_per_minute, 0) / valid.length * 10) / 10,
    avg_clip_length_sec:   Math.round(valid.reduce((a, r) => a + r.avg_clip_length_sec, 0) / valid.length * 10) / 10,
    dominant_pacing:       valid.map((r) => r.pacing).sort((a, b) =>
      valid.filter((x) => x.pacing === b).length - valid.filter((x) => x.pacing === a).length)[0]
  } : null;

  const output = {
    analyzed_at: new Date().toISOString(),
    total_videos: results.length,
    success_count: valid.length,
    videos: results,
    aggregated: agg
  };

  fs.writeFileSync(outputJson, JSON.stringify(output, null, 2), 'utf8');

  console.log('');
  console.log('✅ 分析完成！');
  console.log('─────────────────────────');
  if (agg) {
    console.log(`📊 平均時長　　：${agg.avg_duration_sec} 秒`);
    console.log(`✂️  平均剪輯頻率：${agg.avg_cuts_per_minute} 次/分鐘`);
    console.log(`⏱  平均片段長度：${agg.avg_clip_length_sec} 秒`);
    console.log(`🏃 節奏風格　　：${agg.dominant_pacing}`);
  }
  console.log(`💾 輸出路徑　　：${outputJson}`);
  console.log('─────────────────────────');
  console.log('👉 接著執行 personalize_rules.js 生成個性化規則');
})();
