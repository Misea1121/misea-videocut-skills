const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const inputFile = process.argv[2];

if (!inputFile) {
  console.log('用法：node silence_detector.js <音頻檔路徑>');
  console.log('範例：node silence_detector.js "D:\\Vid\\audio.mp3"');
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`❌ 找不到檔案：${inputFile}`);
  process.exit(1);
}

const outputDir = path.dirname(inputFile);
const outputJson = path.join(outputDir, 'silence.json');

console.log(`🔇 開始偵測靜音：${inputFile}`);
console.log('⏳ 請稍候...');
console.log('');

// d=0.2 → 只回報 ≥ 0.2s 的靜音（更短的自動略過）
const args = [
  '-i', inputFile,
  '-af', 'silencedetect=noise=-30dB:d=0.2',
  '-f', 'null',
  '-'
];

let stderrOutput = '';

const ff = spawn('ffmpeg', args);

ff.stderr.setEncoding('utf8');
ff.stderr.on('data', (data) => {
  stderrOutput += data;
});

ff.on('close', (code) => {
  if (code !== 0 && !stderrOutput.includes('silence_')) {
    console.error('❌ ffmpeg 執行失敗');
    process.exit(1);
  }

  const segments = [];
  const lines = stderrOutput.split('\n');
  let pendingStart = null;

  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.e+-]+)/);
    const endMatch = line.match(/silence_end:\s*([\d.e+-]+)\s*\|\s*silence_duration:\s*([\d.e+-]+)/);

    if (startMatch) {
      pendingStart = parseFloat(startMatch[1]);
    }

    if (endMatch && pendingStart !== null) {
      const end = parseFloat(endMatch[1]);
      const duration = parseFloat(endMatch[2]);
      const action = duration > 1.0 ? 'delete' : 'mark';

      segments.push({
        id: segments.length,
        start: Math.round(pendingStart * 100) / 100,
        end: Math.round(end * 100) / 100,
        duration: Math.round(duration * 100) / 100,
        action
      });

      pendingStart = null;
    }
  }

  // 處理音頻結尾就是靜音、沒有 silence_end 的情況
  if (pendingStart !== null) {
    segments.push({
      id: segments.length,
      start: Math.round(pendingStart * 100) / 100,
      end: null,
      duration: null,
      action: 'mark'
    });
  }

  const markedCount = segments.filter((s) => s.action === 'mark').length;
  const deleteCount = segments.filter((s) => s.action === 'delete').length;
  const totalSilence = segments
    .filter((s) => s.duration !== null)
    .reduce((acc, s) => acc + s.duration, 0);

  const result = {
    source_audio: path.basename(inputFile),
    silence_threshold: '-30dB',
    rules: { ignore_below: 0.2, mark_up_to: 1.0, delete_above: 1.0 },
    summary: {
      total_count: segments.length,
      marked_count: markedCount,
      delete_suggested_count: deleteCount,
      total_silence_seconds: Math.round(totalSilence * 100) / 100
    },
    segments,
    generated_at: new Date().toISOString()
  };

  fs.writeFileSync(outputJson, JSON.stringify(result, null, 2), 'utf8');

  console.log('✅ 靜音偵測完成！');
  console.log('─────────────────────────');
  console.log(`🔇 來源音頻　　　：${result.source_audio}`);
  console.log(`📝 偵測到片段　　：${result.summary.total_count} 個`);
  console.log(`🟡 標記（0.2–1s）：${result.summary.marked_count} 個`);
  console.log(`🔴 建議刪除（>1s）：${result.summary.delete_suggested_count} 個`);
  console.log(`⏱  靜音總時長　　：${result.summary.total_silence_seconds} 秒`);
  console.log(`💾 輸出路徑　　　：${outputJson}`);
  console.log('─────────────────────────');

  if (segments.length > 0) {
    console.log('\n📋 前 5 個靜音片段：');
    segments.slice(0, 5).forEach((seg) => {
      const icon = seg.action === 'delete' ? '🔴' : '🟡';
      const dur = seg.duration !== null ? `${seg.duration}s` : '未知';
      console.log(`  ${icon} [${seg.start}s → ${seg.end}s] 持續 ${dur} → ${seg.action}`);
    });
  }
});
