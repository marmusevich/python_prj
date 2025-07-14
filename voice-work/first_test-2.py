import os
import tempfile
import platform
import subprocess

import queue
import json

from vosk import Model as STTModel, KaldiRecognizer
from vosk_tts import Model as TTSModel, Synth
import torchaudio
import sounddevice as sd
from datetime import datetime
import re
from num2words import num2words
import random

# === Настройки ===
MODEL_DIR = "d:/_GitHub/python_prj/voice-work/models/"
VOSK_MODEL_PATH = f"{MODEL_DIR}/vosk-model-small-ru-0.22"
TTS_MODEL_PATH = f"{MODEL_DIR}/vosk-model-tts-ru-0.9-multi"


print("MODEL_DIR       = ", MODEL_DIR)
print("VOSK_MODEL_PATH = ", VOSK_MODEL_PATH)
print("TTS_MODEL_PATH  = ", TTS_MODEL_PATH)



SAMPLE_RATE = 16000
AUDIO_DEVICE = None
q = queue.Queue()

# === Инициализация моделей ===
print("Загрузка Vosk модели...")
asr_model = STTModel(VOSK_MODEL_PATH)
recognizer = KaldiRecognizer(asr_model, SAMPLE_RATE)

print("Загрузка TTS модели...")
model = TTSModel(model_path=TTS_MODEL_PATH, lang="ru")
synth = Synth(model)

stream = None  # глобальный поток

# === Озвучка через vosk-tts ===
def speak(text):
    global stream
    if stream:
        stream.stop()  # ⏸️ отключаем микрофон

    print("🗣️ Озвучка:", text)
    wav = synth.synth_audio(text, speaker_id=0)
    wav_np = wav.squeeze()
    sd.play(wav_np, samplerate=24000)
    sd.wait()  # дождаться окончания воспроизведения

    if stream:
        stream.start()  # ▶️ включаем микрофон


# === Обработка команд ===
def handle_command(text):
    text = text.lower()

    if any(word in text for word in ["тупой", "тупая", "пипец"]):
        phrases = [
            "Сам такой!", 
            "Парниша не грубите", 
            "Да пошол ты!" ]
        return random.choice(phrases)

    if any(word in text for word in ["скажи", "расскажи", "говори"]):
        phrases = [
            "Хорошее время для путешествий.",
            "Дай сигоретку!",
            "Наливай.",
        ]
        return random.choice(phrases)

    # === Скажи текст (с произвольной фразой после) ===
    match = re.search(r"(произнеси|озвучь)\s+(текст|фразу)\s+(.+)", text)
    if match:
        spoken_text = match.group(3).strip()
        return spoken_text

    if any(word in text for word in ["привет", "здравствуй", "добрый день"]):
        return "Привет, я тебя слушаю!"

    if any(word in text for word in ["вперёд", "поехали", "двигайся", "движение"]):
        #m = re.search(r"(вперёд|поехали|двигайся|движение)\s*(\d*)", text)
        #sec = m.group(2) if m and m.group(2) else "1"
        #sec_ = num2words(sec, lang="ru")
        #return f"Двигаюсь вперёд {sec_} секунд."
        return f"Двигаюсь вперёд."

    if any(word in text for word in ["назад", "отъедь", "обратно"]):
        #m = re.search(r"(назад|отъедь|обратно)\s*(\d*)", text)
        #sec = m.group(2) if m and m.group(2) else "1"
        #sec_ = num2words(sec, lang="ru")
        #return f"Двигаюсь назад {sec_} секунд."
        return f"Двигаюсь назад"

    if any(word in text for word in ["налево", "влево", "лево"]):
        return "Поворачиваю налево."

    if any(word in text for word in ["направо", "вправо", "право"]):
        return "Поворачиваю направо."

    if any(word in text for word in ["стоп", "остановись", "хватит", "прекрати", "стой"]):
        return "Останавливаюсь."

    if "время" in text:
        return f"Сейчас {datetime.now().strftime('%H:%M')}."

    return "Команда не распознана."



# === Аудио поток ===
def callback(indata, frames, time, status):
    if status:
        print(status)
    q.put(bytes(indata))

# === Основной цикл ===
def run():
    global stream

    print("🎤 Скажите команду...")
    # Инициализируем поток, но не в with — нужно вручную управлять
    stream = sd.RawInputStream(samplerate=16000, blocksize=8000, dtype='int16',
                               channels=1, callback=callback)
    stream.start()
    while True:
        data = q.get()
        if recognizer.AcceptWaveform(data):
            result = json.loads(recognizer.Result())
            text = result.get("text", "")
            if text:
                print("Вы сказали:", text)
                reply = handle_command(text)
                speak(reply)

# === Запуск ===
if __name__ == "__main__":
    run()