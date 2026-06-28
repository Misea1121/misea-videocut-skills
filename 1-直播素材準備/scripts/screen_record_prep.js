#!/usr/bin/env node
/**
 * screen_record_prep.js
 *
 * 功能:把錄屏/直播檔統一轉成標準格式 ——1920×1080、30fps,
 *      存成 source.mp4,讓後面所有步驟都能用同一套規格處理,
 *      不用管原始檔案到底是手機錄的、OBS 錄的、還是下載的。
 *
 *      如果輸入的影片本來就已經符合標準格式,就直接複製,
 *      不浪費時間重新轉檔(重新轉檔多少都會讓畫質變差一點)。
 *
 * 用法:
 *   node screen_record_prep.js <影片檔路徑>
 *
 * 範例:
 *   node screen_record_prep.js ./test_sample.mp4
 *
 * 需求:電腦上要先裝好 ffmpeg
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;
const TARGET_FPS = 30;

function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.log('❌ 請告訴我要處理哪個影片');
    console.log('用法：node screen_record_prep.js <影片檔路徑>');
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.log(`❌ 找不到這個檔案：${inputPath}`);
    process.exit(1);
  }

  console.log(`🔍 正在檢查：${inputPath}`);

  // 1. 用 ffprobe 讀目前的解析度跟幀率,跟標準格式比較看看
  let width, height, fps;
  try {
    const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "${inputPath}"`;
    const result = execSync(cmd, { encoding: 'utf-8' }).trim();
    const [w, h, rate] = result.split(',');
    width = Number(w);
    height = Number(h);
    const [num, den] = rate.split('/').map(Number);
    fps = den ? num / den : num;
  } catch (err) {
    console.log('❌ 呼叫 ffprobe 失敗,請確認電腦有裝 ffmpeg');
    console.log(err.message);
    process.exit(1);
  }

  const outputDir = path.dirname(inputPath);
  const outputPath = path.join(outputDir, 'source.mp4');

  const alreadyStandard =
    width === TARGET_WIDTH && height === TARGET_HEIGHT && Math.round(fps) === TARGET_FPS;

  if (alreadyStandard) {
    // 2a. 已經是標準格式 → 直接複製,不重新轉檔
    console.log(`✅ 偵測到已經是標準格式（${width}x${height}, ${Math.round(fps)}fps）`);
    console.log('📋 直接複製,不重新轉檔(避免畫質損耗)...');
    fs.copyFileSync(inputPath, outputPath);
  } else {
    // 2b. 不是標準格式 → 用 ffmpeg 縮放 + 補幀到標準格式
    console.log(`⚙️  目前是 ${width}x${height}, ${Math.round(fps)}fps,需要轉成標準格式...`);
    console.log('🎬 開始轉檔,影片越長需要的時間越久,請耐心等待...');

    // scale: 等比縮放到剛好塞進 1920x1080,兩邊不夠的地方補黑邊(避免畫面被拉變形)
    const scaleFilter = `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2`;

    try {
      const cmd = `ffmpeg -y -i "${inputPath}" -vf "${scaleFilter}" -r ${TARGET_FPS} -c:v libx264 -preset fast -crf 20 -c:a copy "${outputPath}"`;
      execSync(cmd, { stdio: 'pipe' });
    } catch (err) {
      console.log('❌ 轉檔失敗');
      console.log(err.message);
      process.exit(1);
    }
  }

  // 3. 確認輸出檔案真的存在
  if (fs.existsSync(outputPath)) {
    const sizeMb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
    console.log('✅ 處理完成！');
    console.log('─────────────────────────');
    console.log(`📁 輸出檔案　：${outputPath}`);
    console.log(`📐 標準格式　：${TARGET_WIDTH}x${TARGET_HEIGHT}, ${TARGET_FPS}fps`);
    console.log(`💾 檔案大小　：${sizeMb} MB`);
    console.log('─────────────────────────');
  } else {
    console.log('❌ 處理完了,但是沒找到輸出檔案,可能哪裡出錯了');
    process.exit(1);
  }
}

main();