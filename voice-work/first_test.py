do not work correct


import sounddevice as sd
import queue
import json
import re
import os
import platform
import subprocess
import tempfile
from vosk import Model, KaldiRecognizer
from TTS.api import TTS
from datetime import datetime
import sounddevice as sd

# === Настройки ===
MODEL_DIR = "d:/_GitHub/python_prj/voice-work/models/"
VOSK_MODEL_PATH = f"{MODEL_DIR}/vosk-model-small-ru-0.22"
TTS_MODEL_PATH = f"{MODEL_DIR}/tts_models--multilingual--multi-dataset--xtts_v2"


print("MODEL_DIR       = ", MODEL_DIR)
print("VOSK_MODEL_PATH = ", VOSK_MODEL_PATH)
print("TTS_MODEL_PATH  = ", TTS_MODEL_PATH)
print("config.json     = ", f"{TTS_MODEL_PATH}/config.json")


SAMPLE_RATE = 16000
q = queue.Queue()

# === Загрузка моделей ===
print("🔁 Загрузка TTS...")
tts = TTS(model_path=TTS_MODEL_PATH, config_path=f"{TTS_MODEL_PATH}/config.json")

print("🔁 Загрузка Vosk...")
asr_model = Model(VOSK_MODEL_PATH)
recognizer = KaldiRecognizer(asr_model, SAMPLE_RATE)


# === Воспроизведение WAV ===
def play_audio(file_path):
    system = platform.system()
    if system == "Windows":
        os.startfile(file_path)
    elif system == "Darwin":
        subprocess.call(["afplay", file_path])
    else:
        subprocess.call(["aplay", file_path])

# === Синтез речи и воспроизведение ===
def speak(text):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as fp:
        #tts.tts_to_file(text=text, file_path=fp.name)
         wav = tts.tts(text=text,
                file_path=fp.name,
                speaker="Ana Florence",
                language="ru",
                split_sentences=True
                )

        print(type(wav))  # отладка

        #wav_np = wav.squeeze().cpu().numpy()  # → numpy array for sounddevice
        #sd.play(wav_np, samplerate=24000)
        #sd.wait()  # дождаться окончания воспроизведения


        #play_audio(fp.name)
        #os.unlink(fp.name)

# === Команды управления роботом ===
def handle_command(text):
    print(f"📥 Распознано: {text}")

    if "привет" in text:
        return "Привет, я робот!"
    if "вперёд" in text:
        match = re.search(r"вперёд\s*(\d*)", text)
        duration = match.group(1) if match else "1"
        return f"Двигаюсь вперёд {duration} секунд."
    if "назад" in text:
        match = re.search(r"назад\s*(\d*)", text)
        duration = match.group(1) if match else "1"
        return f"Двигаюсь назад {duration} секунд."
    if "поворот направо" in text:
        return "Поворачиваю направо."
    if "поворот налево" in text:
        return "Поворачиваю налево."
    if "стоп" in text:
        return "Останавливаюсь."
    if "время" in text:
        return f"Сейчас {datetime.now().strftime('%H:%M')}."
    
    return "Команда не распознана."

# === Callback аудиопотока ===
def audio_callback(indata, frames, time, status):
    if status:
        print(status)
    q.put(bytes(indata))

# === Основной цикл распознавания ===
def run_voice_interface():
    print("🎙️ Скажите команду...")
    speak("Скажите команду")
    with sd.RawInputStream(samplerate=SAMPLE_RATE, blocksize=8000, dtype='int16',
                           channels=1, callback=audio_callback):
        while True:
            data = q.get()
            if recognizer.AcceptWaveform(data):
                result = json.loads(recognizer.Result())
                text = result.get("text", "")
                if text:
                    response = handle_command(text)
                    print(f"🤖 Ответ: {response}")
                    speak(response)

# === Запуск ===
if __name__ == "__main__":
    run_voice_interface()