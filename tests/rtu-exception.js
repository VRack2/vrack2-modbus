/*
 * Бинарный тест цепочки Modbus-исключение -> offline:
 * WAVESHARE8D (вендор vrack2-modbus-rtu) читает дискреты функцией 0x02, а стенд
 * vrack2-modbus.ModbusRTUSlave с exceptionFuncs=[2] отвечает на неё исключением
 * 0x01 (illegal function).
 *
 *   node run/run-test.js devices/vrack2-modbus/tests/rtu-exception.js
 *
 * Проверяется контракт вендора: ModbusRTU.isCompletePacket принимает 5-байтный
 * кадр исключения, ModbusRTU.parseResponse бросает формализованную
 * V2MODBUS_EXCEPTION (а не возвращает exceptionCode в объекте ответа),
 * DeviceRTU оборачивает её в V2MODBUS_UPDATE_ERROR, устройство уходит в offline
 * с внятным следом вместо мусорного RangeError или немой серии ретраев.
 */

const assert = require('assert');

module.exports.timeout = 60000;

const PORT = 15144;

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
                options: { address: 1, exceptionFuncs: [0x02] },
                connections: ['Slave.buffer -> Virt.buffer'],
            },
            {
                id: 'Bus',
                type: 'vrack2-net.ConverterBus',
                options: { devices: 1, socket: { host: '127.0.0.1', port: PORT }, debug: false },
                connections: ['Bus.dev1 -> WAVE.bus'],
            },
            {
                id: 'WAVE',
                type: 'vrack2-modbus-rtu.WAVESHARE8D',
                options: { address: 1, timeout: 500 },
            },
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

async function run(container, { wait }) {
    const slave = container.getDevice('Slave');

    // стенд отвечает illegal function на неподдерживаемую 0x02 — запросы доходят
    await waitFor(() => slave.shares.requests >= 1, { wait, what: 'first request reaches the slave' });

    // мастер обязан зафиксировать ошибку цикла, а не тихо ретраить до таймаута
    await waitFor(() => container.getDeviceStatus('WAVE').errorCount >= 1, { wait, what: 'WAVE errorCount >= 1' });

    const st = container.getDeviceStatus('WAVE');
    assert.strictEqual(st.lastError.trace.vShort, 'V2MODBUS_UPDATE_ERROR',
        `ожидался код V2MODBUS_UPDATE_ERROR, получено ${st.lastError.trace.vShort}`);
    const nested = JSON.stringify(st.lastError);
    assert.ok(nested.includes('V2MODBUS_EXCEPTION'),
        `вложенная V2MODBUS_EXCEPTION не найдена в lastError: ${nested}`);
    assert.ok(nested.includes('"exceptionCode":1'),
        `в вложенной ошибке нет exceptionCode=1 (illegal function): ${nested}`);
    assert.strictEqual(container.getDevice('WAVE').shares.online, false, 'устройство online при бое исключений');

    // ответы стенда корректны по CRC и не приводят к сетевым ретраям-таймаутам:
    // если бы кадр исключения не распознавался, первой ошибкой был бы ALL_REQ_FAILED
    assert.ok(!nested.includes('V2NET_ALL_REQ_FAILED'),
        'кадр исключения не распознан — мастер крутил ретраи до таймаута');
    assert.strictEqual(slave.shares.crcErrors, 0, 'стенд заругался на CRC');

    // шина зеркалит ошибку упавшего устройства на своём порту — штатное поведение,
    // но зеркалиться должна именно ошибка WAVE, а не что-то своё
    const busSt = container.getDeviceStatus('Bus');
    assert.ok(busSt.errorCount >= 1, 'шина не зарегистрировала ошибку порта dev1');
    assert.ok(JSON.stringify(busSt.lastError).includes('WAVE'),
        `шина жалуется не на WAVE: ${JSON.stringify(busSt.lastError)}`);

    const virtSt = container.getDeviceStatus('Virt');
    assert.strictEqual(virtSt.errorCount, 0, `Virt: ошибки: ${virtSt.lastError && virtSt.lastError.data}`);
}

module.exports = { structure, run };
