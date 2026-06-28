---
name: misea-videocut-skills:智能分析
description: 分析視頻並生成剪輯建議。轉錄、靜音檢測、精彩時刻、場景切換
author: Misea1121
source: https://github.com/Misea1121/misea-videocut-skills
---

# 智能分析和剪輯建議 v1

> 自動分析搞笑時刻、無理頭對話、驚喜反應，生成剪輯建議

## 快速使用

```
用 misea-videocut-skills:智能分析，找出這個 Valorant 直播裡所有搞笑時刻和無理頭對話。
用 misea-videocut-skills:智能分析，分析這個恐怖遊戲片段，找出所有驚嚇反應。
```

## 檢測類型

### 1. 轉錄（Transcription）
- **工具**：OpenAI Whisper（本地運行）
- **支持語言**：中文、台語、英文混合
- **輸出**：subtitles.srt 字幕文件

### 2. 靜音檢測（Silence Detection）
- ≤0.2s：忽略
- 0.2-1s：標記
- \>1s：建議刪除

### 3. 精彩時刻檢測（Highlight Detection）

#### 搞笑時刻（Funny Moments）
- 關鍵詞：「哈哈」、「天啊」、「操」、「笑死」、「怎麼可能」
- 多人笑聲同時出現
- 音量突然增加（尖叫、驚呼）

#### 無理頭對話（Absurd Dialogue）
- 突然的靜默（500ms+）+ 爆笑
- 邏輯跳躍（「等等什麼」）
- 隊友互相打斷

#### 遊戲事件
- **Valorant**：擊殺、死亡、勝負宣告
- **Roblox**：遊戲 UI 變化、玩家反應
- **恐怖遊戲**：尖叫聲、驚嚇 UI

### 4. 場景切換檢測（Scene Change Detection）
- 色彩變化
- 鏡頭變化
- 音頻轉場

## 工作流

```
輸入：source.mp4 + audio.mp3
    ↓
1. 轉錄（Whisper）
    → subtitles_words.json
    ↓
2. 靜音檢測
    → silence_segments.json
    ↓
3. 精彩時刻檢測
    → highlights.json
    ↓
4. 場景切換檢測
    → scene_changes.json
    ↓
5. 風格分析（對比火紅視頻）
    → style_suggestions.json
    ↓
6. 生成分鏡建議
    ↓
輸出：suggestions.html（分鏡頁面）
```

## 輸出格式

```json
{
  "transcription": [...],
  "highlights": [
    {
      "start": 12.5,
      "end": 18.3,
      "type": "funny_moment",
      "confidence": 0.95,
      "keywords": ["哈哈", "天啊"],
      "reason": "多人笑聲 + 關鍵詞匹配"
    }
  ],
  "scene_changes": [...],
  "suggestions": [...]
}
```

## 腳本

- `transcribe_tw.js` - 中文/台語轉錄
- `silence_detector.js` - 靜音檢測
- `highlight_detector.js` - 精彩時刻檢測
- `scene_change.js` - 場景切換檢測
- `style_analyzer.js` - 風格分析
- `auto_cut_suggestion.js` - 生成分鏡建議
