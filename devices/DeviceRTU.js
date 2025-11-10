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
Object.defineProperty(exports, "__esModule", { value: true });
const vrack2_core_1 = require("vrack2-core");
const ModbusRTU_1 = require("./classes/ModbusRTU");
class DeviceRTU extends vrack2_core_1.Device {
    constructor() {
        super(...arguments);
        this.shares = {
            online: false,
            process: false
        };
        /**
         * Очередь
         *
        */
        this.queue = new Map();
        this.queueIndex = 1;
    }
    outputs() {
        return {
            provider: vrack2_core_1.Port.standart().description('Порт отправки класса TCPProvider').requirement(vrack2_core_1.Rule.object().description('Класс provider см. vrack2-net.ConverterClient'))
        };
    }
    inputs() {
        return {
            provider: vrack2_core_1.Port.standart().description('Порт для получения класса TCPProvider vrack2-net.ConverterClient')
        };
    }
    checkOptions() {
        return {
            address: vrack2_core_1.Rule.number().integer().default(1).min(0).max(254).description('Адрес устройства').example(0),
            timeout: vrack2_core_1.Rule.number().integer().default(700).min(0).description('Таймаут запроса в мс').example(0)
        };
    }
    /**
     * Обработчик входа провайдера
     *
     * При получении провайдера - мы получаем контроль
     *
    */
    inputProvider(provider) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.shares.process)
                return; // Такого по хорошему быть не должно
            this.Provider = provider;
            this.iGate();
            try {
                this.runQueue();
                yield this.update();
                this.shares.online = true;
            }
            catch (err) {
                this.shares.online = false;
                this.error('Update device error', err);
            }
            this.oGate();
        });
    }
    /**
     * Выполняется перед запуском update
    */
    iGate() {
        this.Provider.setDevice(this.type, this.id); // Устанавливаем устройство
        this.shares.progress = true;
        this.render();
    }
    /**
     * Выполняется после завершение update
    */
    oGate() {
        this.shares.progress = false;
        this.Provider.clearDevice(); // Очищаем устройство
        this.ports.output.provider.push(this.Provider);
        this.render();
    }
    /**
     * Основной метод для переопределния
    */
    update() {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
    /**
     * Добавление в очередь задачи которая будет выполнена
     * как только появится возможно при наличии контроля
     *
     * Используется в экшенах
     *
     * @example
     * sync actionSetDown(data) {
     * if (data.value > 2) data.value = 2;
     * if (data.value < 0) data.value = 0;
     *   await this.actionAddQueue(async () => {
     *     // Код изменения...
     *     this.render();
     *    });
     * }
     */
    actionAddQueue(method) {
        return new Promise((resolve, reject) => {
            this.queue.set(this.getQueueIndex(), { resolve, reject, method });
        });
    }
    /**
     * Проверка наличия заданий и выполнения их если они имеются
     */
    runQueue() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.queue.size)
                return;
            const keys = [...this.queue.keys()]; // Создаем новый список - это важно
            for (const key of keys) {
                const value = this.queue.get(key);
                if (value === undefined)
                    continue;
                try {
                    value.resolve(yield value.method());
                }
                catch (err) {
                    value.reject(err);
                }
                this.queue.delete(key);
            }
        });
    }
    /**
     * Выполняет упрощённый Modbus RTU-запрос через встроенный провайдер.
     *
     * Автоматически формирует запрос с учётом адреса устройства (`this.options.address`),
     * отправляет его и возвращает распарсенный ответ.
     *
     * Поддерживает как команды чтения, так и записи (при передаче `writeData`).
     *
     * @param {number} cmd - Код функции Modbus (например, 0x01, 0x02, 0x03, 0x05, 0x06, 0x0F, 0x10).
     * @param {number} addr - Начальный адрес в устройстве (адрес первой катушки, входа или регистра).
     * @param {number} quantity - Количество запрашиваемых/записываемых элементов (битов или регистров).
     * @param {Array<number>|Array<boolean>} [writeData] - Данные для записи (только для команд записи).
     *   - Для 0x05/0x06: один элемент (число или булево).
     *   - Для 0x0F/0x10: массив значений (битов или 16-битных регистров).
     * @returns {Promise<{ data: Buffer; }>} Объект с полезной нагрузкой ответа (`data` — буфер без заголовков Modbus).
     * @throws {Error} Если провайдер не подключён или запрос завершился неудачей.
     */
    simpleRequest(cmd, addr, quantity, writeData) {
        const req = ModbusRTU_1.ModbusRTU.makeRequest(this.options.address, cmd, addr, quantity, writeData);
        return this.request(req);
    }
    request(buffer, maxRetries = 3) {
        return __awaiter(this, void 0, void 0, function* () {
            this.Provider.setPkgCheck(ModbusRTU_1.ModbusRTU.isCompletePacket);
            yield this.Provider.autoRequest(buffer, this.options.timeout, maxRetries);
            const resp = this.Provider.getBuffer();
            return ModbusRTU_1.ModbusRTU.parseResponse(resp);
        });
    }
    /**
     * Возвращет следующий индекс очереди
    */
    getQueueIndex() {
        return this.queueIndex++;
    }
}
exports.default = DeviceRTU;
