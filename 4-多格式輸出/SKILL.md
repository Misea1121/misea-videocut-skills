---
name: misea-videocut-skills:多格式輸出
description: 生成最終成片。YouTube Shorts、完整版、字幕、音樂
author: Misea1121
source: https://github.com/Misea1121/misea-videocut-skills
---

# 多格式輸出 v1

> 自動生成 YouTube Shorts（9:16）和完整版（16:9），加字幕和音樂

## 快速使用

```
用 misea-videocut-skills:多格式輸出，幫我生成 YouTube Shorts 版本（9:16），加上簡潔字幕和配樂。
用 misea-videocut-skills:多格式輸出，生成 YouTube 完整版（16:9）和 Shorts 版本，都要字幕。
```

## 輸出格式

### 1. YouTube Shorts（豎屏）
- **解析度**：1080×1920（9:16）
- **幀率**：30fps
- **碼率**：5Mbps
- **文件名**：output_shorts.mp4

### 2. YouTube 完整版（橫屏）
- **解析度**：1920×1080（16:9）
- **幀率**：30fps
- **碼率**：8Mbps
- **文件名**：output_full.mp4

## 自動字幕

- **風格**：簡潔派（只顯示關鍵對白）
- **格式**：SRT（subtitle.srt）
- **位置**：下方中心
- **字體**：粗體、大號、帶描邊

## 音樂匹配

- **來源**：YouTube Audio Library（本地資源庫）
- **自動匹配**：根據視頻節奏選擇
- **轉場**：音樂轉場同步於鏡頭切換

## 工作流

```
輸入：confirmed_cuts.json + source.mp4 + subtitles.srt
    ↓
1. 根據確認的片段裁剪視頻
    ↓
2. 生成豎屏版本（9:16）
    ├─ 自動居中
    ├─ 添加字幕
    └─ 配音樂
    ↓
3. 生成橫屏版本（16:9）
    ├─ 保持原比例
    ├─ 添加字幕
    └─ 配音樂
    ↓
輸出：
- output_shorts.mp4（Shorts 版本）
- output_full.mp4（完整版）
- subtitle.srt（字幕文件）
```

## 腳本

- `export_vertical_9_16.js` - 導出豎屏版本
- `export_horizontal_16_9.js` - 導出橫屏版本
- `auto_caption_gen.js` - 自動字幕生成
- `youtube_music_library.js` - 音樂庫管理
