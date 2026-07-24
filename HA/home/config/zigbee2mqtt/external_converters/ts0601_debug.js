const definition = {
    fingerprint: [{modelID: 'TS0601', manufacturerName: '_TZE204_m1wl5fvq'}],
    model: 'TS0601_cover_custom_debug',
    vendor: 'Tuya',
    description: 'Тестовый дебаг-конвертер шторы санузла',
    
    // Подключаем стандартный Tuya-движок на отправку команд (toZigbee)
    toZigbee: [require('zigbee-herdsman-converters/lib/tuya').tz.datapoints],
    
    fromZigbee: [
        {
            cluster: 'manuSpecificTuya',
            type: ['commandDataReport', 'commandDataResponse'],
            convert: (model, msg, publish, options, meta) => {
                
                // ШЛЕМ ТЕСТОВЫЙ ПРИВЕТ И ПРОВЕРЯЕМ СВЯЗЬ
                publish({
                    hello_status: "HELLO_FROM_CONVERTER",
                    raw_msg_type: msg.type || "unknown_type"
                });

                // Возвращаем пустой объект, чтобы не вызывать ошибку ядра,
                // если встроенные методы datapoints не смогли импортироваться
                return {};
            },
        }
    ],
    
    exposes: [
        {
            type: 'cover',
            features: [
                {type: 'numeric', name: 'position', property: 'position', access: 7, value_min: 0, value_max: 100, unit: '%'}
            ]
        }
    ],
};

module.exports = definition;