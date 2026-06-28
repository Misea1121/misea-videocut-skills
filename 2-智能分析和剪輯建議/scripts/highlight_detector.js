const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const inputFile = process.argv[2];

if (!inputFile) {
  console.log('用法：node highlight_detector.js <音頻檔路徑>');
  console.log('範例：node highlight_detector.js "D:\\Vid\\audio.mp3"');
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`❌ 找不到檔案：${inputFile}`);
  process.exit(1);
}

const inputDir = path.dirname(inputFile);
const transcriptPath = path.join(inputDir, 'transcript.json');
const outputJson = path.join(inputDir, 'highlights.json');

if (!fs.existsSync(transcriptPath)) {
  console.error(`❌ 找不到 transcript.json，請先執行 transcribe_tw.js`);
  process.exit(1);
}

const KEYWORDS = {
  funny:    ['哈哈', '笑死', '幹', '靠', '噴', '臥槽', '蛤', '啊啊', '天啊', '完蛋', '靠北', '我的天', '幹掉'],
  exciting: ['爆頭', '四殺', '五殺', '贏了', '太強', '超強', '神', '絕了', '完美', '不可能', '翻盤'],
  surprise: ['什麼', '怎麼可能', '不是吧', '真的假的', '蛤蛤', '誒誒', '欸欸']
};

console.log(`🎯 開始偵測精彩時刻：${inputFile}`);
console.log('');

// ── 步驟 1：從 transcript.json 找關鍵詞 ──
const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
const keywordHighlights = [];

for (const seg of transcript.segments) {
  const text = seg.text || '';
  const matchedKeywords = [];

  for (const [type, words] of Object.entries(KEYWORDS)) {
    for (const word of words) {
      if (text.includes(word)) {
        matchedKeywords.push({ word, type });
      }
    }
  }

  if (matchedKeywords.length > 0) {
    keywordHighlights.push({
      start: seg.start,
      end: seg.end,
      text,
      type: 'keyword',
      reason: matchedKeywords.map((k) => `${k.type}關鍵詞「${k.word}」`).join('、'),
      score: matchedKeywords.length
    });
  }
}

console.log(`🔍 關鍵詞掃描完成：找到 ${keywordHighlights.length} 個潛在精彩片段`);

// ── 步驟 2：用 ffmpeg 分析音量突增 ──
console.log('📊 正在分析音量波動...');

function detectVolumeSpikes(audioFile) {
  return new Promise((resolve) => {
    // 輸出單聲道、每秒 100 個取樣點的原始 PCM 資料
    const ff = spawn('ffmpeg', [
      '-i', audioFile,
      '-ac', '1',
      '-ar', '100',
      '-f', 's16le',
      '-'
    ]);

    const chunks = [];
    ff.stdout.on('data', (chunk) => chunks.push(chunk));
    ff.stderr.on('data', () => {});

    ff.on('close', () => {
      const buffer = Buffer.concat(chunks);
      const totalSamples = buffer.length / 2;

      // 計算每 1 秒的 RMS（音量均方根）
      const rmsPerSecond = [];
      for (let sec = 0; sec * 100 < totalSamples; sec++) {
        const start = sec * 100;
        const end = Math.min(start + 100, totalSamples);
        let sumSquares = 0;
        for (let i = start; i < end; i++) {
          const sample = buffer.readInt16LE(i * 2);
          sumSquares += sample * sample;
        }
        rmsPerSecond.push(Math.sqrt(sumSquares / (end - start)));
      }

      // 找出平均值和標準差，超過「平均 + 2 個標準差」視為突增
      const mean = rmsPerSecond.reduce((a, b) => a + b, 0) / rmsPerSecond.length;
      const variance = rmsPerSecond.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / rmsPerSecond.length;
      const std = Math.sqrt(variance);
      const threshold = mean + 2 * std;

      const spikes = [];
      let inSpike = false;
      let spikeStart = null;

      for (let sec = 0; sec < rmsPerSecond.length; sec++) {
        if (rmsPerSecond[sec] > threshold && !inSpike) {
          inSpike = true;
          spikeStart = sec;
        } else if (rmsPerSecond[sec] <= threshold && inSpike) {
          spikes.push({ start: spikeStart, end: sec });
          inSpike = false;
        }
      }
      if (inSpike) spikes.push({ start: spikeStart, end: rmsPerSecond.length });

      resolve(spikes);
    });
  });
}

detectVolumeSpikes(inputFile).then((spikes) => {
  console.log(`🔊 音量突增：找到 ${spikes.length} 個片段`);

  const volumeHighlights = spikes.map((s) => ({
    start: s.start,
    end: s.end,
    text: '',
    type: 'volume_spike',
    reason: '音量突增',
    score: 2
  }));

  // ── 步驟 3：合併兩種結果，並把時間重疊的片段合成一筆 ──
  const all = [...keywordHighlights, ...volumeHighlights].sort((a, b) => a.start - b.start);

  const merged = [];
  for (const item of all) {
    const last = merged[merged.length - 1];
    if (last && item.start <= last.end + 2) {
      // 合併：延伸結束時間、加總分數、合併原因
      last.end = Math.max(last.end, item.end);
      last.score += item.score;
      if (item.reason && !last.reason.includes(item.reason)) {
        last.reason += '、' + item.reason;
      }
      if (item.text && !last.text.includes(item.text)) {
        last.text += ' ' + item.text;
      }
    } else {
      merged.push({ ...item });
    }
  }

  // 加上 id，並依分數排序（高分先）
  const highlights = merged
    .map((h, i) => ({ id: i, ...h, start: Math.round(h.start * 100) / 100, end: Math.round(h.end * 100) / 100 }))
    .sort((a, b) => b.score - a.score);

  const result = {
    source_audio: path.basename(inputFile),
    source_transcript: 'transcript.json',
    summary: {
      total_highlights: highlights.length,
      keyword_based: keywordHighlights.length,
      volume_spike_based: volumeHighlights.length
    },
    highlights,
    generated_at: new Date().toISOString()
  };

  fs.writeFileSync(outputJson, JSON.stringify(result, null, 2), 'utf8');

  console.log('');
  console.log('✅ 精彩時刻偵測完成！');
  console.log('─────────────────────────');
  console.log(`🎯 精彩片段總數　：${result.summary.total_highlights} 個`);
  console.log(`🔑 關鍵詞命中　　：${result.summary.keyword_based} 個`);
  console.log(`🔊 音量突增　　　：${result.summary.volume_spike_based} 個`);
  console.log(`💾 輸出路徑　　　：${outputJson}`);
  console.log('─────────────────────────');
  console.log('\n📋 分數最高的前 5 個精彩片段：');
  highlights.slice(0, 5).forEach((h) => {
    console.log(`  ⭐ [${h.start}s → ${h.end}s] 分數:${h.score} | ${h.reason}`);
    if (h.text.trim()) console.log(`     💬 "${h.text.trim().slice(0, 40)}"`);
  });
});
