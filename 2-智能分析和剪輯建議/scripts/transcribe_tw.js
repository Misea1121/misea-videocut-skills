const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const inputFile = process.argv[2];

if (!inputFile) {
  console.log('用法：node transcribe_tw.js <音頻檔路徑>');
  console.log('範例：node transcribe_tw.js "D:\\Vid\\audio.mp3"');
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`❌ 找不到檔案：${inputFile}`);
  process.exit(1);
}

const outputDir = path.dirname(inputFile);
const outputJson = path.join(outputDir, 'transcript.json');
const helperScript = path.join(__dirname, 'whisper_helper.py');

console.log(`🎙  開始轉錄：${inputFile}`);
console.log(`🤖 使用模型：turbo（第一次執行會下載模型約 800 MB，請耐心等候）`);
console.log(`📁 輸出位置：${outputJson}`);
console.log('');
console.log('── Whisper 進度輸出 ──');

let rawOutput = '';

const py = spawn('python', [helperScript, inputFile, 'turbo'], {
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
});

py.stdout.setEncoding('utf8');
py.stdout.on('data', (data) => {
  rawOutput += data;
});

py.stderr.setEncoding('utf8');
py.stderr.on('data', (data) => {
  process.stdout.write(data);
});

py.on('close', (code) => {
  if (code !== 0) {
    console.error(`\n❌ Whisper 執行失敗（exit code: ${code}）`);
    process.exit(1);
  }

  const start = rawOutput.indexOf('__JSON_START__');
  const end = rawOutput.indexOf('__JSON_END__');
  if (start === -1 || end === -1) {
    console.error('\n❌ 無法解析 Whisper 輸出');
    process.exit(1);
  }

  const jsonStr = rawOutput.slice(start + '__JSON_START__'.length, end).trim();
  let whisperData;
  try {
    whisperData = JSON.parse(jsonStr);
  } catch (e) {
    console.error('\n❌ JSON 解析失敗：', e.message);
    process.exit(1);
  }

  const transcript = {
    source_audio: path.basename(inputFile),
    language: 'zh',
    segments: whisperData.segments.map((seg, i) => ({
      id: i,
      start: Math.round(seg.start * 100) / 100,
      end: Math.round(seg.end * 100) / 100,
      text: seg.text.trim()
    })),
    char_count: whisperData.segments.reduce((acc, seg) => acc + seg.text.trim().length, 0),
    generated_at: new Date().toISOString()
  };

  fs.writeFileSync(outputJson, JSON.stringify(transcript, null, 2), 'utf8');

  console.log('\n✅ 轉錄完成！');
  console.log('─────────────────────────');
  console.log(`🎙  來源音頻　：${transcript.source_audio}`);
  console.log(`📝 片段數量　：${transcript.segments.length} 段`);
  console.log(`🔤 總字元數　：${transcript.char_count}`);
  console.log(`💾 輸出路徑　：${outputJson}`);
  console.log('─────────────────────────');
  console.log('\n📋 前 3 段預覽：');
  transcript.segments.slice(0, 3).forEach((seg) => {
    console.log(`  [${seg.start}s → ${seg.end}s] ${seg.text}`);
  });
});
