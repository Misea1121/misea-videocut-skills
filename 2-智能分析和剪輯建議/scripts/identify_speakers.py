#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
identify_speakers.py
用深度學習聲紋模型（ECAPA-TDNN）找出逐字稿每段是誰在講話

用法：
  python identify_speakers.py <影片路徑> <逐字稿.txt> [說話者數量]

範例：
  python identify_speakers.py "D:\\Vid\\source.mp4" "D:\\Vid\\transcript_readable.txt" 6

輸出：
  transcript_speakers.txt  -- 每行前加上 [說話者X] 標籤
  samples\\                 -- 每個說話者群組的示範音訊
"""

import sys, os, re, subprocess, shutil
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

# ── 自動安裝缺少的套件 ──────────────────────────────────────
def ensure(pkg, import_as=None):
    name = import_as or pkg.split("[")[0].replace("-", "_")
    try:
        __import__(name)
        return
    except ImportError:
        pass
    print(f"[安裝] {pkg} ...")
    ret = subprocess.run(
        [sys.executable, "-m", "pip", "install", pkg, "-q"],
        capture_output=True, text=True, encoding="utf-8"
    )
    if ret.returncode != 0:
        print(f"  錯誤：{ret.stderr[-400:]}")
        sys.exit(1)
    print(f"[完成] {pkg}")

ensure("torch",        import_as="torch")
ensure("torchaudio",   import_as="torchaudio")
ensure("speechbrain",  import_as="speechbrain")
ensure("pydub")
ensure("scikit-learn", import_as="sklearn")
ensure("numpy")
ensure("scipy")

import numpy as np
import torch
import torchaudio
from pydub import AudioSegment
from sklearn.cluster import AgglomerativeClustering
from sklearn.preprocessing import normalize
from scipy.spatial.distance import cdist
from collections import Counter

# ── 參數 ────────────────────────────────────────────────────
if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(1)

VIDEO_PATH     = sys.argv[1]
TRANSCRIPT_TXT = sys.argv[2]
N_SPEAKERS     = int(sys.argv[3]) if len(sys.argv) > 3 else 6

out_dir    = Path(TRANSCRIPT_TXT).parent
tmp_dir    = out_dir / "_tmp_audio"
sample_dir = out_dir / "samples"
tmp_dir.mkdir(exist_ok=True)
sample_dir.mkdir(exist_ok=True)

AUDIO_PATH = tmp_dir / "full_audio.wav"

# ── Step 1：抽音訊 ───────────────────────────────────────────
print("\n[1/5] 從影片抽取音訊...")
if not AUDIO_PATH.exists():
    ret = subprocess.run([
        "ffmpeg", "-y", "-i", VIDEO_PATH,
        "-ac", "1", "-ar", "16000", "-vn",
        str(AUDIO_PATH)
    ], capture_output=True, text=True)
    if ret.returncode != 0:
        print("FFmpeg 錯誤：", ret.stderr[-500:])
        sys.exit(1)
print(f"   音訊：{AUDIO_PATH}")

# ── Step 2：解析逐字稿 ──────────────────────────────────────
print("\n[2/5] 讀取逐字稿...")

def to_sec(ts: str) -> float:
    parts = ts.strip().split(":")
    if len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])

TIME_RE = re.compile(
    r"\[(\d+:\d+(?::\d+)?) → (\d+:\d+(?::\d+)?)\] \([\d.]+s\)\s+-?\s*(.*)"
)

segments = []
with open(TRANSCRIPT_TXT, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        m = TIME_RE.match(line)
        if m:
            segments.append({
                "start": to_sec(m.group(1)),
                "end":   to_sec(m.group(2)),
                "text":  m.group(3).strip()
            })

print(f"   共 {len(segments)} 段台詞")

# ── Step 3：合併相鄰短段成「一句話」──────────────────────────
# 短段聲紋特徵不穩定，合併後品質更好
MERGE_GAP = 0.8   # 間隔 < 0.8 秒就合到同一句
MIN_DUR   = 1.2   # 未達 1.2 秒就繼續向後合

utterances  = []
cur_indices = [0]
cur_start   = segments[0]["start"]
cur_end     = segments[0]["end"]

for i in range(1, len(segments)):
    seg = segments[i]
    gap = seg["start"] - cur_end
    dur = cur_end - cur_start
    if gap <= MERGE_GAP or dur < MIN_DUR:
        cur_indices.append(i)
        cur_end = seg["end"]
    else:
        utterances.append({"start": cur_start, "end": cur_end, "indices": cur_indices})
        cur_indices = [i]
        cur_start   = seg["start"]
        cur_end     = seg["end"]

utterances.append({"start": cur_start, "end": cur_end, "indices": cur_indices})
print(f"   合併後共 {len(utterances)} 段語句")

# ── Step 4：載入聲紋模型 ────────────────────────────────────
print("\n[3/5] 載入聲紋模型（ECAPA-TDNN，首次需下載 ~200MB）...")

try:
    from speechbrain.inference.classifiers import EncoderClassifier   # v1.x
except ImportError:
    from speechbrain.pretrained import EncoderClassifier              # v0.5.x

spk_model = EncoderClassifier.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb",
    savedir=str(tmp_dir / "ecapa_model"),
    run_opts={"device": "cpu"}
)
spk_model.eval()
print("   模型載入完成")

# ── Step 5：計算每段聲紋向量 ────────────────────────────────
print("\n   計算每段聲紋特徵...")

import soundfile as sf

SR = 16000
raw_wav, file_sr = sf.read(str(AUDIO_PATH), dtype="float32")
if raw_wav.ndim > 1:
    raw_wav = raw_wav.mean(axis=1)  # 轉單聲道
if file_sr != SR:
    import librosa
    raw_wav = librosa.resample(raw_wav, orig_sr=file_sr, target_sr=SR)
full_wav = torch.tensor(raw_wav)
total_samples = full_wav.shape[0]

embeddings = []
valid_utt   = []

for i, utt in enumerate(utterances):
    s = int(utt["start"] * SR)
    e = min(int(utt["end"] * SR), total_samples)
    chunk = full_wav[s:e].unsqueeze(0)  # [1, T]

    if chunk.shape[1] < int(0.5 * SR):
        embeddings.append(np.zeros(192))
    else:
        with torch.no_grad():
            emb = spk_model.encode_batch(chunk)  # [1, 1, 192]
        embeddings.append(emb.squeeze().numpy())

    valid_utt.append(utt)

    if (i + 1) % 20 == 0:
        print(f"   已處理 {i+1}/{len(utterances)} 段...")

embeddings = normalize(np.array(embeddings))
print(f"   聲紋計算完成，向量維度：{embeddings.shape}")

# ── Step 6：分群 ────────────────────────────────────────────
print(f"\n[4/5] 把聲音分成 {N_SPEAKERS} 個說話者群組...")

clustering = AgglomerativeClustering(
    n_clusters=N_SPEAKERS,
    metric="cosine",
    linkage="average"
)
labels = clustering.fit_predict(embeddings)

label_names = [chr(65 + i) for i in range(N_SPEAKERS)]  # A-F

seg_labels = ["?"] * len(segments)
for utt_i, utt in enumerate(valid_utt):
    lbl = label_names[labels[utt_i]]
    for seg_i in utt["indices"]:
        seg_labels[seg_i] = lbl

# ── Step 7：輸出標籤逐字稿 ──────────────────────────────────
print("\n[5/5] 寫出結果...")

def to_hms(sec: float) -> str:
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

out_lines = []
for i, seg in enumerate(segments):
    lbl = seg_labels[i]
    t   = f"[{to_hms(seg['start'])} -> {to_hms(seg['end'])}]"
    dur = f"({seg['end'] - seg['start']:.1f}s)"
    out_lines.append(f"[說話者{lbl}]{t} {dur}  {seg['text']}")

out_path = out_dir / "transcript_speakers.txt"
out_path.write_text("\n".join(out_lines), encoding="utf-8")
print(f"   逐字稿：{out_path}")

# ── Step 8：每個說話者存 3 段最典型的示範音訊 ──────────────
print("   存示範音訊...")

full_audio_seg = AudioSegment.from_wav(str(AUDIO_PATH))

for lbl_i in range(N_SPEAKERS):
    lbl_name = label_names[lbl_i]
    mask = (labels == lbl_i)
    if not mask.any():
        continue

    group_embs = embeddings[mask]
    centroid   = group_embs.mean(axis=0, keepdims=True)
    dists      = cdist(group_embs, centroid, metric="cosine").ravel()
    sorted_idx = np.argsort(dists)

    group_utts = [valid_utt[j] for j, flag in enumerate(mask) if flag]
    picked = 0
    for rank in sorted_idx:
        if picked >= 3:
            break
        utt = group_utts[rank]
        if utt["end"] - utt["start"] < 1.0:
            continue
        clip = full_audio_seg[int(utt["start"]*1000):int(utt["end"]*1000)]
        out_f = sample_dir / f"說話者{lbl_name}_示範{picked+1}.wav"
        clip.export(str(out_f), format="wav")
        picked += 1

print(f"   示範音訊：{sample_dir}")

# ── 統計 ────────────────────────────────────────────────────
stats = Counter(seg_labels)
print("\n" + "-"*40)
print("說話者統計（段數）：")
for lbl in sorted(stats):
    print(f"  說話者{lbl}：{stats[lbl]} 段")

print()
print("=== 接下來請你做 ===")
print(f"1. 打開資料夾：{sample_dir}")
print("2. 聽每個說話者的示範音訊（說話者A_示範1.wav、說話者B_示範1.wav...）")
print("3. 告訴 Claude：「說話者A是米希婭，說話者B是夜語...」")
print("4. Claude 會幫你換成真實名字，並輸出最終逐字稿")

shutil.rmtree(tmp_dir, ignore_errors=True)
