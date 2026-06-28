#!/usr/bin/env node
/**
 * extract_livestream.js
 *
 * 功能:從一個直播錄影/錄屏檔裡,把聲音單獨抽出來存成 audio.mp3。
 *      這樣後面「智能分析」那個 skill 才能拿這個音檔去做轉錄、
 *      抓搞笑關鍵字、偵測靜音等等。
 *
 * 用法:
 *   node extract_livestream.js <影片檔路徑>
 *
 * 範例:
 *   node extract_livestream.js ./test_sample.mp4
 *
 * 需求:電腦上要先裝好 ffmpeg
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function main() {
  // 1. 檢查使用者有沒有給影片路徑
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.log('❌ 請告訴我要抽哪個影片的聲音');
    console.log('用法：node extract_livestream.js <影片檔路徑>');
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.log(`❌ 找不到這個檔案：${inputPath}`);
    process.exit(1);
  }

  // 2. 先用 ffprobe 確認這個影片裡真的有聲音軌,沒有的話就不用浪費時間轉檔
  console.log(`🔍 正在檢查：${inputPath}`);

  let hasAudio = false;
  try {
    const probeCmd = `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${inputPath}"`;
    const result = execSync(probeCmd, { encoding: 'utf-8' }).trim();
    hasAudio = result.includes('audio');
  } catch (err) {
    console.log('❌ 呼叫 ffprobe 失敗,請確認電腦有裝 ffmpeg');
    console.log(err.message);
    process.exit(1);
  }

  if (!hasAudio) {
    console.log('⚠️  這個影片裡沒有偵測到聲音軌,沒有東西可以抽,先跳過。');
    process.exit(0);
  }

  // 3. 決定輸出路徑:跟輸入影片放在同一個資料夾,固定叫 audio.mp3
  const outputDir = path.dirname(inputPath);
  const outputPath = path.join(outputDir, 'audio.mp3');

  console.log('🎧 開始抽取音軌...');

  // 4. 呼叫 ffmpeg 把音軌轉成 mp3
  //    -vn          不要影像,只要聲音
  //    -acodec libmp3lame  用 mp3 編碼器
  //    -q:a 2       音質設定(0 最好、9 最差,2 是接近最好但檔案不會太大)
  //    -y           如果 audio.mp3 已經存在,直接覆蓋,不要卡著問
  try {
    const cmd = `ffmpeg -y -i "${inputPath}" -vn -acodec libmp3lame -q:a 2 "${outputPath}"`;
    execSync(cmd, { stdio: 'pipe' });
  } catch (err) {
    console.log('❌ 抽取音軌失敗');
    console.log(err.message);
    process.exit(1);
  }

  // 5. 確認檔案真的生成了,並印出大小給使用者安心
  if (fs.existsSync(outputPath)) {
    const sizeMb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
    console.log('✅ 抽取完成！');
    console.log('─────────────────────────');
    console.log(`🎵 輸出檔案　：${outputPath}`);
    console.log(`💾 檔案大小　：${sizeMb} MB`);
    console.log('─────────────────────────');
  } else {
    console.log('❌ ffmpeg 跑完了,但是沒找到輸出檔案,可能哪裡出錯了');
    process.exit(1);
  }
}

main();
