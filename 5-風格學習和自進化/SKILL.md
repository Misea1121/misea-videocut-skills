---
name: misea-videocut-skills:風格學習
description: 分析火紅視頻、學習個人偏好、自動優化剪輯規則
author: Misea1121
source: https://github.com/Misea1121/misea-videocut-skills
---

# 風格學習和自進化 v1

> 分析火紅視頻特徵，自動優化你的剪輯風格

## 快速使用
用 misea-videocut-skills:風格學習，分析這 5 個視頻:

https://www.youtube.com/shorts/d7wkmKCVbw4

https://www.youtube.com/shorts/hMFXVYbxyao

https://www.youtube.com/shorts/TbWf0JohM6A

https://www.youtube.com/shorts/yu2ZyjgHMhw

https://www.youtube.com/shorts/OINmeXGzDb4
然後應用到我的剪輯風格裡。
## 分析維度

### 1. 節奏
- 平均鏡頭長度
- 切換頻率
- 靜止時長

### 2. 文字疊印
- 字體大小
- 顏色和描邊
- 出現位置
- 動畫效果

### 3. 音樂和音效
- BGM 類型
- 音樂轉場時機
- Meme 音效使用
- 音量變化

### 4. 視覺效果
- 轉場類型
- 濾鏡應用
- 縮放和旋轉
- 顏色調整

### 5. 內容結構
- 開頭吸引方式
- 高潮時刻位置
- 結尾方式

## 工作流
下載視頻分析

├─ 下載 5 個視頻

├─ 提取基本信息（長度、節奏、字幕）

└─ 轉錄對話

↓
特徵提取

├─ 分析節奏（平均鏡頭長 2-3 秒）

├─ 檢測文字疊印（大號、黃色描邊）

├─ 提取音樂段落

└─ 識別視覺轉場

↓
特徵保存

→ viral_analysis.json

↓
Claude 分析

└─ 理解「為什麼這個視頻火」

↓
規則生成

├─ 更新鏡頭長度規則

├─ 更新字幕參數

├─ 更新音樂選擇邏輯

└─ 更新視覺效果

↓
應用到用戶風格

└─ 下次剪輯自動應用
## 輸出

```json
{
  "viral_features": {
    "avg_clip_length": 2.5,
    "text_overlay": "large_yellow_outline",
    "music_transition": "beat_sync",
    "cuts_per_minute": 12
  },
  "recommendations": [
    "鏡頭長度改為 2-3 秒",
    "字幕用黃色描邊，位置下方中心",
    "音樂轉場同步於節奏點"
  ]
}
```

## 腳本

- `learn_viral_styles.js` - 分析火紅視頻
- `personalize_rules.js` - 個性化規則
- `feedback_loop.js` - 收集反饋