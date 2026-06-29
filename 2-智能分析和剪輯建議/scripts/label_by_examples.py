#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
label_by_examples.py
用你標記的幾段「確定是誰說的」，找出全篇每行是誰說的

使用方式：
  1. 複製一份逐字稿（例如 transcript_readable.txt）
  2. 把你確定的幾行，在行首加上人名，例如：
       米希婭:[01:14 -> 01:19] (5.0s)  不是喔你明明就很知道小米
       布丁:[00:21 -> 00:25] (4.4s)  這時候跳出來就只是增加
       夜語:[02:12 -> 02:13] (0.8s)  我有講
     （原本沒有標的行保持原樣，腳本會自動判斷）
  3. 執行：
       python label_by_examples.py <影片> <你標好的逐字稿.txt>

輸出：transcript_final.txt（每行都有真實人名標籤）
"""

import sys, re, subprocess, shutil
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

def ensure(pkg, import_as=None):
    name = import_as or pkg.split("[")[0].replace("-", "_")
    try:
        __import__(name)
        return
    except ImportError:
        pass
    print(f"[安裝] {pkg} ...")
    subprocess.run([sys.executable, "-m", "pip", "install", pkg, "-q"],
                   capture_output=True, check=True)

ensure("torch")
ensure("speechbrain")
ensure("soundfile")
ensure("scikit-learn", "sklearn")
ensure("numpy")
ensure("scipy")
ensure("pydub")

import numpy as np
import torch
import soundfile as sf
from sklearn.preprocessing import normalize
from scipy.spatial.distance import cdist
from collections import defaultdict

try:
    from speechbrain.inference.classifiers import EncoderClassifier
except ImportError:
    from speechbrain.pretrained import EncoderClassifier

# ── 參數 ──────────────────────────────────────────────────
if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(1)

VIDEO_PATH     = sys.argv[1]
TRANSCRIPT_TXT = sys.argv[2]

out_dir   = Path(TRANSCRIPT_TXT).parent
tmp_dir   = out_dir / "_tmp_audio"
tmp_dir.mkdir(exist_ok=True)
AUDIO_PATH = tmp_dir / "full_audio.wav"

# ── Step 1：抽音訊 ──────────────────────────────────────────
print("\n[1/5] 從影片抽取音訊...")
if not AUDIO_PATH.exists():
    ret = subprocess.run([
        "ffmpeg", "-y", "-i", VIDEO_PATH,
        "-ac", "1", "-ar", "16000", "-vn", str(AUDIO_PATH)
    ], capture_output=True, text=True)
    if ret.returncode != 0:
        print("FFmpeg 錯誤：", ret.stderr[-300:])
        sys.exit(1)
print(f"   音訊：{AUDIO_PATH}")

# ── Step 2：解析逐字稿 ──────────────────────────────────────
print("\n[2/5] 讀取逐字稿（含你標記的例子）...")

def to_sec(ts: str) -> float:
    parts = ts.strip().split(":")
    if len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])

# 格式 A：你標的行  →  米希婭:[01:14 -> 01:19] ...
# 格式 B：原始行    →  [01:14 -> 01:19] (5.0s)  ...
LABELED_RE = re.compile(r"^([^\[\]:]+):\[(\d+:\d+(?::\d+)?) -> (\d+:\d+(?::\d+)?)\].*?(\S+.*)")
RAW_RE     = re.compile(r"^\[(\d+:\d+(?::\d+)?) → (\d+:\d+(?::\d+)?)\] \([\d.]+s\)\s+-?\s*(.*)")
# 也接受已有 [名字][時間] 的格式（來自 transcript_named.txt）
NAMED_RE   = re.compile(r"^\[([^\]]+)\]\[(\d+:\d+(?::\d+)?) -> (\d+:\d+(?::\d+)?)\].*?(\S+.*)")

segments = []   # {"start", "end", "text", "speaker"(或None)}
examples = defaultdict(list)  # speaker -> [seg_index, ...]

with open(TRANSCRIPT_TXT, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue

        m = LABELED_RE.match(line)
        if m:
            speaker = m.group(1).strip()
            seg = {"start": to_sec(m.group(2)), "end": to_sec(m.group(3)),
                   "text": m.group(4).strip(), "speaker": speaker}
            examples[speaker].append(len(segments))
            segments.append(seg)
            continue

        m = NAMED_RE.match(line)
        if m:
            speaker = m.group(1).strip()
            seg = {"start": to_sec(m.group(2)), "end": to_sec(m.group(3)),
                   "text": m.group(4).strip(), "speaker": speaker}
            examples[speaker].append(len(segments))
            segments.append(seg)
            continue

        m = RAW_RE.match(line)
        if m:
            segments.append({"start": to_sec(m.group(1)), "end": to_sec(m.group(2)),
                              "text": m.group(3).strip(), "speaker": None})
            continue

labeled_count = sum(len(v) for v in examples.values())
print(f"   共 {len(segments)} 段台詞")
print(f"   你標記了 {labeled_count} 段（{len(examples)} 位說話者）：{', '.join(examples.keys())}")

if not examples:
    print("\n錯誤：找不到任何你標記的行！")
    print("請在行首加上「人名:」，例如：")
    print("  米希婭:[01:14 -> 01:19] (5.0s)  不是喔你明明就很知道小米")
    sys.exit(1)

# ── Step 3：載入聲紋模型 ────────────────────────────────────
print("\n[3/5] 載入聲紋模型...")
spk_model = EncoderClassifier.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb",
    savedir=str(tmp_dir / "ecapa_model"),
    run_opts={"device": "cpu"}
)
spk_model.eval()
print("   模型就緒")

# ── Step 4：計算每段聲紋 ────────────────────────────────────
print("\n[4/5] 計算聲紋特徵...")

SR = 16000
raw_wav, file_sr = sf.read(str(AUDIO_PATH), dtype="float32")
if raw_wav.ndim > 1:
    raw_wav = raw_wav.mean(axis=1)
full_wav = torch.tensor(raw_wav)
if file_sr != SR:
    import torchaudio
    full_wav = torchaudio.functional.resample(full_wav.unsqueeze(0), file_sr, SR).squeeze(0)
total_samples = full_wav.shape[0]

def get_embedding(start_sec, end_sec):
    s = int(start_sec * SR)
    e = min(int(end_sec * SR), total_samples)
    chunk = full_wav[s:e].unsqueeze(0)
    if chunk.shape[1] < int(0.4 * SR):
        return None
    with torch.no_grad():
        emb = spk_model.encode_batch(chunk)
    return emb.squeeze().numpy()

# 先計算所有例子段的聲紋，建立每人的「平均聲紋」
print("   建立說話者聲紋基準...")
speaker_profiles = {}
for speaker, indices in examples.items():
    embs = []
    for idx in indices:
        seg = segments[idx]
        emb = get_embedding(seg["start"], seg["end"])
        if emb is not None:
            embs.append(emb)
    if embs:
        profile = normalize(np.array(embs)).mean(axis=0)
        speaker_profiles[speaker] = profile / np.linalg.norm(profile)
        print(f"   {speaker}：{len(embs)} 段例子")
    else:
        print(f"   警告：{speaker} 的例子太短，跳過")

speaker_names  = list(speaker_profiles.keys())
speaker_matrix = np.array([speaker_profiles[s] for s in speaker_names])

# 計算所有未標段的聲紋
print("   比對全篇...")
for i, seg in enumerate(segments):
    if seg["speaker"] is not None:
        continue  # 已有標籤，跳過
    emb = get_embedding(seg["start"], seg["end"])
    if emb is None:
        seg["speaker"] = "?"
        continue
    emb_norm = emb / (np.linalg.norm(emb) + 1e-8)
    dists = cdist([emb_norm], speaker_matrix, metric="cosine")[0]
    seg["speaker"] = speaker_names[int(np.argmin(dists))]

    if (i + 1) % 100 == 0:
        print(f"   已處理 {i+1}/{len(segments)} 段...")

# ── Step 5：輸出 ────────────────────────────────────────────
print("\n[5/5] 寫出最終逐字稿...")

def to_hms(sec: float) -> str:
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

out_lines = []
for seg in segments:
    t   = f"[{to_hms(seg['start'])} -> {to_hms(seg['end'])}]"
    dur = f"({seg['end'] - seg['start']:.1f}s)"
    out_lines.append(f"[{seg['speaker']}]{t} {dur}  {seg['text']}")

out_path = out_dir / "transcript_final.txt"
out_path.write_text("\n".join(out_lines), encoding="utf-8")
print(f"   完成：{out_path}")

# 統計
from collections import Counter
stats = Counter(seg["speaker"] for seg in segments)
print("\n" + "-"*40)
print("說話者統計：")
for name, count in sorted(stats.items(), key=lambda x: -x[1]):
    print(f"  {name}：{count} 段")

shutil.rmtree(tmp_dir, ignore_errors=True)
