import { ErrorManager } from "vrack2-core";

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

ErrorManager.register(
  'ModbusRTU',
  'UVIAK29C3',
  'V2MODBUS_CRC_CHECK_FAILED',
  'CRC check failed',
);

ErrorManager.register(
  'ModbusRTU',
  '80CND0PSX',
  'V2MODBUS_PACKET_TOO_SHORT',
  'Packet too short',
);

ErrorManager.register(
  'ModbusRTU',
  'TZSQKYJF2',
  'V2MODBUS_WRITE_DATA_REQUIRED_COILS',
  'Write data array required for multiple coils',
);

ErrorManager.register(
  'ModbusRTU',
  'HN2K72BEA',
  'V2MODBUS_COILS_COUNT_INVALID',
  'Coils count must be between 1 and 1968',
);

ErrorManager.register(
  'ModbusRTU',
  'XDLM87T14',
  'V2MODBUS_WRITE_DATA_REQUIRED_REGISTERS',
  'Write data array required for multiple registers',
);

ErrorManager.register(
  'ModbusRTU',
  'GJ94O8NM3',
  'V2MODBUS_REGISTERS_COUNT_INVALID',
  'Registers count must be between 1 and 123',
);

ErrorManager.register(
  'ModbusRTU',
  '0BKOC8FGI',
  'V2MODBUS_UNSUPPORTED_FUNCTION_CODE',
  'Unsupported function code',
);

/**
 * Cтатический класс для работы с протоколом Modbus RTU,
 * предоставляющий методы для создания, проверки и парсинга Modbus-пакетов.
 * 
*/
export class ModbusRTU {

  /**
   * Именованные коды функий
  */
  public static readonly FUNCTION_CODES = {
    READ_COILS: 0x01,
    READ_DISCRETE_INPUTS: 0x02,
    READ_HOLDING_REGISTERS: 0x03,
    READ_INPUT_REGISTERS: 0x04,
    WRITE_SINGLE_COIL: 0x05,
    WRITE_SINGLE_REGISTER: 0x06,
    WRITE_MULTIPLE_COILS: 0x0F,
    WRITE_MULTIPLE_REGISTERS: 0x10
  };

  /**
   * Универсальный метод создания Modbus RTU запроса
   */
  public static makeRequest(
    slaveId: number,
    functionCode: number,
    address: number,
    quantity: number,
    writeData?: number[]
  ): Buffer {
    // Реализация метода
    // Базовая валидация
    slaveId = slaveId & 0xFF
    address = address & 0xFFFF

    let buffer: Buffer;

    switch (functionCode) {
      case 0x01: // Read Coils
      case 0x02: // Read Discrete Inputs
        buffer = Buffer.alloc(6);
        buffer.writeUInt16BE(quantity, 4);
        break;

      case 0x03: // Read Holding Registers  
      case 0x04: // Read Input Registers
        buffer = Buffer.alloc(6);
        buffer.writeUInt16BE(quantity, 4);
        break;

      case 0x05: // Write Single Coil
        buffer = Buffer.alloc(6);
        buffer.writeUInt16BE(quantity ? 0xFF00 : 0x0000, 4);
        break;

      case 0x06: // Write Single Register
        buffer = Buffer.alloc(6);
        buffer.writeUInt16BE(quantity, 4);
        break;

      case 0x0F: // Write Multiple Coils
        if (!writeData || !Array.isArray(writeData)) 
          throw ErrorManager.make('V2MODBUS_WRITE_DATA_REQUIRED_COILS')
        
        if (writeData.length < 1 || writeData.length > 1968) 
          throw ErrorManager.make('V2MODBUS_COILS_COUNT_INVALID')
        
        // Автоматически заполняем quantity если указано неправильно
        if (quantity !== writeData.length) quantity = writeData.length

        const coilBytes = Math.ceil(quantity / 8);
        buffer = Buffer.alloc(7 + coilBytes);
        buffer.writeUInt16BE(quantity, 4);
        buffer.writeUInt8(coilBytes, 6);

        // Упаковываем биты
        for (let i = 0; i < quantity; i++) {
          const byteIndex = Math.floor(i / 8);
          const bitIndex = i % 8;
          if (writeData[i]) buffer[7 + byteIndex] |= (1 << bitIndex);
        }
        break;

      case 0x10: // Write Multiple Registers
        if (!writeData || !Array.isArray(writeData)) 
          throw ErrorManager.make('V2MODBUS_WRITE_DATA_REQUIRED_REGISTERS')
        
        if (writeData.length < 1 || writeData.length > 123) 
          throw ErrorManager.make('V2MODBUS_REGISTERS_COUNT_INVALID')
        

        if (quantity !== writeData.length) quantity = writeData.length

        const registerBytes = quantity * 2;
        buffer = Buffer.alloc(7 + registerBytes);
        buffer.writeUInt16BE(quantity, 4);
        buffer.writeUInt8(registerBytes, 6);

        // Записываем регистры
        for (let i = 0; i < quantity; i++) {
          const value = writeData[i];
          if (typeof value !== "number") continue
          buffer.writeUInt16BE(value & 0xFFFF, 7 + i * 2);
        }
        break;

      default:
        throw ErrorManager.make('V2MODBUS_UNSUPPORTED_FUNCTION_CODE')
    }

    // Заполняем общую часть пакета
    buffer.writeUInt8(slaveId, 0);
    buffer.writeUInt8(functionCode, 1);
    buffer.writeUInt16BE(address, 2);

    return this.addCRC(buffer);
  }

  /**
   * Создает запрос чтения coils (0x01)
   * @example
   * const packet = ModbusRTU.createReadCoilsRequest(1, 0x0000, 8);
   * // packet: <Buffer 01 01 00 00 00 08 3d cc>
   */
  public static createReadCoilsRequest(slaveId: number, address: number, quantity: number): Buffer {
    return this.makeRequest(slaveId, 0x01, address, quantity);
  }

  /**
   * Создает запрос чтения discrete inputs (0x02)
   * @example
   * const packet = ModbusRTU.createReadDiscreteInputsRequest(1, 0x0020, 16);
   * // packet: <Buffer 01 02 00 20 00 10 79 c6>
   */
  public static createReadDiscreteInputsRequest(slaveId: number, address: number, quantity: number): Buffer {
    return this.makeRequest(slaveId, 0x02, address, quantity);
  }

  /**
   * Создает запрос чтения holding registers (0x03)
   * @example
   * const packet = ModbusRTU.createReadHoldingRegistersRequest(1, 0x0064, 3);
   * // packet: <Buffer 01 03 00 64 00 03 05 d4>
   */
  public static createReadHoldingRegistersRequest(slaveId: number, address: number, quantity: number): Buffer {
    return this.makeRequest(slaveId, 0x03, address, quantity);
  }

  /**
   * Создает запрос чтения input registers (0x04)
   * @example
   * const packet = ModbusRTU.createReadInputRegistersRequest(1, 0x0000, 2);
   * // packet: <Buffer 01 04 00 00 00 02 71 cb>
   */
  public static createReadInputRegistersRequest(slaveId: number, address: number, quantity: number): Buffer {
    return this.makeRequest(slaveId, 0x04, address, quantity);
  }

  /**
   * Создает запрос записи одиночного coil (0x05)
   * @example
   * const packet = ModbusRTU.createWriteSingleCoilRequest(1, 0x0032, true);
   * // packet: <Buffer 01 05 00 32 ff 00 8c 18>
   */
  public static createWriteSingleCoilRequest(slaveId: number, address: number, value: boolean): Buffer {
    return this.makeRequest(slaveId, 0x05, address, value ? 1 : 0);
  }

  /**
   * Создает запрос записи одиночного регистра (0x06)
   * @example
   * const packet = ModbusRTU.createWriteSingleRegisterRequest(1, 0x0100, 0x1234);
   * // packet: <Buffer 01 06 01 00 12 34 2b b6>
   */
  public static createWriteSingleRegisterRequest(slaveId: number, address: number, value: number): Buffer {
    return this.makeRequest(slaveId, 0x06, address, value);
  }

  /**
   * Создает запрос записи нескольких coils (0x0F)
   * @example
   * const packet = ModbusRTU.createWriteMultipleCoilsRequest(1, 0x0020, [1, 0, 1, 0, 1]);
   * // packet: <Buffer 01 0f 00 20 00 05 01 1a 9f 5b>
   */
  public static createWriteMultipleCoilsRequest(slaveId: number, address: number, values: number[]): Buffer {
    return this.makeRequest(slaveId, 0x0F, address, values.length, values);
  }

  /**
   * Создает запрос записи нескольких регистров (0x10)
   * @example
   * const packet = ModbusRTU.createWriteMultipleRegistersRequest(1, 0x0200, [0x1234, 0x5678, 0x9ABC]);
   * // packet: <Buffer 01 10 02 00 00 03 06 12 34 56 78 9a bc 9e 29>
   */
  public static createWriteMultipleRegistersRequest(slaveId: number, address: number, values: number[]): Buffer {
    return this.makeRequest(slaveId, 0x10, address, values.length, values);
  }

  /**
   * Вычисляет CRC16 для Modbus RTU пакета
   * @example
   * const data = Buffer.from([0x01, 0x03, 0x00, 0x00, 0x00, 0x02]);
   * const crc = ModbusRTU.calculateCRC16(data); // 0xC40B
   */
  public static calculateCRC16(buffer: Buffer): number {
    let crc = 0xFFFF;
    for (let i = 0; i < buffer.length; i++) {
      crc ^= buffer[i];
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x0001) !== 0) crc = (crc >> 1) ^ 0xA001; else  crc = crc >> 1; 
      }
    }
    return crc;
  }

  /**
   * Проверяет корректность CRC пакета
   * @example
   * const packet = Buffer.from([0x01, 0x03, 0x04, 0x00, 0x0A, 0x00, 0x14, 0x4B, 0x08]);
   * const isValid = ModbusRTU.verifyCRC(packet); // true
   */
  public static verifyCRC(buffer: Buffer): boolean {
    if (buffer.length < 2) return false;
    const data = buffer.subarray(0, -2);
    const receivedCRC = buffer.readUInt16LE(buffer.length - 2);
    const calculatedCRC = this.calculateCRC16(data);
    return receivedCRC === calculatedCRC;
  }

  /**
 * Парсит входящий Modbus RTU пакет
 * @example
 * const response = Buffer.from([0x01, 0x03, 0x04, 0x00, 0x0A, 0x00, 0x14, 0x4B, 0x08]);
 * const parsed = ModbusRTU.parseResponse(response);
 * // { slaveId: 1, functionCode: 3, byteCount: 4, data: <Buffer 00 0a 00 14> }
 */
public static parseResponse(buffer: Buffer): ModbusResponse {
  if (buffer.length < 4) throw ErrorManager.make('V2MODBUS_PACKET_TOO_SHORT') ;
  if (!this.verifyCRC(buffer)) throw ErrorManager.make('V2MODBUS_CRC_CHECK_FAILED');

  const slaveId = buffer.readUInt8(0);
  let functionCode = buffer.readUInt8(1);

  // Если исключение 
  if ((functionCode & 0x80) !== 0) {
    return { 
      slaveId, 
      functionCode: functionCode & 0x7F,  // Убираем потенциально лишние биты
      byteCount: 0, 
      data: Buffer.alloc(0), 
      exceptionCode: buffer.readUInt8(2) // Получаем код исключения
    };
  }
  // По умолчанию считаем что данные это все что между addr cmd | данные | CRC
  let byteCount: number = buffer.length - 4;
  let data: Buffer = buffer.subarray(2, -2);

  // Определяем структуру по коду функции
  switch (functionCode) {
    case 0x01: // Read Coils
    case 0x02: // Read Discrete Inputs
    case 0x03: // Read Holding Registers
    case 0x04: // Read Input Registers
      // Структура: [slave][func][byteCount][data...][crc]
      byteCount = buffer.readUInt8(2);
      data = buffer.subarray(3, -2);
      break;
  }

  return { 
    slaveId, 
    functionCode, 
    byteCount, 
    data 
  };
}
  /**
   * Проверяет что буфер содержит полный Modbus RTU пакет
   * @example
   * const buffer = Buffer.from([0x01, 0x05, 0x00, 0x20, 0xFF, 0x00, 0x8C, 0x18]);
   * const isComplete = ModbusRTU.isCompletePacket(buffer); // true
   */
  public static isCompletePacket(buffer: Buffer): boolean {
    if (buffer.length < 4) return false;
    switch (buffer.readUInt8(1)) {        
      case 0x01: // Read Coils
      case 0x02: // Read Discrete Inputs
      case 0x03: // Read Holding Registers
      case 0x04: // Read Input Registers
        // Берем размер из 3его байта и прибавляем 5 байт и сравниваем размер буфера
        if (buffer.length > 5) return buffer.length ===  buffer.readUInt8(2) + 5;
      default: 
        return buffer.length === 8;
    }
  }


  /**
   * Вычисляет CRC для переданного Buffer, 
   * добавляет 2 байта в конец возвращая новый Buffer
   * 
  */
  public static addCRC(data: Buffer): Buffer {
    const crc = this.calculateCRC16(data);
    const crcBuf = Buffer.alloc(2);
    crcBuf.writeUInt16LE(crc, 0);
    return Buffer.concat([data, crcBuf]);
  }
}
