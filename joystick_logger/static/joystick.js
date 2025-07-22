let prevState = [];
let prevAxes = [];


const buttonsContainer = document.getElementById("buttons");
const axesDisplay = document.getElementById("axes-values");
const logList = document.getElementById("log-list");

const canvas = document.getElementById("stick-canvas");
const ctx = canvas.getContext("2d");
const canvasSize = 200;
const center = canvasSize / 2;
const stickRadius = 10;
const maxRange = center - stickRadius - 5; // граница по краю
const deadZoneRadius = 0.1 * maxRange;


function drawStick(x, y) {
  ctx.clearRect(0, 0, canvasSize, canvasSize);

  // Серая зона — dead zone
  ctx.beginPath();
  ctx.arc(center, center, deadZoneRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#ccc";
  ctx.fill();

  // Рамка круга
  ctx.beginPath();
  ctx.arc(center, center, maxRange, 0, Math.PI * 2);
  ctx.strokeStyle = "#999";
  ctx.stroke();

  // Позиция стика
  const posX = center + x * maxRange;
  const posY = center + y * maxRange;

  ctx.beginPath();
  ctx.arc(posX, posY, stickRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#4caf50";
  ctx.fill();
}


function createButtons(count) {
  buttonsContainer.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const btn = document.createElement("div");
    btn.className = "button";
    btn.id = "btn-" + i;
    btn.innerText = i;
    buttonsContainer.appendChild(btn);
  }
}

function addLogEntry(message) {
  const item = document.createElement("li");
  item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logList.prepend(item);

  // Обрезаем старые записи если их слишком много
  if (logList.childElementCount > 100) {
    logList.removeChild(logList.lastChild);
  }
}


function sendLog(buttonIndex, state) {
  fetch("/log_button", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ button: buttonIndex, state: state })
  }).catch(err => console.error("Send failed:", err));
}


window.addEventListener("gamepadconnected", () => {
  console.log("Gamepad connected");
  prevState = [];
  requestAnimationFrame(pollGamepad);
});




function applyDeadZone(value, threshold = 0.1) {
  return Math.abs(value) < threshold ? 0 : value;
}

function axesChanged(currentAxes) {
  if (prevAxes.length !== currentAxes.length) return true;
  for (let i = 0; i < currentAxes.length; i++) {
    const a = applyDeadZone(currentAxes[i]);
    const b = applyDeadZone(prevAxes[i]);
    if (Math.abs(a - b) > 0.01) return true;
  }
  return false;
}

function sendAxesLog(axes) {
  const filteredAxes = axes.map(val => applyDeadZone(val));
  fetch("/log_button", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ axes: filteredAxes })
  }).catch(err => console.error("Send failed:", err));
}

function updateAxes(axes) {
  let text = axes.map((val, i) => {
    const fixed = applyDeadZone(val).toFixed(2);
    return `Axis ${i}: ${fixed}`;
  }).join('\t');
  axesDisplay.textContent = text;
}





function pollGamepad() {
  const gamepad = navigator.getGamepads()[0];
  if (gamepad) {
    // кнопки
    if (prevState.length === 0) {
      prevState = Array(gamepad.buttons.length).fill(false);
      createButtons(gamepad.buttons.length);
    }

    gamepad.buttons.forEach((btn, index) => {
      const pressed = btn.pressed;
      const div = document.getElementById("btn-" + index);

      if (pressed !== prevState[index]) {
        prevState[index] = pressed;

        // Обновление DOM
        if (pressed) {
          div.classList.add("pressed");
        } else {
          div.classList.remove("pressed");
        }

        const state = pressed ? "pressed" : "released";
        addLogEntry(`Button ${index} ${state}`);
        sendLog(index, state);
      }

      if (btn.value !== undefined && btn.value > 0) {
        // Можно сюда добавить sendLog(index, "value: " + btn.value.toFixed(2));
      }
    });

    // оси
    updateAxes(gamepad.axes);
    if (axesChanged(gamepad.axes)) {
      prevAxes = [...gamepad.axes];
      sendAxesLog(prevAxes);
      //addLogEntry(prevAxes);

      console.log(prevAxes);

        let text = gamepad.axes.map((val, i) => {
            const fixed = applyDeadZone(val).toFixed(2);
            return `Axis ${i}: ${fixed}`;
        }).join('\t');
        addLogEntry(text);

    }


    const axisX = applyDeadZone(gamepad.axes[0]); // Лево/Право
    const axisY = applyDeadZone(gamepad.axes[1]); // Вверх/Вниз
    drawStick(axisX, axisY);

  }

  requestAnimationFrame(pollGamepad);
}
