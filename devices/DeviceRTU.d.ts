/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { Device, BasicPort, BasicType } from "vrack2-core";
import TCPProvider from "../../vrack2-net/devices/classes/TCPProvider";
export default class DeviceRTU extends Device {
    outputs(): {
        [key: string]: BasicPort;
    };
    inputs(): {
        [key: string]: BasicPort;
    };
    checkOptions(): {
        [key: string]: BasicType;
    };
    shares: any;
    /**
     * Класс провайдера из vrack2-net
     *
    */
    Provider: TCPProvider;
    /**
     * Очередь
     *
    */
    queue: Map<number, {
        resolve: (value: any) => void;
        reject: (value: any) => void;
        method: () => any;
    }>;
    queueIndex: number;
    offlineTimer: NodeJS.Timeout | number;
    /**
     * Обработчик входа провайдера
     *
     * При получении провайдера - мы получаем контроль
     *
    */
    inputProvider(provider: TCPProvider): Promise<void>;
    /**
     * Выполняется перед запуском update
    */
    private iGate;
    /**
     * Выполняется после завершение update
    */
    private oGate;
    /**
     * Основной метод для переопределния
    */
    update(): Promise<void>;
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
    actionAddQueue(method: () => any): Promise<unknown>;
    /**
     * Проверка наличия заданий и выполнения их если они имеются
     */
    runQueue(): Promise<void>;
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
    simpleRequest(cmd: number, addr: number, quantity: number, writeData?: number[]): Promise<import("./classes/ModbusRTU").ModbusResponse>;
    request(buffer: Buffer, maxRetries?: number): Promise<import("./classes/ModbusRTU").ModbusResponse>;
    /**
     * Возвращет следующий индекс очереди
    */
    protected getQueueIndex(): number;
}
