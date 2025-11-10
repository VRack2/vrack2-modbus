/// <reference types="node" />
/// <reference types="node" />
/**
 * Интерфейс для представления разобранного Modbus RTU ответа
 *
 * @property {number} slaveId - Идентификатор ведомого устройства (0-255)
 * @property {number} functionCode - Код функции Modbus (0x01-0x10)
 * @property {number} byteCount - Количество байт в поле данных
 * @property {Buffer} data - Буфер с полезными данными ответа
 * @property {number} [exceptionCode] - Код исключения (присутствует только в ответах с ошибкой)
 *
 * @example
 * // Успешный ответ на чтение holding registers
 * const successResponse: ModbusResponse = {
 *   slaveId: 1,
 *   functionCode: 0x03,
 *   byteCount: 6,
 *   data: Buffer.from([0x00, 0x0A, 0x00, 0x14, 0x01, 0x2C])
 * };
 *
 * @example
 * // Ответ с исключением (ошибка)
 * const errorResponse: ModbusResponse = {
 *   slaveId: 1,
 *   functionCode: 0x83, // 0x03 + 0x80 (бит ошибки)
 *   byteCount: 0,
 *   data: Buffer.alloc(0),
 *   exceptionCode: 0x02 // Неверный адрес данных
 * };
 *
 * @description
 * Интерфейс используется методом `ModbusRTU.parseResponse()` для возврата
 * структурированных данных из сырого Modbus-пакета. При наличии бита ошибки
 * в старшем бите functionCode, поле exceptionCode содержит код ошибки.
 */
export interface ModbusResponse {
    slaveId: number;
    functionCode: number;
    byteCount: number;
    data: Buffer;
    exceptionCode?: number;
}
/**
 * Cтатический класс для работы с протоколом Modbus RTU,
 * предоставляющий методы для создания, проверки и парсинга Modbus-пакетов.
 *
*/
export declare class ModbusRTU {
    /**
     * Именованные коды функий
    */
    static readonly FUNCTION_CODES: {
        READ_COILS: number;
        READ_DISCRETE_INPUTS: number;
        READ_HOLDING_REGISTERS: number;
        READ_INPUT_REGISTERS: number;
        WRITE_SINGLE_COIL: number;
        WRITE_SINGLE_REGISTER: number;
        WRITE_MULTIPLE_COILS: number;
        WRITE_MULTIPLE_REGISTERS: number;
    };
    /**
     * Универсальный метод создания Modbus RTU запроса
     */
    static makeRequest(slaveId: number, functionCode: number, address: number, quantity: number, writeData?: number[]): Buffer;
    /**
     * Создает запрос чтения coils (0x01)
     * @example
     * const packet = ModbusRTU.createReadCoilsRequest(1, 0x0000, 8);
     * // packet: <Buffer 01 01 00 00 00 08 3d cc>
     */
    static createReadCoilsRequest(slaveId: number, address: number, quantity: number): Buffer;
    /**
     * Создает запрос чтения discrete inputs (0x02)
     * @example
     * const packet = ModbusRTU.createReadDiscreteInputsRequest(1, 0x0020, 16);
     * // packet: <Buffer 01 02 00 20 00 10 79 c6>
     */
    static createReadDiscreteInputsRequest(slaveId: number, address: number, quantity: number): Buffer;
    /**
     * Создает запрос чтения holding registers (0x03)
     * @example
     * const packet = ModbusRTU.createReadHoldingRegistersRequest(1, 0x0064, 3);
     * // packet: <Buffer 01 03 00 64 00 03 05 d4>
     */
    static createReadHoldingRegistersRequest(slaveId: number, address: number, quantity: number): Buffer;
    /**
     * Создает запрос чтения input registers (0x04)
     * @example
     * const packet = ModbusRTU.createReadInputRegistersRequest(1, 0x0000, 2);
     * // packet: <Buffer 01 04 00 00 00 02 71 cb>
     */
    static createReadInputRegistersRequest(slaveId: number, address: number, quantity: number): Buffer;
    /**
     * Создает запрос записи одиночного coil (0x05)
     * @example
     * const packet = ModbusRTU.createWriteSingleCoilRequest(1, 0x0032, true);
     * // packet: <Buffer 01 05 00 32 ff 00 8c 18>
     */
    static createWriteSingleCoilRequest(slaveId: number, address: number, value: boolean): Buffer;
    /**
     * Создает запрос записи одиночного регистра (0x06)
     * @example
     * const packet = ModbusRTU.createWriteSingleRegisterRequest(1, 0x0100, 0x1234);
     * // packet: <Buffer 01 06 01 00 12 34 2b b6>
     */
    static createWriteSingleRegisterRequest(slaveId: number, address: number, value: number): Buffer;
    /**
     * Создает запрос записи нескольких coils (0x0F)
     * @example
     * const packet = ModbusRTU.createWriteMultipleCoilsRequest(1, 0x0020, [1, 0, 1, 0, 1]);
     * // packet: <Buffer 01 0f 00 20 00 05 01 1a 9f 5b>
     */
    static createWriteMultipleCoilsRequest(slaveId: number, address: number, values: number[]): Buffer;
    /**
     * Создает запрос записи нескольких регистров (0x10)
     * @example
     * const packet = ModbusRTU.createWriteMultipleRegistersRequest(1, 0x0200, [0x1234, 0x5678, 0x9ABC]);
     * // packet: <Buffer 01 10 02 00 00 03 06 12 34 56 78 9a bc 9e 29>
     */
    static createWriteMultipleRegistersRequest(slaveId: number, address: number, values: number[]): Buffer;
    /**
     * Вычисляет CRC16 для Modbus RTU пакета
     * @example
     * const data = Buffer.from([0x01, 0x03, 0x00, 0x00, 0x00, 0x02]);
     * const crc = ModbusRTU.calculateCRC16(data); // 0xC40B
     */
    static calculateCRC16(buffer: Buffer): number;
    /**
     * Проверяет корректность CRC пакета
     * @example
     * const packet = Buffer.from([0x01, 0x03, 0x04, 0x00, 0x0A, 0x00, 0x14, 0x4B, 0x08]);
     * const isValid = ModbusRTU.verifyCRC(packet); // true
     */
    static verifyCRC(buffer: Buffer): boolean;
    /**
   * Парсит входящий Modbus RTU пакет
   * @example
   * const response = Buffer.from([0x01, 0x03, 0x04, 0x00, 0x0A, 0x00, 0x14, 0x4B, 0x08]);
   * const parsed = ModbusRTU.parseResponse(response);
   * // { slaveId: 1, functionCode: 3, byteCount: 4, data: <Buffer 00 0a 00 14> }
   */
    static parseResponse(buffer: Buffer): ModbusResponse;
    /**
     * Проверяет что буфер содержит полный Modbus RTU пакет
     * @example
     * const buffer = Buffer.from([0x01, 0x05, 0x00, 0x20, 0xFF, 0x00, 0x8C, 0x18]);
     * const isComplete = ModbusRTU.isCompletePacket(buffer); // true
     */
    static isCompletePacket(buffer: Buffer): boolean;
    /**
     * Вычисляет CRC для переданного Buffer,
     * добавляет 2 байта в конец возвращая новый Buffer
     *
    */
    static addCRC(data: Buffer): Buffer;
}
