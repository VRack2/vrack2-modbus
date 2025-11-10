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
const DeviceRTU_1 = __importDefault(require("./DeviceRTU"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Пример устройствоа для чтения дискретных входов READ_DISCRETE_INPUTS 0x02
 * Универсальное устроство до 64 входящих портов
*/
class UniversalDI extends DeviceRTU_1.default {
    constructor() {
        super(...arguments);
        this.shares = {
            online: false,
            process: false,
            di: [] // Значение наших дискретных входов (0 индекс = 1 порт)
        };
    }
    description() {
        return fs_1.default.readFileSync(path_1.default.join(path_1.default.dirname(__dirname), 'docs', 'UniversalDI.md')).toString('utf-8');
    }
    checkOptions() {
        const parent = super.checkOptions();
        return Object.assign(Object.assign({}, parent), { сountDI: vrack2_core_1.Rule.number().integer().default(8).min(1).max(64).description('Количество входящих DI портов'), eachGate: vrack2_core_1.Rule.boolean().default(false).description('Отправлять результат при каждом опросе (true) если false будет отправлять только изменения') });
    }
    outputs() {
        const parent = super.outputs();
        return Object.assign(Object.assign({}, parent), { 'di%d': vrack2_core_1.Port.standart().dynamic(this.options.сountDI).description('Порт для получения значения DI устройства') });
    }
    preProcess() {
        for (let i = 1; i <= this.options.сountDI; i++)
            this.shares.di.push(0);
    }
    /**
     * Метод запускается внутри DeviceRTU после установок и проверок всех флагов
     *
     * Если внутри update будет вызвано исключение - оно будет обработано
     * От успешности выполнения update зависит флаг online
    */
    update() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.updateDI();
        });
    }
    /**
     * Обновляет состояния дискретных входов (DI) устройства через Modbus-команду READ_DISCRETE_INPUTS (0x02).
     *
     * Запрашивает {@link options.сountDI} битов, получает ответ в виде буфера байтов,
     * и последовательно разбирает каждый байт на отдельные биты, начиная с DI1 (младший бит первого байта).
     *
     * Последний байт может содержать меньше 8 значимых битов — обрабатывается корректно.
     * После обновления вызывается {@link render} для отображения изменений.
     */
    updateDI() {
        return __awaiter(this, void 0, void 0, function* () {
            // Команда READ_DISCRETE_INPUTS 0x02
            const resp = yield this.simpleRequest(0x02, 0x00, this.options.сountDI);
            const byteCount = Math.ceil(this.options.сountDI / 8);
            for (let i = 0; i < byteCount; i++) {
                const byteValue = resp.data.readUInt8(i);
                const offset = i * 8;
                const bitsInThisByte = Math.min(8, this.options.сountDI - offset);
                this.fillDI(offset, byteValue, bitsInThisByte);
            }
            this.render();
        });
    }
    /**
     * Заполняет состояния дискретных входов (DI) из одного байта маски.
     *
     * Биты читаются от младшего (bit 0) к старшему (bit 7), что соответствует
     * стандартному представлению DI в Modbus: бит 0 → DI1, бит 1 → DI2, и т.д.
     *
     * Обновление порта происходит только если значение изменилось,
     * либо если включена опция options.eachGate.
     *
     * @param {number} offset - Базовый индекс в массиве DI (в битах), с которого начинается запись.
     * @param {number} mask - Байт (0–255), содержащий 8 битовых значений.
     * @param {number} bitCount - Количество значимых битов в маске (1–8), используется для последнего неполного байта.
     */
    fillDI(offset, mask, bitCount = 8) {
        for (let i = 0; i < bitCount; i++) {
            const bit = (mask >> i) & 1; // Чтение бита
            if (this.shares.di[offset + i] !== bit || this.options.eachGate) {
                this.shares.di[offset + i] = bit;
                this.ports.output['di' + (offset + i + 1)].push(bit);
            }
        }
    }
}
exports.default = UniversalDI;
