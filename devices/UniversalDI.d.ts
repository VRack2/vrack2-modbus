import { BasicType, BasicPort } from "vrack2-core";
import DeviceRTU from "./DeviceRTU";
/**
 * Пример устройствоа для чтения дискретных входов READ_DISCRETE_INPUTS 0x02
 * Универсальное устроство до 64 входящих портов
*/
export default class UniversalDI extends DeviceRTU {
    description(): string;
    checkOptions(): {
        [key: string]: BasicType;
    };
    outputs(): {
        [key: string]: BasicPort;
    };
    shares: any;
    preProcess(): void;
    /**
     * Метод запускается внутри DeviceRTU после установок и проверок всех флагов
     *
     * Если внутри update будет вызвано исключение - оно будет обработано
     * От успешности выполнения update зависит флаг online
    */
    update(): Promise<void>;
    /**
     * Обновляет состояния дискретных входов (DI) устройства через Modbus-команду READ_DISCRETE_INPUTS (0x02).
     *
     * Запрашивает {@link options.сountDI} битов, получает ответ в виде буфера байтов,
     * и последовательно разбирает каждый байт на отдельные биты, начиная с DI1 (младший бит первого байта).
     *
     * Последний байт может содержать меньше 8 значимых битов — обрабатывается корректно.
     * После обновления вызывается {@link render} для отображения изменений.
     */
    updateDI(): Promise<void>;
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
    fillDI(offset: number, mask: number, bitCount?: number): void;
}
