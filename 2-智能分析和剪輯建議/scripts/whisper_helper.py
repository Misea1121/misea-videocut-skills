import whisper
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

audio_path = sys.argv[1]
model_name = sys.argv[2] if len(sys.argv) > 2 else "medium"

model = whisper.load_model(model_name)
result = model.transcribe(audio_path, language="zh", task="transcribe", verbose=True)

print("__JSON_START__")
print(json.dumps(result, ensure_ascii=False, indent=2))
print("__JSON_END__")
