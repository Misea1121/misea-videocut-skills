const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const inputFile = process.argv[2];

if (!inputFile) {
  console.log('用法：node scene_change.js <影片檔路徑>');
  console.log('範例：node scene_change.js "D:\\Vid\\source.mp4"');
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`❌ 找不到檔案：${inputFile}`);
  process.exit(1);
}

const outputDir = path.dirname(inputFile);
const outputJson = path.join(outputDir, 'scene_changes.json');

// 偵測門檻：0.0~1.0，數字越高代表「變化要非常大才算場景切換」
// 0.4 是常用預設值，可以根據需求調整
const THRESHOLD = 0.4;

console.log(`🎬 開始偵測場景切換：${inputFile}`);
console.log(`📐 偵測門檻：${THRESHOLD}（0=任何變化都算，1=只算最劇烈的變化）`);
console.log('⏳ 請稍候...');
console.log('');

const args = [
  '-i', inputFile,
  '-vf', `select='gt(scene,${THRESHOLD})',metadata=print:file=-`,
  '-an',
  '-f', 'null',
  '-'
];

let stdoutData = '';
let stderrData = '';

const ff = spawn('ffmpeg', args);

ff.stdout.setEncoding('utf8');
ff.stdout.on('data', (data) => { stdoutData += data; });

ff.stderr.setEncoding('utf8');
ff.stderr.on('data', (data) => { stderrData += data; });

ff.on('close', (code) => {
  // 從 stderr 找 pts_time（每個被選中畫面的時間戳）
  // ffmpeg 的 select filter 輸出格式：pts_time:N.NNN
  const timeMatches = [...stderrData.matchAll(/pts_time:([\d.]+)/g)];
  // 也從 stdout 的 metadata print 取得場景分數
  const scoreMatches = [...stdoutData.matchAll(/lavfi\.scene_score=([\d.]+)/g)];

  if (timeMatches.length === 0 && scoreMatches.length === 0) {
    // 改用 showinfo filter 作為備用方案
    fallbackDetect(inputFile, outputDir, outputJson, THRESHOLD);
    return;
  }

  const scenes = timeMatches.map((m, i) => ({
    id: i,
    timestamp: Math.round(parseFloat(m[1]) * 100) / 100,
    score: scoreMatches[i] ? Math.round(parseFloat(scoreMatches[i][1]) * 1000) / 1000 : null
  }));

  saveResult(scenes, inputFile, outputJson, THRESHOLD);
});

function fallbackDetect(inputFile, outputDir, outputJson, threshold) {
  // 備用方案：用 ffprobe 搭配 scene filter
  const args2 = [
    '-i', inputFile,
    '-vf', `scdet=threshold=${threshold * 100}`,
    '-an',
    '-f', 'null',
    '-'
  ];

  let stderr2 = '';
  const ff2 = spawn('ffmpeg', args2);
  ff2.stderr.setEncoding('utf8');
  ff2.stderr.on('data', (d) => { stderr2 += d; });

  ff2.on('close', () => {
    // scdet 輸出格式：[Parsed_scdet_0 @ ...] lavfi.scd.score: N, lavfi.scd.time: T
    const sceneLines = stderr2.split('\n').filter((l) => l.includes('lavfi.scd.time'));
    const scenes = sceneLines.map((line, i) => {
      const timeMatch = line.match(/lavfi\.scd\.time:\s*([\d.]+)/);
      const scoreMatch = line.match(/lavfi\.scd\.score:\s*([\d.]+)/);
      return {
        id: i,
        timestamp: timeMatch ? Math.round(parseFloat(timeMatch[1]) * 100) / 100 : null,
        score: scoreMatch ? Math.round(parseFloat(scoreMatch[1]) * 10) / 10 : null
      };
    }).filter((s) => s.timestamp !== null);

    saveResult(scenes, inputFile, outputJson, threshold);
  });
}

function saveResult(scenes, inputFile, outputJson, threshold) {
  const result = {
    source_video: path.basename(inputFile),
    threshold,
    summary: {
      total_scene_changes: scenes.length
    },
    scenes,
    generated_at: new Date().toISOString()
  };

  fs.writeFileSync(outputJson, JSON.stringify(result, null, 2), 'utf8');

  console.log('✅ 場景切換偵測完成！');
  console.log('─────────────────────────');
  console.log(`🎬 來源影片　　　：${result.source_video}`);
  console.log(`✂️  場景切換次數　：${result.summary.total_scene_changes} 次`);
  console.log(`💾 輸出路徑　　　：${outputJson}`);
  console.log('─────────────────────────');

  if (scenes.length > 0) {
    console.log('\n📋 前 5 個場景切換點：');
    scenes.slice(0, 5).forEach((s) => {
      const score = s.score !== null ? ` (強度: ${s.score})` : '';
      console.log(`  🎬 ${s.timestamp}s${score}`);
    });
  } else {
    console.log('\n⚠️  沒有偵測到場景切換（可能是錄屏/直播，畫面變化較平緩）');
  }
}
