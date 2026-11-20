/*
 * Бинарный тест UniversalDO: желание приходит на входы do1/do8, мастер пишет
 * маску командой 0x0F, стенд vrack2-modbus.ModbusRTUSlave применяет её к банку
 * катушек; фактическое состояние читается обратно (0x01) и уходит на di-выходы.
 * Повторной записи при совпадении состояния и желания нет.
 *
 *   node run/run-test.js devices/vrack2-modbus/tests/universal-do.js
 */

const assert = require('assert');

module.exports.timeout = 60000;

const PORT = 15142;

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
                options: { devices: 1, socket: { host: '127.0.0.1', port: PORT }, debug: false },
                connections: ['Bus.dev1 -> DO.bus'],
            },
            {
                id: 'DO',
                type: 'vrack2-modbus.UniversalDO',
                options: { address: 1, countDO: 8, timeout: 1000, eachGate: false },
                connections: [
                    'DO.di1 -> S.in1',
                    'DO.di8 -> S.in2',
                ],
            },
            { id: 'S', type: 'vrack2-test.Sink', options: { inputs: 2, limit: 100 } },
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

function last(container, port) {
    const values = container.getDevice('S').shares.values[port];
    return values.length ? values[values.length - 1] : undefined;
}

function seen(container, port) {
    return container.getDevice('S').shares.values[port].length;
}

async function run(container, { wait }) {
    const slave = container.getDevice('Slave');
    const dev = container.getDevice('DO');

    await waitFor(() => dev.shares.online === true, { wait, what: 'DO device online' });
    assert.ok(slave.shares.requests >= 1, 'стенд не увидел ни одного опроса');

    // ---- стартовое состояние: катушки 0, desire 0 — записей и пушей нет
    assert.strictEqual(seen(container, 'in1'), 0, 'до первого изменения di1 уже пушил');
    const writesA = slave.shares.writes;
    const reqA = slave.shares.requests;
    await waitFor(() => slave.shares.requests >= reqA + 2, { wait, what: 'two idle poll cycles' });
    assert.strictEqual(slave.shares.writes, writesA, 'каждый цикл летит пустая запись 0x0F');

    // ---- желание do1 = 1: уходит 0x0F, стенд применяет, состояние читается обратно
    dev.ports.input.do1.push(1);

    await waitFor(() => slave.shares.coils['0x0000'] === 1, { wait, what: 'coil 0 written on the slave' });
    await waitFor(() => dev.shares.do[0] === 1, { wait, what: 'coil state read back (di1)' });
    assert.strictEqual(last(container, 'in1'), 1, 'di1 не ушёл в порт с подтверждением');
    assert.strictEqual(dev.shares.write[0] & 1, 1, 'желаемая маска не обновилась');
    assert.strictEqual(dev.shares.bitmask[0] & 1, 1, 'фактическая маска не обновилась после чтения');

    // ---- повтор того же желания: новая запись не летит
    const writesB = slave.shares.writes;
    dev.ports.input.do1.push(1);
    const reqB = slave.shares.requests;
    await waitFor(() => slave.shares.requests >= reqB + 2, { wait, what: 'two poll cycles after repeat push' });
    assert.strictEqual(slave.shares.writes, writesB, 'повтор identical-желания вызвал запись');
    assert.strictEqual(seen(container, 'in1'), 1, 'di1 дёрнулся без изменения состояния');

    // ---- di8 = 1: последний бит маски доходит до последнего адреса
    dev.ports.input.do8.push(1);

    await waitFor(() => slave.shares.coils['0x0007'] === 1, { wait, what: 'coil 7 written' });
    await waitFor(() => dev.shares.do[7] === 1, { wait, what: 'di8 read back' });
    assert.strictEqual(last(container, 'in2'), 1, 'di8 не ушёл в порт');
    assert.strictEqual(dev.shares.bitmask[0], 0b10000001, 'bitmask не равен фактическому состоянию катушек');

    // ---- снятие желания do1 = 0: состояние гаснет на стенде и в порту
    dev.ports.input.do1.push(0);

    await waitFor(() => slave.shares.coils['0x0000'] === 0, { wait, what: 'coil 0 cleared' });
    await waitFor(() => dev.shares.do[0] === 0, { wait, what: 'di1 read back as 0' });
    assert.strictEqual(last(container, 'in1'), 0, 'di1 не опустился в порт');
    assert.strictEqual(dev.shares.do[7], 1, 'di8 сбросился вместе с di1');

    // ---- стенд и шина без ошибок
    for (const id of ['Slave', 'Virt', 'Bus', 'DO']) {
        const st = container.getDeviceStatus(id);
        assert.strictEqual(st.errorCount, 0, `${id}: ошибки: ${st.lastError && st.lastError.data}`);
    }
    assert.strictEqual(slave.shares.crcErrors, 0, 'стенд заругался на CRC');
    assert.ok(slave.shares.requests >= 6, `стенд обслужил мало запросов: ${slave.shares.requests}`);
}

module.exports = { structure, run };
