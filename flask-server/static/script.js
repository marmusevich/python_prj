function startStream() {
    fetch('/start', { method: 'POST' });
}

function stopStream() {
    fetch('/stop', { method: 'POST' });
}

function startVoice() {
    if (!('webkitSpeechRecognition' in window)) {
        alert("Ваш браузер не поддерживает распознавание речи");
        return;
    }

    const recognition = new webkitSpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.start();

    recognition.onresult = function(event) {
        const command = event.results[0][0].transcript.toLowerCase();
        console.log("Распознано:", command);

        if (command.includes("старт") || command.includes("начать")) {
            startStream();
        } else if (command.includes("стоп") || command.includes("останови")) {
            stopStream();
        }
    };

    recognition.onerror = function(event) {
        console.error("Ошибка распознавания:", event.error);
    };
}