const tuya = require('zigbee-herdsman-converters/lib/tuya');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const store = require('zigbee-herdsman-converters/lib/store');
const e = exposes.presets;
const ea = exposes.access;

const deviceTimers = new Map();

function log(meta, msg) {
    if (meta && meta.logger && typeof meta.logger.info === 'function') {
        meta.logger.info(`[BLINDS][DEBUG] (санузел жалюзи): ${msg}`);
    } else {
        console.log(`[BLINDS][DEBUG] (санузел жалюзи): ${msg}`);
    }
}

function getDeviceKey(meta) { return meta.device.ieeeAddr; }

function clearDeviceTimer(deviceKey) {
    if (deviceTimers.has(deviceKey)) {
        clearTimeout(deviceTimers.get(deviceKey));
        deviceTimers.delete(deviceKey);
    }
}

function setDeviceTimer(deviceKey, callback, timeout) {
    clearDeviceTimer(deviceKey);
    deviceTimers.set(deviceKey, setTimeout(callback, timeout));
}

async function sendTuyaCommand(entity, dp, datatype, value, meta) {
    let data;
    if (datatype === 2) data = Buffer.from([(value >> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF]);
    else if (datatype === 4) data = Buffer.from([value]);
    else if (datatype === 1) data = Buffer.from([value ? 1 : 0]);
    else data = Buffer.from([value]);

    try {
        await entity.command('manuSpecificTuya', 'dataRequest', { seq: 0, dpValues: [{ dp, datatype, data }] }, { disableResponse: true, disableDefaultResponse: true });
    } catch (error) {
        if (!error.message.includes('AssertionError') && !error.message.includes('failed')) throw error;
        log(meta, '>>> Z2M Assertion caught & ignored (command sent physically).');
    }
}

const customBlindsConverter = {
    key: ['state', 'position'],
    convertSet: async (entity, key, value, meta) => {
        const deviceKey = getDeviceKey(meta);
        let state = store.getValue(deviceKey, 'blindsExtra') || {
            running: false, direction: 'stopped', last_direction: 'stopped', 
            last_position: null, target_position: null, pendingMove: null, 
            movementStarted: false, stopRequestedUntil: 0
        };

        if (key === 'state') {
            let dpValue;
            if (value === 'OPEN') dpValue = 0;
            else if (value === 'CLOSE') dpValue = 2;
            else if (value === 'STOP') dpValue = 1;
            else return;

            log(meta, `>>> SENDING DIRECT DP1 (datatype 4) = ${dpValue} for state=${value}`);
            await sendTuyaCommand(entity, 1, 4, dpValue, meta);

            if (value === 'STOP') {
                state.stopRequestedUntil = Date.now() + 5000;
                state.running = false;
                state.direction = 'stopped';
                state.pendingMove = null;
                state.target_position = null;
                state.movementStarted = false;
                clearDeviceTimer(deviceKey);
                log(meta, `>>> COMMAND STOP: 5-second telemetry block activated.`);
            } else {
                state.stopRequestedUntil = 0;
                state.pendingMove = value === 'OPEN' ? 'opening' : 'closing';
                state.direction = state.pendingMove;
                state.running = true;
                state.target_position = value === 'OPEN' ? 100 : 0;
                state.movementStarted = false;

                // ИСПРАВЛЕНИЕ 1: Увеличиваем таймаут до 60 секунд для "ленивых" моторов
                setDeviceTimer(deviceKey, () => {
                    let currentState = store.getValue(deviceKey, 'blindsExtra') || state;
                    if (currentState.running && !currentState.movementStarted) {
                        currentState.running = false;
                        currentState.direction = 'stopped';
                        currentState.pendingMove = null;
                        currentState.target_position = null;
                        store.putValue(deviceKey, 'blindsExtra', currentState);
                        log(meta, '>>> STARTUP TIMEOUT (60s): Motor failed to start.');
                        meta.publish({ state: value, running: false, direction: 'stopped', last_direction: currentState.last_direction });
                    }
                }, 60000);
            }

            store.putValue(deviceKey, 'blindsExtra', state);
            // ИСПРАВЛЕНИЕ 4: Явно передаем state в publish, чтобы избежать бага {"0":"C"...}
            meta.publish({ state: value, running: state.running, direction: state.direction, last_direction: state.last_direction });
            return; // ИСПРАВЛЕНИЕ 4: Убрали return { state: value }
        }

        if (key === 'position') {
            const targetHaPos = Number(value);
            const rawPos = 100 - targetHaPos;
            
            state.stopRequestedUntil = 0;
            
            // ИСПРАВЛЕНИЕ 3: Добавляем отладочный лог для проверки last_position
            log(meta, `POSITION DEBUG: last_pos=${state.last_position}, target=${targetHaPos}`);
            
            if (state.last_position !== null) {
                state.pendingMove = targetHaPos > state.last_position ? 'opening' : 'closing';
            } else {
                state.pendingMove = targetHaPos > 0 ? 'opening' : 'closing';
            }
            
            state.direction = state.pendingMove;
            state.running = true;
            state.target_position = targetHaPos;
            state.movementStarted = false;

            store.putValue(deviceKey, 'blindsExtra', state);
            log(meta, `>>> COMMAND POSITION: target=${targetHaPos} (raw=${rawPos}), pending direction=${state.pendingMove}.`);
            meta.publish({ state: 'STOP', running: state.running, direction: state.direction, last_direction: state.last_direction });

            await sendTuyaCommand(entity, 2, 2, rawPos, meta);
            return;
        }
    }
};

const definition = {
    fingerprint: [{ modelID: 'TS0601', manufacturerName: '_TZE200_2odrmqwq' }],
    model: 'TS0601_blinds_v514_production_ready',
    vendor: 'Tuya',
    description: 'Жалюзи (60s Timeout + DP105 Trigger + Fixed MQTT Payload)',

    toZigbee: [customBlindsConverter],
    
    fromZigbee: [
        tuya.fz.datapoints,
        {
            cluster: 'manuSpecificTuya',
            type: ['commandDataReport', 'commandDataResponse', 'commandDataQuery'],
            convert: (model, msg, publish, options, meta) => {
                if (!msg.data || !msg.data.dpValues) return;

                const deviceKey = getDeviceKey(meta);
                let state = store.getValue(deviceKey, 'blindsExtra') || {
                    running: false, direction: 'stopped', last_direction: 'stopped', 
                    last_position: null, target_position: null, pendingMove: null, 
                    movementStarted: false, stopRequestedUntil: 0
                };

                let stateChanged = false;
                const isStopBlocked = Date.now() < state.stopRequestedUntil;

                for (const item of msg.data.dpValues) {
                    const dp = item.dp;
                    const val = item.data && item.data.data ? item.data.data[0] : (Buffer.isBuffer(item.data) ? item.data[0] : item.data);

                    // А. DP 2 или DP 3: Обновление позиции
                    if (dp === 2 || dp === 3) {
                        const currentHaPos = 100 - val;
                        
                        if (isStopBlocked) {
                            log(meta, `>>> IGNORING POSITION UPDATE (${currentHaPos}): Stop block active.`);
                            state.last_position = currentHaPos;
                            continue;
                        }
                        
                        if (state.last_position === null) {
                            state.last_position = currentHaPos;
                        } else if (currentHaPos !== state.last_position) {
                            
                            if (!state.movementStarted) {
                                state.movementStarted = true;
                                state.last_direction = state.direction; 
                                log(meta, '>>> FIRST MOVEMENT DETECTED (via Position)! Switching to Stall Watchdog.');
                            }

                            state.running = true;
                            state.direction = currentHaPos > state.last_position ? 'opening' : 'closing';
                            stateChanged = true;
                            log(meta, `>>> POSITION CHANGE: HA Pos ${state.last_position} -> ${currentHaPos}. Dir: ${state.direction.toUpperCase()}`);
                            
                            if (state.target_position !== null && currentHaPos === state.target_position) {
                                state.running = false;
                                state.direction = 'stopped';
                                state.pendingMove = null;
                                state.target_position = null;
                                state.movementStarted = false;
                                clearDeviceTimer(deviceKey);
                                log(meta, '>>> TARGET REACHED: Stopped at target position.');
                            } else {
                                clearDeviceTimer(deviceKey);
                                setDeviceTimer(deviceKey, () => {
                                    let currentState = store.getValue(deviceKey, 'blindsExtra') || state;
                                    if (currentState.running) {
                                        currentState.running = false;
                                        currentState.direction = 'stopped';
                                        currentState.pendingMove = null;
                                        currentState.target_position = null;
                                        currentState.movementStarted = false;
                                        store.putValue(deviceKey, 'blindsExtra', currentState);
                                        log(meta, '>>> STALL WATCHDOG (15s): No position update. Stopped.');
                                        publish({ running: false, direction: 'stopped' });
                                    }
                                }, 15000);
                            }
                            state.last_position = currentHaPos;
                        }
                    }

                    // Б. DP 5: Аппаратное подтверждение движения или остановки
                    if (dp === 5) {
                        if (val === 1) {
                            if (isStopBlocked) {
                                log(meta, '>>> IGNORING DP5=1: Stop block active.');
                                continue;
                            }
                            if (!state.movementStarted) {
                                state.movementStarted = true;
                                state.last_direction = state.direction;
                                log(meta, '>>> FIRST MOVEMENT DETECTED (via DP5=1)!');
                            }
                            state.running = true;
                            stateChanged = true;
                            log(meta, '>>> DP5=1 CONFIRMATION: Motor physically moving!');
                            
                            clearDeviceTimer(deviceKey);
                            setDeviceTimer(deviceKey, () => {
                                let currentState = store.getValue(deviceKey, 'blindsExtra') || state;
                                if (currentState.running) {
                                    currentState.running = false;
                                    currentState.direction = 'stopped';
                                    currentState.pendingMove = null;
                                    currentState.target_position = null;
                                    currentState.movementStarted = false;
                                    store.putValue(deviceKey, 'blindsExtra', currentState);
                                    log(meta, '>>> STALL WATCHDOG (15s by DP5): Stopped.');
                                    publish({ running: false, direction: 'stopped' });
                                }
                            }, 15000);
                        } else if (val === 0) {
                            if (state.running || isStopBlocked) {
                                state.running = false;
                                state.direction = 'stopped';
                                state.pendingMove = null;
                                state.target_position = null;
                                state.movementStarted = false;
                                state.stopRequestedUntil = 0;
                                stateChanged = true;
                                clearDeviceTimer(deviceKey);
                                log(meta, '>>> DP5=0: Motor stopped (Hardware confirmed). Block cleared.');
                            }
                        }
                    }

                    // В. DP 105: Скорость мотора (НОВЫЙ ТРИГГЕР)
                    if (dp === 105) {
                        const speed = val;
                        if (speed > 0 && state.running && !state.movementStarted && !isStopBlocked) {
                            state.movementStarted = true;
                            state.last_direction = state.direction;
                            log(meta, `>>> FIRST MOVEMENT DETECTED (via DP105 speed=${speed})!`);
                        }
                    }

                    // Г. DP 106: Сигнал ARRIVED
                    if (dp === 106 && val === 1) {
                        if (state.pendingMove || state.running) {
                            state.running = false;
                            state.direction = 'stopped';
                            state.pendingMove = null;
                            state.target_position = null;
                            state.movementStarted = false;
                            state.stopRequestedUntil = 0;
                            stateChanged = true;
                            clearDeviceTimer(deviceKey);
                            log(meta, '>>> DP106 ARRIVED: Motor stopped at target. Block cleared.');
                        } else {
                            log(meta, `>>> DP106=1 IGNORED: pending=${state.pendingMove}, running=${state.running}`);
                        }
                    }

                    // Д. DP 1 = 1: Аппаратный IDLE/STOP (эхо команды)
                    if (dp === 1 && val === 1) {
                        if (state.running || state.pendingMove || isStopBlocked) {
                            state.running = false;
                            state.direction = 'stopped';
                            state.pendingMove = null;
                            state.target_position = null;
                            state.movementStarted = false;
                            state.stopRequestedUntil = 0;
                            stateChanged = true;
                            clearDeviceTimer(deviceKey);
                            log(meta, '>>> HARDWARE STOP (DP1=1 echo). Block cleared.');
                        }
                    }
                }

                // Железобетонная защита от неконсистентного состояния
                if (!state.running && state.direction !== 'stopped') {
                    state.direction = 'stopped';
                    stateChanged = true;
                    log(meta, '>>> CONSISTENCY FIX: Forced direction to stopped because running is false.');
                }

                if (stateChanged) {
                    store.putValue(deviceKey, 'blindsExtra', state);
                    log(meta, `PUBLISH: running=${state.running}, dir=${state.direction}, last_dir=${state.last_direction}`);
                    return {
                        running: state.running,
                        direction: state.direction,
                        last_direction: state.last_direction
                    };
                }
                return;
            }
        }
    ],

    options: [ exposes.options.invert_cover() ],
    
    exposes: [
        e.cover_position().setAccess('position', ea.STATE_SET),
        e.binary('running', ea.STATE, true, false).withDescription('Жалюзи физически движутся'),
        e.enum('direction', ea.STATE, ['opening', 'closing', 'stopped']).withDescription('Текущее направление'),
        e.enum('last_direction', ea.STATE, ['opening', 'closing', 'stopped']).withDescription('Последнее направление'),
    ],

    meta: {
        tuyaDatapoints: [
            [1, 'state', {
                from: (v) => v === 0 ? 'OPEN' : (v === 2 ? 'CLOSE' : 'STOP'),
                to: (v) => v === 'OPEN' ? 0 : (v === 'CLOSE' || v === 'CLOSED' ? 2 : 1)
            }],
            [2, 'position', { from: (v) => 100 - Number(v), to: (v) => 100 - Number(v) }],
            [3, 'position', { from: (v) => 100 - Number(v), to: (v) => 100 - Number(v) }]
        ],
    },
};

module.exports = definition;