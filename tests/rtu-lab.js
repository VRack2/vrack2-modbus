/*
 * Бинарный тест лабораторного сервиса devices/vrack2-modbus/service-examples/rtu-lab.json:
 * граф берётся прямо из файла сервиса (require), сверху добавляется слой
 * наблюдения Sink, стенд разгоняется экшенами, мастер пишет желание входы do*.
 *
 *   node run/run-test.js devices/vrack2-modbus/tests/rtu-lab.js
 *
 * Проверяется то, чего не видно в unit-тестах устройств: что боевой JSON
 * собирается целиком — типы, рёбра Bus->UDI/UDO, buffer-петля Virt<->Slave,
 * кириллическая опция сountDI, оба мастера на одной шине одновременно.
 */

const assert = require('assert');

module.exports.timeout = 60000;

const service = require('../service-examples/rtu-lab.json');

function structure() {
    const s = JSON.parse(JSON.stringify(service));

    s.devices.push({ id: 'SINK', type: 'vrack2-test.Sink', options: { inputs: 2, limit: 100 } });
    s.connections = (s.connections || []).concat([
        'UDI.di1 -> SINK.in1',
        'UDO.di8 -> SINK.in2',
    ]);

    return s;
}

async function waitFor(cond, { wait, what, timeout = 20000 }) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
        if (cond()) return;
        await wait(50);
    }
    throw new Error(`timeout waiting for ${what}`);
}

function last(container, port) {
    const values = container.getDevice('SINK').shares.values[port];
    return values.length ? values[values.length - 1] : undefined;
}

async function run(container, { wait }) {
    const slave = container.getDevice('Slave');
    const udi = container.getDevice('UDI');
    const udo = container.getDevice('UDO');

    // оба мастера на одной шине должны встать online — это и есть проверка графа
    await waitFor(() => udi.shares.online === true, { wait, what: 'UDI online from service file' });
    await waitFor(() => udo.shares.online === true, { wait, what: 'UDO online from service file' });
    await waitFor(() => slave.shares.requests >= 4, { wait, what: 'both masters polling (>=4 slave requests)' });

    // стенд => di1; желание do8 => катушка 7, прочитанная обратно в di8
    await container.deviceAction('Slave', 'set', { area: 'discrete', address: 0, value: 1 });
    udo.ports.input.do8.push(1);

    await waitFor(() => udi.shares.di[0] === 1, { wait, what: 'di1 raised via service graph' });
    assert.strictEqual(last(container, 'in1'), 1, 'di1 не дошёл до приёмника');

    await waitFor(() => slave.shares.coils['0x0007'] === 1, { wait, what: 'coil 7 written' });
    await waitFor(() => udo.shares.do[7] === 1, { wait, what: 'di8 read back' });
    assert.strictEqual(last(container, 'in2'), 1, 'di8 не дошёл до приёмника');

    for (const id of ['Bus', 'Virt', 'Slave', 'UDI', 'UDO']) {
        const st = container.getDeviceStatus(id);
        assert.strictEqual(st.errorCount, 0, `${id}: ошибки: ${st.lastError && st.lastError.data}`);
    }
    assert.strictEqual(slave.shares.crcErrors, 0, 'стенд заругался на CRC');
}

module.exports = { structure, run };
