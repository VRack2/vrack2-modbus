/*
 * Бинарный проверочный тест вендора vrack2-modbus: весь набор устройств из
 * list.json собирается в сервис и стартует без ошибок инициализации.
 *
 *   node run/run-test.js devices/vrack2-modbus/tests/load.js
 *
 * Проверяется то, что ломается при правке list.json, путей устройств и
 * объявления портов: разрешение типа, правила опций по умолчанию, материализация
 * динамических портов do%d/di%d. Шина не подключается — устройства стоят без
 * входных рёбер и ничего не опрашивают.
 */

const assert = require('assert');

const DEVICES = [
    ['UDI', 'vrack2-modbus.UniversalDI'],
    ['UDO', 'vrack2-modbus.UniversalDO'],
    ['SLAVE', 'vrack2-modbus.ModbusRTUSlave'],
    ['EX1', 'vrack2-modbus.Example1'],
];

// стенд-ведомой подключается портами buffer, а не входом bus
const BUFFERS = ['SLAVE'];

// интерфейс устройств вендора по умолчанию (countDI/countDO = 8)
const INTERFACE = {
    UDI: { outputs: ['di1', 'di8'], inputs: ['bus'] },
    UDO: { outputs: ['di1', 'di8'], inputs: ['bus', 'do1', 'do8'] },
    SLAVE: { outputs: ['buffer'], inputs: ['buffer'] },
    EX1: { outputs: [], inputs: ['bus'] },
};

const SHARES = {
    UDI: ['online', 'di'],
    UDO: ['online', 'do', 'bitmask', 'write'],
    SLAVE: ['requests', 'writes', 'crcErrors', 'coils', 'discrete', 'holding'],
    EX1: ['online', 'settings'],
};

function structure() {
    return {
        devices: DEVICES.map(([id, type]) => ({ id, type })),
        connections: [],
    };
}

async function run(container) {
    for (const [id, type] of DEVICES) {
        const dev = container.getDevice(id);
        assert.ok(dev, `${type}: устройство ${id} не создано`);
        assert.strictEqual(dev.type, type, `${id}: тип не разрешился: ${dev.type}`);

        const status = container.getDeviceStatus(id);
        assert.ok(status, `${id}: нет статуса устройства`);
        assert.strictEqual(status.state, 'started', `${id}: старт не завершён: ${status.state}`);
        assert.strictEqual(status.errorCount, 0, `${id}: ошибки старта: ${status.lastError && status.lastError.data}`);

        if (BUFFERS.includes(id)) {
            assert.ok('buffer' in dev.ports.input, `${id}: нет входа buffer — стенд не подключается к ConverterVirtual`);
        } else {
            assert.ok('bus' in dev.ports.input, `${id}: нет входа bus — шина не сможет передать провайдера`);
        }

        const iface = INTERFACE[id];
        for (const port of iface.outputs) assert.ok(Object.keys(dev.ports.output).includes(port), `${id}: нет выходного порта ${port}`);
        for (const port of iface.inputs) assert.ok(port in dev.ports.input, `${id}: нет входного порта ${port}`);

        for (const key of SHARES[id]) {
            assert.ok(key in dev.shares, `${id}: в shares нет блока ${key}: ${Object.keys(dev.shares).join(', ')}`);
        }

        // динамические порты материализуются только в объявленном количестве
        if (id === 'UDI') assert.ok(!('di9' in dev.ports.output), 'UDI: di1..di8, а di9 существует');
        if (id === 'UDO') assert.ok(!('do9' in dev.ports.input), 'UDO: do1..do8, а do9 существует');
    }

    // действия стенда доступны
    const slave = container.getDevice('SLAVE');
    const actions = Object.keys(slave.actions());
    assert.ok(actions.includes('set') && actions.includes('read'), `у стенда нет действий set/read: ${actions.join(', ')}`);

    const res = await container.deviceAction('SLAVE', 'set', { area: 'coils', address: 3, value: 1 });
    assert.strictEqual(res.result, 'success', 'экшен set не отработал');
    const read = await container.deviceAction('SLAVE', 'read', { area: 'coils', from: 2, count: 4 });
    assert.deepStrictEqual(read.values.map((v) => v.value), [0, 1, 0, 0], `coil банк после set неверный: ${JSON.stringify(read.values)}`);
    assert.strictEqual(slave.shares.crcErrors, 0, 'crcErrors должен остаться нулевым');
}

module.exports = { structure, run };
