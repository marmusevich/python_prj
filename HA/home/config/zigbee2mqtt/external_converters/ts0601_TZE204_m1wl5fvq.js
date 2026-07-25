//           Штора/тюль
//-------------------------------------------------------------------
const tuya = require('zigbee-herdsman-converters/lib/tuya');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const store = require('zigbee-herdsman-converters/lib/store');
const e = exposes.presets;
const ea = exposes.access;

// Безопасное логирование
function log(meta, msg) {
    if (meta && meta.logger && typeof meta.logger.info === 'function') {
        meta.logger.info(`[COVER][DEBUG]: ${msg}`); // 3тот никогда не сробатывает
    } else {
        console.log(`[COVER][DEBUG]: ${msg}`);
    }
}

// 1. КАСТОМНЫЙ toZigbee: Прямая отправка команды (возвращает undefined, чтобы не ломать merge)
const customStateConverter = {
    key: ['state'],
    convertSet: async (entity, key, value, meta) => {
        log(meta, `>>> STATE COMMAND RECEIVED: ${value}`);
        
        let dpValue;
        if (value === 'OPEN') dpValue = 0;
        else if (value === 'CLOSE') dpValue = 2;
        else if (value === 'STOP') dpValue = 1;
        else throw new Error(`Unknown state: ${value}`);

        log(meta, `>>> SENDING RAW Tuya dataRequest: DP=1, Value=${dpValue}`);
        
        try {
            await entity.command(
                'manuSpecificTuya',
                'dataRequest',
                {
                    seq: 0,
                    dpValues: [{ dp: 1, datatype: 4, data: Buffer.from([dpValue]) }]
                },
                { disableResponse: true }
            );
            log(meta, `>>> RAW COMMAND SENT SUCCESSFULLY`);
        } catch (error) {
            log(meta, `>>> RAW COMMAND ERROR: ${error.message}`);
        }
        
        // Возвращаем undefined, чтобы Z2M не пытался оптимистично обновить state и не превращал строку в {"0":"O"...}
        return;
    }
};

const definition = {
    fingerprint: [
        { modelID: 'TS0601', manufacturerName: '_TZE204_m1wl5fvq' }
    ],
    model: 'TS0601_cover_v23',
    vendor: 'Tuya',
    description: 'Штора/тюль (Global Store + Pure Sensor Separation)',

    toZigbee: [
        customStateConverter,
        tuya.tz.datapoints 
    ],
    
    fromZigbee: [
        // Штатный парсер пусть сам занимается state и position. Мы его не трогаем.
        tuya.fz.datapoints,
        
        // Наш парсер занимается ТОЛЬКО физическими датчиками движения
        {
            cluster: 'manuSpecificTuya',
            type: ['commandDataReport', 'commandDataResponse', 'commandDataQuery'],
            convert: (model, msg, publish, options, meta) => {
                if (!msg.data || !msg.data.dpValues) return;

                // ИСПРАВЛЕНИЕ 1: Используем globalStore для сохранения состояния между вызовами
                let state = store.getValue(msg.endpoint, 'coverExtra');
                if (!state) {
                    // ИСПРАВЛЕНИЕ 2: Начальное состояние строго 'stopped', без 'unknown'
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

                    // А. DP 7: Аппаратный старт двигателя
                    if (dp === 7 && (val === 0 || val === 1)) {
                        state.running = true;
                        state.direction = val === 0 ? 'opening' : 'closing';
                        state.last_direction = state.direction; // Запоминаем последнее направление
                        stateChanged = true;
                        log(meta, `>>> MOTOR START !!! Physical direction: ${state.direction.toUpperCase()}`);
                        
                        if (state.stopTimer) {
                            clearTimeout(state.stopTimer);
                            state.stopTimer = null;
                        }
                    }

                    // Б. DP 3: Обновление позиции. Продлеваем "watchdog" движения.
                    if (dp === 3 && state.running) {
                        if (state.stopTimer) clearTimeout(state.stopTimer);
                        
                        state.stopTimer = setTimeout(() => {
                            // Получаем актуальное состояние из store внутри таймера
                            let currentState = store.getValue(msg.endpoint, 'coverExtra') || state;
                            if (currentState.running) {
                                currentState.running = false;
                                currentState.direction = 'stopped';
                                store.putValue(msg.endpoint, 'coverExtra', currentState);
                                log(meta, '>>> WATCHDOG TIMER !!! Нет обновлений позиции 3 сек. Мотор остановился.');
                                log(meta, `PUBLISH SENSOR: running=false, direction=stopped, last_direction=${currentState.last_direction}`);
                                publish({ running: false, direction: 'stopped' });
                            }
                        }, 3000);
                    }

                    // В. DP 1 = 1: Устройство сообщает, что перешло в режим IDLE/STOP
                    if (dp === 1 && val === 1) {
                        state.running = false;
                        state.direction = 'stopped';
                        // ИСПРАВЛЕНИЕ 3: Мы НАМЕРЕННО не трогаем state.last_direction здесь!
                        stateChanged = true;
                        log(meta, '>>> DEVICE IDLE (DP1=1) !!! FORCE STOP. Мотор сообщил об остановке.');
                        
                        if (state.stopTimer) {
                            clearTimeout(state.stopTimer);
                            state.stopTimer = null;
                        }
                    }
                }

                // ИСПРАВЛЕНИЕ 4: Сохраняем обновленное состояние в глобальное хранилище
                if (stateChanged) {
                    store.putValue(msg.endpoint, 'coverExtra', state);
                    
                    // ИСПРАВЛЕНИЕ 5: Логируем именно те значения, которые уйдут в датчики
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
        e.binary('running', ea.STATE, true, false).withDescription('Штора физически движется'),
        // ИСПРАВЛЕНИЕ 2: Убрали 'unknown'. HA сам покажет 'unavailable' до первого сообщения.
        e.enum('direction', ea.STATE, ['opening', 'closing', 'stopped']).withDescription('Текущее физическое направление'),
        e.enum('last_direction', ea.STATE, ['opening', 'closing', 'stopped']).withDescription('Последнее направление движения (сохраняется)'),
    ],

    meta: {
        tuyaDatapoints: [
            // Оставляем маппинг для position, state обрабатывается штатно
            [1, 'state', {
                from: (v) => v === 0 ? 'OPEN' : (v === 2 ? 'CLOSE' : 'STOP'),
                to: (v) => v === 'OPEN' ? 0 : (v === 'CLOSE' || v === 'CLOSED' ? 2 : 1)
            }],
            [2, 'position', {
                from: (v) => 100 - Number(v),
                to: (v) => 100 - Number(v)
            }],
            [3, 'position', {
                from: (v) => 100 - Number(v),
                to: (v) => 100 - Number(v)
            }]
        ],
    },
};

module.exports = definition;