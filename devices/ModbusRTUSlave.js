"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vrack2_core_1 = require("vrack2-core");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ModbusRTU_1 = require("./classes/ModbusRTU");
vrack2_core_1.ErrorManager.register('ModbusRTUSlave', 'V2MODBUS_SLAVE_BAD_FRAME', 'Modbus RTU slave received a frame that failed the CRC check', {
    id: vrack2_core_1.Rule.string().description('Device id'),
    bytes: vrack2_core_1.Rule.number().description('Bytes dropped'),
});
/**
 * Виртуальное ведомое Modbus RTU устройство — банк катушек (coils), дискретных
 * входов (discrete inputs) и holding-регистров поверх портов `buffer`.
 *
 * Это стенд для тестов и живых лабораторных сервисов: к нему подключаются через
 * `vrack2-net.ConverterVirtual`, а мастера (`DeviceRTU`-устройства) ходят к нему
 * по шине `vrack2-net.ConverterBus` — то же самое что железо, только значения
 * банка задаются экшенами и проверки получаются детерминированными.
 *
 * Поддержаны функции 0x01/0x02 (чтение битов), 0x05/0x0F (запись битов),
 * 0x03/0x04 (чтение регистров), 0x06/0x10 (запись регистров). Неизвестные адреса
 * отдают нули, неизвестная функция — исключение 0x01.
 */
class ModbusRTUSlave extends vrack2_core_1.Device {
    constructor() {
        super(...arguments);
        this.banks = {
            coils: new Map(), discrete: new Map(), holding: new Map(),
        };
        this._buffer = Buffer.alloc(0);
        this._partialTimer = 0;
    }
    description() {
        return fs_1.default.readFileSync(path_1.default.join(path_1.default.dirname(__dirname), 'docs', 'ModbusRTUSlave.md')).toString('utf-8');
    }
    checkOptions() {
        return {
            address: vrack2_core_1.Rule.number().integer().default(1).min(0).max(254).description('Modbus-адрес этого ведомого').example(1),
            debug: vrack2_core_1.Rule.boolean().default(false).description('Логировать принятые и отправленные кадры'),
        };
    }
    inputs() {
        return {
            buffer: vrack2_core_1.Port.standard().description('Входящие байты Modbus RTU (от vrack2-net.ConverterVirtual)'),
        };
    }
    outputs() {
        return {
            buffer: vrack2_core_1.Port.standard().description('Ответы ведомого (в vrack2-net.ConverterVirtual)'),
        };
    }
    metrics() {
        return {
            'modbus.rtu.requests': vrack2_core_1.Metric.one().descriptions('Всего обработано запросов'),
            'modbus.rtu.writes': vrack2_core_1.Metric.one().descriptions('Всего записей в банк по шине'),
            'modbus.rtu.crcErrors': vrack2_core_1.Metric.one().descriptions('Кадры с неверным CRC'),
        };
    }
    actions() {
        return {
            set: vrack2_core_1.Action.global().requirements({
                area: vrack2_core_1.Rule.string().default('holding').description('Область: coils | discrete | holding'),
                address: vrack2_core_1.Rule.number().integer().required().min(0).max(65535).description('Адрес бита или регистра'),
                value: vrack2_core_1.Rule.number().integer().required().min(0).max(65535).description('Новое значение (0/1 для битов)'),
            }).description('Записать значение в банк вручную'),
            read: vrack2_core_1.Action.global().requirements({
                area: vrack2_core_1.Rule.string().default('holding').description('Область: coils | discrete | holding'),
                from: vrack2_core_1.Rule.number().integer().required().min(0).max(65535).description('Первый адрес'),
                count: vrack2_core_1.Rule.number().integer().default(1).min(1).max(125).description('Сколько элементов'),
            }).description('Прочитать значения банка'),
        };
    }
    onRegister() {
        this.shares = {
            requests: 0,
            writes: 0,
            crcErrors: 0,
            coils: {},
            discrete: {},
            holding: {},
        };
    }
    onStop() {
        if (this._partialTimer)
            clearTimeout(this._partialTimer);
        this._partialTimer = 0;
        this._buffer = Buffer.alloc(0);
    }
    inputBuffer(data) {
        this._buffer = Buffer.concat([this._buffer, Buffer.isBuffer(data) ? data : Buffer.from(data)]);
        this.resetPartialTimer();
        while (this._buffer.length >= 5) {
            const frame = this.takeFrame();
            if (!frame)
                return;
            this.handleFrame(frame);
        }
    }
    /**
     * Вырезает из буфера один полный кадр по коду функции. false — кадр ещё не долился.
     */
    takeFrame() {
        const func = this._buffer.readUInt8(1);
        let expected = 8;
        if (func === 0x0F || func === 0x10) {
            if (this._buffer.length < 7)
                return false;
            expected = 9 + this._buffer.readUInt8(6);
        }
        if (this._buffer.length < expected)
            return false;
        const frame = this._buffer.subarray(0, expected);
        this._buffer = this._buffer.subarray(expected);
        return frame;
    }
    resetPartialTimer() {
        if (this._partialTimer)
            clearTimeout(this._partialTimer);
        this._partialTimer = setTimeout(() => {
            this._partialTimer = 0;
            this._buffer = Buffer.alloc(0);
        }, 500);
    }
    handleFrame(frame) {
        const address = this.options.address;
        if (frame.readUInt8(0) !== address)
            return; // чужой адрес на шине — молча проходим
        if (!ModbusRTU_1.ModbusRTU.verifyCRC(frame)) {
            this.shares.crcErrors++;
            this.metric('modbus.rtu.crcErrors', this.shares.crcErrors);
            this.error('bad frame crc', vrack2_core_1.ErrorManager.make('V2MODBUS_SLAVE_BAD_FRAME', {
                id: this.id,
                bytes: frame.length,
            }));
            return;
        }
        const func = frame.readUInt8(1);
        const reg = frame.readUInt16BE(2);
        this.shares.requests++;
        this.metric('modbus.rtu.requests', this.shares.requests);
        if (this.options.debug)
            this.event('RECV', { func, reg });
        switch (func) {
            case 0x01:
            case 0x02: {
                const count = frame.readUInt16BE(4);
                if (count < 1 || count > 2000)
                    return this.exception(address, func, 0x03);
                const area = func === 0x01 ? 'coils' : 'discrete';
                const data = this.packBits(area, reg, count);
                const resp = Buffer.alloc(3 + data.length);
                resp.writeUInt8(address, 0);
                resp.writeUInt8(func, 1);
                resp.writeUInt8(data.length, 2);
                data.copy(resp, 3);
                this.send(ModbusRTU_1.ModbusRTU.addCRC(resp));
                return;
            }
            case 0x03:
            case 0x04: {
                const count = frame.readUInt16BE(4);
                if (count < 1 || count > 125)
                    return this.exception(address, func, 0x03);
                const data = Buffer.alloc(count * 2);
                for (let i = 0; i < count; i++) {
                    data.writeUInt16BE(this.getValue('holding', reg + i) & 0xFFFF, i * 2);
                }
                const resp = Buffer.alloc(3 + data.length);
                resp.writeUInt8(address, 0);
                resp.writeUInt8(func, 1);
                resp.writeUInt8(data.length, 2);
                data.copy(resp, 3);
                this.send(ModbusRTU_1.ModbusRTU.addCRC(resp));
                return;
            }
            case 0x05: {
                const coil = frame.readUInt16BE(4) === 0xFF00 ? 1 : 0;
                if (frame.readUInt16BE(4) !== 0xFF00 && frame.readUInt16BE(4) !== 0x0000) {
                    return this.exception(address, func, 0x03);
                }
                this.setValue('coils', reg, coil);
                this.countWrite();
                this.send(ModbusRTU_1.ModbusRTU.addCRC(frame.subarray(0, 6)));
                return;
            }
            case 0x06: {
                const value = frame.readUInt16BE(4);
                this.setValue('holding', reg, value);
                this.countWrite();
                const resp = Buffer.alloc(6);
                resp.writeUInt8(address, 0);
                resp.writeUInt8(0x06, 1);
                resp.writeUInt16BE(reg, 2);
                resp.writeUInt16BE(value, 4);
                this.send(ModbusRTU_1.ModbusRTU.addCRC(resp));
                return;
            }
            case 0x0F: {
                const count = frame.readUInt16BE(4);
                if (count < 1 || count > 1968)
                    return this.exception(address, func, 0x03);
                if (frame.readUInt8(6) !== Math.ceil(count / 8))
                    return this.exception(address, func, 0x03);
                for (let i = 0; i < count; i++) {
                    const bit = (frame.readUInt8(7 + Math.floor(i / 8)) >> (i % 8)) & 1;
                    this.setValue('coils', reg + i, bit);
                }
                this.countWrite();
                const resp = Buffer.alloc(6);
                resp.writeUInt8(address, 0);
                resp.writeUInt8(0x0F, 1);
                resp.writeUInt16BE(reg, 2);
                resp.writeUInt16BE(count, 4);
                this.send(ModbusRTU_1.ModbusRTU.addCRC(resp));
                return;
            }
            case 0x10: {
                const count = frame.readUInt16BE(4);
                if (count < 1 || count > 123)
                    return this.exception(address, func, 0x03);
                if (frame.readUInt8(6) !== count * 2)
                    return this.exception(address, func, 0x03);
                for (let i = 0; i < count; i++) {
                    this.setValue('holding', reg + i, frame.readUInt16BE(7 + i * 2));
                }
                this.countWrite();
                const resp = Buffer.alloc(6);
                resp.writeUInt8(address, 0);
                resp.writeUInt8(0x10, 1);
                resp.writeUInt16BE(reg, 2);
                resp.writeUInt16BE(count, 4);
                this.send(ModbusRTU_1.ModbusRTU.addCRC(resp));
                return;
            }
            default: {
                this.exception(address, func, 0x01);
            }
        }
    }
    exception(address, func, code) {
        const resp = Buffer.alloc(3);
        resp.writeUInt8(address, 0);
        resp.writeUInt8(func | 0x80, 1);
        resp.writeUInt8(code, 2);
        this.send(ModbusRTU_1.ModbusRTU.addCRC(resp));
    }
    /**
     * Упаковывает count битов области из reg в байты (бит 0 первого байта = reg).
     */
    packBits(area, from, count) {
        const data = Buffer.alloc(Math.ceil(count / 8));
        for (let i = 0; i < count; i++) {
            if (this.getValue(area, from + i) & 1) {
                data[Math.floor(i / 8)] |= (1 << (i % 8));
            }
        }
        return data;
    }
    countWrite() {
        this.shares.writes++;
        this.metric('modbus.rtu.writes', this.shares.writes);
        this.render();
    }
    send(buffer) {
        if (this.options.debug)
            this.event('SEND', { bytes: buffer.length });
        this.ports.output.buffer.push(buffer);
    }
    getValue(area, address) {
        var _a, _b;
        return (_b = (_a = this.banks[area]) === null || _a === void 0 ? void 0 : _a.get(address)) !== null && _b !== void 0 ? _b : 0;
    }
    setValue(area, address, value) {
        const bank = this.banks[area];
        const masked = (area === 'holding') ? (value & 0xFFFF) : (value ? 1 : 0);
        bank.set(address, masked);
        this.shares[area][`0x${address.toString(16).padStart(4, '0')}`] = masked;
    }
    checkArea(area) {
        if (area !== 'coils' && area !== 'discrete' && area !== 'holding') {
            throw new Error(`unknown area: ${area} (expected: coils | discrete | holding)`);
        }
        return area;
    }
    actionSet(data) {
        const area = this.checkArea(data.area);
        const value = Number(data.value);
        this.setValue(area, Number(data.address), area === 'holding' ? value : (value ? 1 : 0));
        this.shares.writes = this.shares.writes + 1;
        this.metric('modbus.rtu.writes', this.shares.writes);
        this.render();
        return { result: 'success', area, address: Number(data.address) };
    }
    actionRead(data) {
        const area = this.checkArea(data.area);
        const values = [];
        for (let i = 0; i < data.count; i++) {
            values.push({
                address: `0x${(data.from + i).toString(16).padStart(4, '0')}`,
                value: this.getValue(area, data.from + i),
            });
        }
        return { values };
    }
}
exports.default = ModbusRTUSlave;
