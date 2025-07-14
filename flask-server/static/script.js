function startStream() {
    fetch('/start', { method: 'POST' });
}

function stopStream() {
    fetch('/stop', { method: 'POST' });
}

