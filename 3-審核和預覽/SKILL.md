---
name: misea-videocut-skills:審核預覽
description: 交互式分鏡頁面、時間線預覽、審核確認
author: Misea1121
source: https://github.com/Misea1121/misea-videocut-skills
---

# 審核和預覽 v1

> 交互式分鏡頁面，確認每個切割點後再輸出

## 快速使用

```
用 misea-videocut-skills:審核預覽，給我看分鏡頁面，我確認後再輸出成片。
```

## 功能

1. **分鏡頁面（Storyboard）**
   - 秒級預覽每個建議的切割點
   - 可視化編輯
   - 即時預覽效果

2. **時間線預覽（Timeline Preview）**
   - 整體節奏感受
   - 音量波形
   - 切割點標記

3. **審核確認**
   - 接受/拒絕建議
   - 手動調整時間點
   - 添加備註

## 工作流

```
輸入：suggestions.html（分鏡建議）
    ↓
1. 啟動審核服務器（localhost:3000）
    ↓
2. 用戶在瀏覽器中審核
    ├─ 查看每個片段
    ├─ 手動調整時間
    └─ 確認或拒絕
    ↓
3. 導出確認結果
    ↓
輸出：confirmed_cuts.json
```

## 腳本

- `generate_storyboard.js` - 生成分鏡頁面
- `timeline_preview.js` - 時間線預覽
- `review_server.js` - 啟動審核服務器
