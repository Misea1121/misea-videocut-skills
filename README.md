# misea-videocut-skills

> AI 驅動的遊戲實況、VTUBER、短影片剪輯 Skills 包

針對 **Valorant、Roblox、恐怖遊戲** 等，聚焦 **搞笑時刻、無理頭對話** 的精華片段剪輯。

一鍵從直播源 → 智能分析 → 風格學習 → 多格式輸出（YouTube Shorts 豎屏 + 完整版橫屏）。

**成本：完全免費** | **語言：中文、台語、英文混合支持** | **自進化：學習火紅視頻風格**

---

## 🚀 快速安裝

### 一鍵安裝到 Claude Code

```bash
npx misea-videocut-skills install
```

默認安裝到：
```
~/.claude/skills/misea-videocut-skills
~/.codex/skills/misea-videocut-skills
```

只安裝到 Claude Code：
```bash
npx misea-videocut-skills install --target claude
```

指定目錄：
```bash
npx misea-videocut-skills install --dir ~/.claude/skills/misea-videocut-skills
```

---

## 📋 功能清單

| Skill | 功能 | 輸入 | 輸出 |
|-------|------|------|------|
| **1-直播素材準備** | 抽取直播源、錄屏預處理、格式檢測 | 直播檔案、錄屏 MP4 | 標準化素材包 |
| **2-智能分析和剪輯建議** | 轉錄、靜音檢測、精彩時刻檢測、場景切換、風格分析 | 標準化素材 | 分鏡建議 + 修改頁面 |
| **3-審核和預覽** | 交互式分鏡頁面、時間線預覽 | 分鏡建議 | 確認頁面 |
| **4-多格式輸出** | YouTube Shorts（9:16）、完整版（16:9）、自動字幕、音樂匹配 | 已確認片段 | MP4 成片 + SRT 字幕 |
| **5-風格學習和自進化** | 分析火紅視頻、學習個人偏好、自動優化規則 | 視頻 URL / 反饋 | 更新的剪輯規則 |

---

## 🎮 最短使用方式

### 準備素材

```
用 misea-videocut-skills:直播素材準備，把這個 Valorant 直播錄屏處理成標準素材包。
```

### 智能分析

```
用 misea-videocut-skills:智能分析，找出這個視頻裡的所有搞笑時刻和無理頭對話片段。
```

### 審核確認

```
用 misea-videocut-skills:審核預覽，給我看分鏡頁面，我確認後再輸出。
```

### 生成成片

```
用 misea-videocut-skills:多格式輸出，幫我生成 YouTube Shorts 版本（9:16），加上簡潔字幕和配樂。
```

### 學習風格

```
用 misea-videocut-skills:風格學習，分析這些視頻，然後應用到我的剪輯風格裡。
```

---

## 💻 安裝 Whisper（本地轉錄）

### macOS
```bash
brew install openai-whisper
```

### Ubuntu/Debian
```bash
sudo apt-get install -y python3-pip
pip install openai-whisper
```

### Windows
```bash
pip install openai-whisper
```

---

## 🎯 針對你的內容優化

### 遊戲覆蓋
- ✅ **Valorant** - 擊殺、失敗、隊友互動檢測
- ✅ **Roblox** - 遊戲 UI 變化、玩家反應
- ✅ **派對遊戲** - 搞笑時刻、無理頭對話
- ✅ **恐怖遊戲** - 驚嚇反應、尖叫聲

### 檢測邏輯
- ✅ **搞笑時刻** - 關鍵詞：「哈哈」、「天啊」、「操」、「笑死」
- ✅ **無理頭對話** - 語音峰值突跳、突然沉默後的爆笑
- ✅ **朋友互動** - 多人聲音檢測、打斷對話模式

### 風格應用
- 快速切換鏡頭（保持觀眾注意力）
- 簡潔字幕（只顯示關鍵對話）
- 搞笑音效和 Meme 音樂
- 動態文字疊印（強調笑點）

---

## 📄 協議

Apache License 2.0 - 自由學習、使用、修改和分發。

---

**準備好剪你的第一個 SHORT 了嗎？** 🎬
