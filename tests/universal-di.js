/*
 * Бинарный тест UniversalDI: маска дискретных входов ставится экшеном `set`
 * стенда vrack2-modbus.ModbusRTUSlave, мастерUniversalDI опрашивает её 0x02
 * через vrack2-net.ConverterBus + vrack2-net.ConverterVirtual.
 *
 *   node run/run-test.js devices/vrack2-modbus/tests/universal-di.js
 *
 * Проверяется: побитовое разложение маски (бит 0 -> di1), частичный последний
 * байт (countDI = 12), режим eachGate: false — пуш только при изменении,
 * eachGate: true — пуш каждый цикл опроса (привязка к измеренным запросам
 * стенда, а не к таймеру).
 */

const assert = require('assert');

module.exports.timeout = 60000;

const PORT = 15141;

function structure() {
    return {
        devices: [
            {
                id: 'Virt',
                type: 'vrack2-net.ConverterVirtual',
                options: { host: '127.0.0.1', port: PORT, timeout: 0 },
                connections: ['Virt.buffer -> Slave.buffer'],
            },
            {
                id: 'Slave',
                type: 'vrack2-modbus.ModbusRTUSlave',
                options: { address: 1 },
                connections: ['Slave.buffer -> Virt.buffer'],
            },
            {
                id: 'Bus',
                type: 'vrack2-net.ConverterBus',
                options: { devices: 2, socket: { host: '127.0.0.1', port: PORT }, debug: false },
                connections: [
                    'Bus.dev1 -> UDI.bus',
                    'Bus.dev2 -> UDI2.bus',
                ],
            },
            {
                id: 'UDI',
                type: 'vrack2-modbus.UniversalDI',
                options: { address: 1, "сountDI": 12, eachGate: false },
                connections: [
                    'UDI.di1 -> S.in1',
                    'UDI.di2 -> S.in2',
                    'UDI.di3 -> S.in3',
                    'UDI.di9 -> S.in4',
                ],
            },
            {
                id: 'UDI2',
                type: 'vrack2-modbus.UniversalDI',
                options: { address: 1, "сountDI": 8, eachGate: true },
                connections: ['UDI2.di1 -> S2.in1'],
            },
            { id: 'S', type: 'vrack2-test.Sink', options: { inputs: 4, limit: 100 } },
            { id: 'S2', type: 'vrack2-test.Sink', options: { inputs: 1, limit: 200 } },
        ],
        connections: [],
    };
}

async function waitFor(cond, { wait, what, timeout = 20000 }) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
        if (cond()) return;
        await wait(50);
    }
    throw new Error(`timeout waiting for ${what}`);
}

function seen(container, device, port) {
    return container.getDevice(device).shares.values[port].length;
}

function last(container, device, port) {
    const values = container.getDevice(device).shares.values[port];
    return values.length ? values[values.length - 1] : undefined;
}

async function run(container, { wait }) {
    const slave = container.getDevice('Slave');
    const udi = container.getDevice('UDI');
    const udi2 = container.getDevice('UDI2');

    await waitFor(() => udi.shares.online === true, { wait, what: 'UDI online' });
    await waitFor(() => udi2.shares.online === true, { wait, what: 'UDI2 online' });

    // ---- маска 0b101 на адресах 0 и 2: di1 и di3 поднимаются, di2 молчит
    await container.deviceAction('Slave', 'set', { area: 'discrete', address: 0, value: 1 });
    await container.deviceAction('Slave', 'set', { area: 'discrete', address: 2, value: 1 });

    await waitFor(() => udi.shares.di[0] === 1 && udi.shares.di[2] === 1, { wait, what: 'di1/di3 raised' });
    assert.strictEqual(udi.shares.di[1], 0, 'di2 поднялся без основания');
    assert.strictEqual(last(container, 'S', 'in1'), 1, 'di1 не ушёл в порт');
    assert.strictEqual(last(container, 'S', 'in3'), 1, 'di3 не ушёл в порт');
    assert.strictEqual(seen(container, 'S', 'in2'), 0, 'на di2 пришёл пуш без изменения');

    // ---- eachGate: false — повтор той же маски не даёт новых пушей
    const reqA = slave.shares.requests;
    const c1 = seen(container, 'S', 'in1');
    const c3 = seen(container, 'S', 'in3');
    await waitFor(() => slave.shares.requests >= reqA + 4, { wait, what: 'two more poll cycles' });
    assert.strictEqual(seen(container, 'S', 'in1'), c1, 'eachGate:false: повторный пуш при неизменной маске');
    assert.strictEqual(seen(container, 'S', 'in3'), c3, 'eachGate:false: di3 пульсирует');

    // ---- eachGate: true — UDI2 пушает каждый цикл опроса (привязка к запросам стенда)
    const gA = seen(container, 'S2', 'in1');
    const reqB = slave.shares.requests;
    await waitFor(() => slave.shares.requests >= reqB + 4, { wait, what: 'two more poll cycles for UDI2' });
    assert.ok(seen(container, 'S2', 'in1') > gA, 'eachGate:true: UDI2 не пушит каждый цикл');

    // ---- частичный последний байт: di9 = адрес 8 (бит 0 второго байта ответа)
    await container.deviceAction('Slave', 'set', { area: 'discrete', address: 8, value: 1 });

    await waitFor(() => udi.shares.di[8] === 1, { wait, what: 'di9 raised' });
    assert.strictEqual(last(container, 'S', 'in4'), 1, 'di9 не ушёл в порт');
    assert.strictEqual(udi.shares.di[0], 1, 'di1 сбросился из-за разбора второго байта');

    // ---- снятие маски: di1 и di3 опускаются
    await container.deviceAction('Slave', 'set', { area: 'discrete', address: 0, value: 0 });
    await container.deviceAction('Slave', 'set', { area: 'discrete', address: 2, value: 0 });

    await waitFor(() => udi.shares.di[0] === 0 && udi.shares.di[2] === 0, { wait, what: 'mask cleared' });
    assert.strictEqual(last(container, 'S', 'in1'), 0, 'di1 не опустился в порт');

    // ---- стенд и шина чисты
    for (const id of ['Slave', 'Virt', 'Bus', 'UDI', 'UDI2']) {
        const st = container.getDeviceStatus(id);
        assert.strictEqual(st.errorCount, 0, `${id}: ошибки: ${st.lastError && st.lastError.data}`);
    }
    assert.strictEqual(slave.shares.crcErrors, 0, 'стенд заругался на CRC');
}

module.exports = { structure, run };
