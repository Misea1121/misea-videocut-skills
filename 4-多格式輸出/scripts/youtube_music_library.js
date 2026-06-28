const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// 用法：
//   node youtube_music_library.js scan <音樂資料夾路徑>      → 掃描並建立音樂庫
//   node youtube_music_library.js list                       → 列出音樂庫
//   node youtube_music_library.js mix <影片.mp4> <音樂.mp3>  → 疊加背景音樂
const cmd = process.argv[2];

const LIBRARY_FILE = path.join(__dirname, '..', 'music_library.json');

function loadLibrary() {
  return fs.existsSync(LIBRARY_FILE)
    ? JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'))
    : { tracks: [] };
}

function saveLibrary(lib) {
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(lib, null, 2), 'utf8');
}

function getDuration(filePath) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'quiet', '-print_format', 'json',
      '-show_format', filePath
    ], { encoding: 'utf8' });
    const data = JSON.parse(out);
    return Math.round(parseFloat(data.format.duration));
  } catch { return null; }
}

// ── scan 指令 ──
if (cmd === 'scan') {
  const musicDir = process.argv[3];
  if (!musicDir || !fs.existsSync(musicDir)) {
    console.error('❌ 用法：node youtube_music_library.js scan <音樂資料夾路徑>');
    process.exit(1);
  }

  console.log(`🎵 掃描音樂資料夾：${musicDir}`);
  const exts = ['.mp3', '.wav', '.m4a', '.ogg', '.flac'];
  const files = fs.readdirSync(musicDir)
    .filter((f) => exts.includes(path.extname(f).toLowerCase()))
    .map((f) => path.join(musicDir, f));

  console.log(`找到 ${files.length} 個音樂檔案，正在分析時長...`);

  const lib = loadLibrary();
  const existingPaths = new Set(lib.tracks.map((t) => t.path));
  let added = 0;

  for (const fp of files) {
    if (existingPaths.has(fp)) continue;
    const dur = getDuration(fp);
    const name = path.basename(fp, path.extname(fp));
    lib.tracks.push({
      id: lib.tracks.length,
      name,
      path: fp,
      duration_sec: dur,
      tags: []
    });
    added++;
    process.stdout.write(`\r  已加入：${added} 首`);
  }

  saveLibrary(lib);
  console.log(`\n✅ 音樂庫更新完成！共 ${lib.tracks.length} 首`);
  console.log(`💾 音樂庫路徑：${LIBRARY_FILE}`);

// ── list 指令 ──
} else if (cmd === 'list') {
  const lib = loadLibrary();
  if (lib.tracks.length === 0) {
    console.log('⚠️  音樂庫是空的，請先執行 scan 掃描你的音樂資料夾');
    process.exit(0);
  }
  console.log(`🎵 音樂庫（共 ${lib.tracks.length} 首）\n`);
  lib.tracks.forEach((t) => {
    const dur = t.duration_sec ? `${Math.floor(t.duration_sec / 60)}:${(t.duration_sec % 60).toString().padStart(2, '0')}` : '未知';
    const tags = t.tags.length > 0 ? ` [${t.tags.join(', ')}]` : '';
    console.log(`  ${t.id.toString().padStart(3, ' ')}. ${t.name}${tags}  (${dur})`);
  });

// ── mix 指令 ──
} else if (cmd === 'mix') {
  const videoFile = process.argv[3];
  const musicFile = process.argv[4];

  if (!videoFile || !musicFile) {
    console.log('用法：node youtube_music_library.js mix <影片.mp4> <音樂.mp3>');
    process.exit(1);
  }

  if (!fs.existsSync(videoFile)) { console.error(`❌ 找不到影片：${videoFile}`); process.exit(1); }
  if (!fs.existsSync(musicFile)) { console.error(`❌ 找不到音樂：${musicFile}`); process.exit(1); }

  const outputDir  = path.dirname(path.resolve(videoFile));
  const baseName   = path.basename(videoFile, '.mp4');
  const outputFile = path.join(outputDir, `${baseName}_with_music.mp4`);

  // 音量混合：原聲 100%，背景音樂 20%，並在影片結束時淡出
  console.log(`🎵 混入背景音樂：${path.basename(musicFile)}`);
  console.log(`🎬 目標影片：${path.basename(videoFile)}`);
  console.log('⏳ 請稍候...\n');

  const args = [
    '-i', videoFile,
    '-i', musicFile,
    '-filter_complex',
    '[1:a]volume=0.2,afade=t=out:st=0:d=3[music];[0:a][music]amix=inputs=2:duration=first[aout]',
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-y',
    outputFile
  ];

  const ff = spawn('ffmpeg', args);
  ff.stderr.setEncoding('utf8');
  ff.stderr.on('data', (d) => {
    const m = d.match(/time=(\d+:\d+:\d+)/);
    if (m) process.stdout.write(`\r⏳ 編碼進度：${m[1]}   `);
  });
  ff.on('close', (code) => {
    if (code !== 0) { console.error('\n❌ 混音失敗'); process.exit(1); }
    const sizeMB = Math.round(fs.statSync(outputFile).size / 1024 / 1024 * 10) / 10;
    console.log('\n✅ 背景音樂混入完成！');
    console.log(`💾 輸出：${outputFile}（${sizeMB} MB）`);
    console.log('🎵 背景音樂音量：20%，原聲：100%');
  });

} else {
  console.log('🎵 youtube_music_library.js — 音樂庫管理工具');
  console.log('');
  console.log('指令：');
  console.log('  scan <資料夾>        掃描音樂資料夾，加入音樂庫');
  console.log('  list                 列出音樂庫所有曲目');
  console.log('  mix <影片> <音樂>    將音樂疊加進影片（原聲100%＋音樂20%）');
  console.log('');
  console.log('範例：');
  console.log('  node youtube_music_library.js scan "D:\\Music"');
  console.log('  node youtube_music_library.js list');
  console.log('  node youtube_music_library.js mix "D:\\Vid\\output_shorts.mp4" "D:\\Music\\bgm.mp3"');
}
