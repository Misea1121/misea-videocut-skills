---
name: misea-videocut-skills:直播素材準備
description: 準備直播源或錄屏素材。提取音頻、檢測格式、預處理轉碼
author: Misea1121
source: https://github.com/Misea1121/misea-videocut-skills
---

# 直播素材準備 v1

> 快速入門：把直播錄屏或源文件轉成標準化素材包

## 快速使用

```
用 misea-videocut-skills:直播素材準備，把這個 Valorant 直播錄屏處理成標準素材包。
用 misea-videocut-skills:直播素材準備，準備這個恐怖遊戲直播，我要剪搞笑時刻。
```

## 工作流

```
輸入：
- 直播源（OBS 錄製的 MP4/MOV）
- 或 B站/Twitch 下載的視頻
- 或本地錄屏
    ↓
1. 檢測視頻格式（分辨率、幀率、碼率）
    ↓
2. 提取音頻（MP3 格式）
    ↓
3. 驗證完整性
    ↓
輸出：
- source.mp4（標準化視頻）
- audio.mp3（音頻文件）
- metadata.json（視頻信息）
```

## 執行順序（重要）

三支腳本必須按照以下順序執行，不能跳過或顛倒：

1. `screen_record_prep.js <原始檔路徑>` → 先把原始素材標準化，產生 **source.mp4**
2. `format_detection.js <source.mp4路徑>` → 分析 **source.mp4**，產生 **metadata.json**
3. `extract_livestream.js <原始檔或source.mp4路徑>` → 提取音頻，產生 **audio.mp3**

**為什麼順序重要？**

`metadata.json` 必須反映「最終標準化素材」的格式（例如 30fps）。
如果直接拿原始檔（可能是 60fps）去執行 `format_detection.js`，
記錄的就是原始檔的參數，和實際輸出的 `source.mp4` 對不起來。
後面 Skill 2 讀取 `metadata.json` 時，就會拿到錯誤的影片資訊（幀率、碼率等），
導致分析結果出錯。

## 支持格式

| 格式 | 支持 |
|------|------|
| MP4 | ✅ |
| MOV | ✅ |
| MKV | ✅ |
| AVI | ✅ |
| WebM | ✅ |

## 標準化輸出

```
project/
├── source.mp4              # 標準化視頻（1920×1080, 30fps）
├── audio.mp3              # 提取的音頻
└── metadata.json          # 視頻元數據
```

## 腳本

- `extract_livestream.js` - 提取直播源
- `screen_record_prep.js` - 錄屏預處理
- `format_detection.js` - 格式檢測
