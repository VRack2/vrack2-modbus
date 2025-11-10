"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vrack2_core_1 = require("vrack2-core");
const ModbusRTU_1 = require("./classes/ModbusRTU");
// Наследуем класс для упращения работы с устройствами ModbusRTU
const DeviceRTU_1 = __importDefault(require("./DeviceRTU"));
/**
 * Пример реального устройства - Датчика Дождя и Снега (Rain and Snow Sensor) версии 2.0.
 *
 * Это китайский датчик с очень простым упарвлением
 *
 * | Регистр | Адрес PLC | Описание | Операция | Код функции | По умолч. | Диапазон |
 * | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
 * | **0000H** | **40001** | **Реальной статус дождя/снега** | Только чтение | 03 | 0 | 0 или 1 |
 * | 0030H | 40049 | Верхний предел темп. подогрева | Чтение/Запись | 03/06 | 35°C | 0~70°C |
 * | 0031H | 40050 | Нижний предел темп. подогрева | Чтение/Запись | 03/06 | 15°C | -30~70°C |
 * | 0032H | 40051 | Гистерезис темп. подогрева | Чтение/Запись | 03/06 | 5°C | 0~70°C |
 * | **0033H** | **40052** | **Задержка сигнала тревоги** | Чтение/Запись | 03/06 | 1 с | 0~60000 с |
 * | **0034H** | **40053** | **Чувствительность** | Чтение/Запись | 03/06 | 800 | 500~3500 |
 *
 * Но для назначения скорости и адреса используется его отдельный не адресный протокол
 *
 * Структура:
 * FD FD FD - преамбула
 * [скорость] - байт скорости (0x01=2400, 0x02=4800, 0x03=9600...)
 * [адрес] - байт адреса MODBUS
 * [CRC_L CRC_H] - контрольная сумма
 *
 * Для управления датчиком используются очереди, что бы можно было оперативно реагировать на экшены
 *
 * @see makeSpecPkg
*/
class Example1 extends DeviceRTU_1.default {
    constructor() {
        super(...arguments);
        this.shares = {
            online: false,
            process: false,
            settings: {
                up: 0,
                down: 0,
                gist: 0
            }
        };
    }
    actions() {
        return {
            'set.up': vrack2_core_1.Action.global().requirements({
                value: vrack2_core_1.Rule.number().integer().default(350).min(0).max(700).description('Температура/10')
            }).description('Верхний предел темп. подогрева'),
            'set.down': vrack2_core_1.Action.global().requirements({
                value: vrack2_core_1.Rule.number().integer().default(150).min(-30).max(700).description('Температура/10')
            }).description('Нижний предел темп. подогрева/10'),
            'set.gist': vrack2_core_1.Action.global().requirements({
                value: vrack2_core_1.Rule.number().integer().default(50).min(0).max(700).description('Температура/10')
            }).description('Гистерезис темп. подогрева'),
            'set.address': vrack2_core_1.Action.global().requirements({
                value: vrack2_core_1.Rule.number().integer().default(1).min(0).max(254).description('Новый адрес')
            }).description('Установка адреса (Широковещательный запрос)'),
            'set.speed': vrack2_core_1.Action.global().requirements({
                value: vrack2_core_1.Rule.number().integer().default(3).min(1).max(5).description('Скорость 1-2400 2-4800 3-9600 ...')
            }).description('Установка скорости (Широковещательный запрос)'),
        };
    }
    /**
     * Установка нижней планки нагревателя
     * 0030H	40049	Верхний предел темп. подогрева	Чтение/Запись	03/06	35°C	0~70°C
    */
    actionSetUp(data) {
        return __awaiter(this, void 0, void 0, function* () {
            // Метод который мы передаем в actionAddQueue должен вернуть Promise!
            // Что бы мы дождались результата
            yield this.actionAddQueue(() => {
                if (data.value > 400)
                    data.value = 400;
                if (data.value < 0)
                    data.value = 0;
                return this.simpleRequest(0x06, 0x30, data.value);
            });
            return { result: 'success' };
        });
    }
    /**
     * Установка нижней планки планки нагревателя
     * 0031H	40050	Нижний предел темп. подогрева	Чтение/Запись	03/06	15°C	-30~70°C
    */
    actionSetDown(data) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.actionAddQueue(() => {
                if (data.value > 700)
                    data.value = 400;
                if (data.value < -300)
                    data.value = -300;
                const unsignedValue = data.value & 0xFFFF;
                return this.simpleRequest(0x06, 0x31, unsignedValue);
            });
            return { result: 'success' };
        });
    }
    /**
     * Установка гистерезиса
     * 0032H	40051	Гистерезис темп. подогрева	Чтение/Запись	03/06	5°C	0~70°C
    */
    actionSetGist(data) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.actionAddQueue(() => {
                if (data.value > 300)
                    data.value = 300;
                if (data.value < 0)
                    data.value = 0;
                return this.simpleRequest(0x06, 0x32, data.value);
            });
            return { result: 'success' };
        });
    }
    /**
     * Установка адреса своим отдельным протоколом
     *
    */
    actionSetAddress(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.Provider === undefined)
                return { result: 'error' };
            yield this.actionAddQueue(() => {
                if (this.Provider === undefined)
                    return;
                this.Provider.setPkgCheck((data) => { return (data.length === 7); });
                return this.Provider.autoRequest(this.makeSpecPkg(0, data.value), this.options.timeout, 1);
            });
            return { result: 'success' };
        });
    }
    /**
     * Установка скорости отдельным протоколом
     *
    */
    actionSetSpeed(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.Provider === undefined)
                return { result: 'error' };
            yield this.actionAddQueue(() => {
                if (this.Provider === undefined)
                    return;
                this.Provider.setPkgCheck((data) => { return (data.length === 7); });
                return this.Provider.autoRequest(this.makeSpecPkg(data.value, 0), this.options.timeout, 1);
            });
            return { result: 'success' };
        });
    }
    update() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.getSettings();
        });
    }
    getSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.updateArray([
                { name: 'snow', address: 0x00 },
                { name: 'interC', address: 0x03 },
                { name: 'sense', address: 0x05 }, // Уровень ацп
            ], 0x03, this.shares);
            // Обновляет базовые флаги
            yield this.updateArray([
                { name: 'up', address: 0x30 },
                { name: 'down', address: 0x31 },
                { name: 'gist', address: 0x32 }
            ], 0x03, this.shares.settings);
            this.render();
        });
    }
    updateArray(regs, command, obj, queue = true) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const reg of regs) {
                if (queue)
                    yield this.runQueue();
                const resp = yield this.simpleRequest(command, reg.address, 0x01);
                obj[reg.name] = resp.data.readInt16BE();
            }
        });
    }
    makeSpecPkg(nSpeed = 0, nAddress = 0) {
        let pkg = Buffer.from([0xfd, 0xfd, 0xfd, nSpeed, nAddress]);
        return ModbusRTU_1.ModbusRTU.addCRC(pkg);
    }
}
exports.default = Example1;
