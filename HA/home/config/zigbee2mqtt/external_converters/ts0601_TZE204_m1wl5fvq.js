//           Штора/тюль
//-------------------------------------------------------------------
const tuya = require('zigbee-herdsman-converters/lib/tuya');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const store = require('zigbee-herdsman-converters/lib/store');
const e = exposes.presets;
const ea = exposes.access;
const legacy = require('zigbee-herdsman-converters/lib/legacy');

function log(meta, msg) {
    if (meta && meta.logger && typeof meta.logger.info === 'function') {
        meta.logger.info(`[COVER][DEBUG] : ${msg}`);
    } else {
        console.log(`[COVER][DEBUG] : ${msg}`);
    }
}

const definition = {
    fingerprint: [
        { modelID: 'TS0601', manufacturerName: '_TZE204_m1wl5fvq' }
    ],
    model: 'TS0601_cover_v28',
    vendor: 'Tuya',
    description: 'Штора/тюль',

    toZigbee: [
        legacy.toZigbee.tuya_cover_control,
        legacy.toZigbee.tuya_cover_options,
    ],
    
    fromZigbee: [
        // LEGACY ОТВЕЧАЕТ ЗА: position, state, internal_running
        legacy.fromZigbee.tuya_cover, 
        
        // МЫ ОТВЕЧАЕМ ЗА: running (sensor), direction, last_direction
        {
            cluster: 'manuSpecificTuya',
            type: ['commandDataReport', 'commandDataResponse'], 
            convert: (model, msg, publish, options, meta) => {
                if (!msg.data || !msg.data.dpValues) return;

                let state = store.getValue(msg.endpoint, 'coverExtra_TS0601_TZE204_m1wl5fvq');
                if (!state) {
                    state = {
                        running: false,
                        direction: 'stopped',
                        last_direction: 'stopped',
                        stopTimer: null
                    };
                }

                let stateChanged = false;

                for (const item of msg.data.dpValues) {
                    const dp = item.dp;
                    const val = Buffer.isBuffer(item.data) ? item.data[0] : item.data;

                    // DP 7: Аппаратный старт двигателя
                    if (dp === 7 && (val === 0 || val === 1)) {
                        state.running = true;
                        state.direction = val === 0 ? 'opening' : 'closing';
                        state.last_direction = state.direction;
                        stateChanged = true;
                        log(meta, `>>> MOTOR START !!! Physical direction: ${state.direction.toUpperCase()}`);
                        
                        if (state.stopTimer) {
                            clearTimeout(state.stopTimer);
                            state.stopTimer = null;
                        }
                    }

                    // DP 3: Watchdog движения (продлеваем таймер)
                    if (dp === 3 && state.running) {
                        if (state.stopTimer) clearTimeout(state.stopTimer);
                        
                        state.stopTimer = setTimeout(() => {
                            let currentState = store.getValue(msg.endpoint, 'coverExtra_TS0601_TZE204_m1wl5fvq') || state;
                            if (currentState.running) {
                                currentState.running = false;
                                currentState.direction = 'stopped';
                                store.putValue(msg.endpoint, 'coverExtra_TS0601_TZE204_m1wl5fvq', currentState);
                                log(meta, '>>> WATCHDOG TIMER !!! Нет обновлений позиции 3 сек.');
                                publish({ 
                                    running: false, 
                                    direction: 'stopped',
                                    last_direction: currentState.last_direction 
                                });
                            }
                        }, 3000);
                    }

                    // DP 1 = 1: Устройство сообщило STOP (подтверждение остановки)
                    if (dp === 1 && val === 1) {
                        if (state.running) {
                            state.running = false;
                            state.direction = 'stopped';
                            stateChanged = true;
                            log(meta, '>>> DEVICE IDLE (DP1=1) !!! FORCE STOP.');
                        }
                        if (state.stopTimer) {
                            clearTimeout(state.stopTimer);
                            state.stopTimer = null;
                        }
                    }
                }

                if (stateChanged) {
                    store.putValue(msg.endpoint, 'coverExtra_TS0601_TZE204_m1wl5fvq', state);
                    log(meta, `PUBLISH SENSOR: running=${state.running}, direction=${state.direction}, last_direction=${state.last_direction}`);
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

    options: [
        exposes.options.invert_cover(),
    ],
    
    exposes: [
        e.cover_position().setAccess('position', ea.STATE_SET),
        e.binary('running', ea.STATE, true, false).withDescription('Физическое движение мотора'),
        e.enum('direction', ea.STATE, ['opening', 'closing', 'stopped']).withDescription('Текущее физическое направление'),
        e.enum('last_direction', ea.STATE, ['opening', 'closing', 'stopped']).withDescription('Последнее направление движения'),
    ],
};

module.exports = definition;
