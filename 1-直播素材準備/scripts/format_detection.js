#!/usr/bin/env node
/**
 * format_detection.js
 *
 * 功能:讀取一個影片檔,偵測它的解析度、幀率、碼率、編碼格式,
 *      並把這些資訊存成 metadata.json,方便後面的步驟使用。
 *
 * 用法:
 *   node format_detection.js <影片檔路徑>
 *
 * 範例:
 *   node format_detection.js ./test_sample.mp4
 *
 * 需求:電腦上要先裝好 ffmpeg(裡面會用到 ffprobe 這個工具)
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function main() {
  // 1. 檢查使用者有沒有給影片路徑
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.log('❌ 請告訴我要檢查哪個影片檔');
    console.log('用法：node format_detection.js <影片檔路徑>');
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.log(`❌ 找不到這個檔案：${inputPath}`);
    process.exit(1);
  }

  console.log(`🔍 正在分析：${inputPath}\n`);

  // 2. 呼叫 ffprobe,請它把影片資訊用 JSON 格式印出來
  //    -v error      只顯示錯誤訊息,不要印一堆雜訊
  //    -show_format  顯示容器格式資訊(時長、檔案大小、整體碼率)
  //    -show_streams 顯示每一條軌(影像軌、聲音軌)的細節
  let probeData;
  try {
    const cmd = `ffprobe -v error -print_format json -show_format -show_streams "${inputPath}"`;
    const output = execSync(cmd, { encoding: 'utf-8' });
    probeData = JSON.parse(output);
  } catch (err) {
    console.log('❌ 呼叫 ffprobe 失敗,請確認電腦有裝 ffmpeg');
    console.log(err.message);
    process.exit(1);
  }

  // 3. 從結果裡找出「影像軌」(codec_type 是 video 的那一條)
  const videoStream = probeData.streams.find((s) => s.codec_type === 'video');
  const audioStream = probeData.streams.find((s) => s.codec_type === 'audio');

  if (!videoStream) {
    console.log('⚠️  這個檔案裡找不到影像軌,可能不是有效的影片檔');
    process.exit(1);
  }

  // 4. 幀率(fps)在 ffprobe 回傳的格式是「30/1」這種分數,要自己算成小數
  const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
  const fps = den ? Math.round((num / den) * 100) / 100 : num;

  // 5. 整理成簡單好讀的物件
  const metadata = {
    file: path.basename(inputPath),
    duration_seconds: Number(probeData.format.duration).toFixed(2),
    resolution: `${videoStream.width}x${videoStream.height}`,
    fps,
    video_codec: videoStream.codec_name,
    video_bitrate_kbps: videoStream.bit_rate
      ? Math.round(videoStream.bit_rate / 1000)
      : null,
    has_audio: !!audioStream,
    audio_codec: audioStream ? audioStream.codec_name : null,
    file_size_mb: (fs.statSync(inputPath).size / 1024 / 1024).toFixed(2),
  };

  // 6. 印給使用者看(中文、好懂)
  console.log('✅ 分析完成！');
  console.log('─────────────────────────');
  console.log(`📁 檔案名稱　：${metadata.file}`);
  console.log(`⏱  影片長度　：${metadata.duration_seconds} 秒`);
  console.log(`📐 解析度　　：${metadata.resolution}`);
  console.log(`🎞  幀率　　　：${metadata.fps} fps`);
  console.log(`🎬 影像編碼　：${metadata.video_codec}`);
  console.log(
    `📊 影像碼率　：${metadata.video_bitrate_kbps ? metadata.video_bitrate_kbps + ' kbps' : '未知'}`
  );
  console.log(`🔊 有沒有聲音：${metadata.has_audio ? '有（' + metadata.audio_codec + '）' : '沒有'}`);
  console.log(`💾 檔案大小　：${metadata.file_size_mb} MB`);
  console.log('─────────────────────────');

  // 7. 存成 metadata.json,放在跟輸入影片同一個資料夾
  const outputDir = path.dirname(inputPath);
  const outputPath = path.join(outputDir, 'metadata.json');
  fs.writeFileSync(outputPath, JSON.stringify(metadata, null, 2), 'utf-8');
  console.log(`\n💾 已經把詳細資訊存到：${outputPath}`);
}

main();