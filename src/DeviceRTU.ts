import { Device, Port, Rule, BasicPort, BasicType } from "vrack2-core";

import TCPProvider from "../../vrack2-net/devices/classes/TCPProvider"
import { ModbusRTU } from "./classes/ModbusRTU";

export default class DeviceRTU extends Device {

  inputs(): { [key: string]: BasicPort; } {
    return {
      bus: Port.return().description('Порт для получения класса TCPProvider vrack2-net.ConverterClient')
    }
  }

  checkOptions(): { [key: string]: BasicType; } {
    return {
      address: Rule.number().integer().default(1).min(0).max(254).description('Адрес устройства').example(0),
      timeout: Rule.number().integer().default(700).min(0).description('Таймаут запроса в мс').example(0),
      offTimeout: Rule.number().integer().min(0).default(30000).description('Таймаут неприхода провайдера после которого считается что устройство оффлайн')
    }
  }

  shares: any = {
    online: false,
    process: false
  }

  /**
   * Класс провайдера из vrack2-net
   * 
  */
  Provider!: TCPProvider

  /**
   * Очередь 
   * 
  */
  queue = new Map<number, {
    resolve: (value: any) => void,
    reject: (value: any) => void,
    method: () => any
  }>();
  queueIndex = 1

  offlineTimer: NodeJS.Timeout | number = 0

  /**
   * Обработчик входа провайдера
   * 
   * При получении провайдера - мы получаем контроль
   * 
  */
  async inputBus(provider: TCPProvider) {
    if (this.shares.process) return // Такого по хорошему быть не должно
    this.Provider = provider
    this.Provider.canRequest()
    this.iGate()
    try {
      await this.runQueue()
      await this.update()
      this.shares.online = true
    } catch (err) {
      this.shares.online = false
      this.error('Update device error', err as Error)
      throw err
    }
    this.oGate()
  }

  /**
   * Выполняется перед запуском update
  */
  private iGate() {
    if (this.offlineTimer) clearTimeout(this.offlineTimer) // Очищаем таймер оффлайна
    this.shares.progress = true
    this.render()
  }

  /**
   * Выполняется после завершение update
  */
  private oGate() {
    this.offlineTimer = setTimeout(()=>{
      this.offlineTimer = 0
      this.shares.online = false
    }, this.options.offTimeout)
    this.shares.progress = false
    this.render()
  }


  /**
   * Основной метод для переопределния 
  */
  async update() {

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
  actionAddQueue(method: () => any) {
    return new Promise((resolve, reject) => {
      this.queue.set(this.getQueueIndex(), { resolve, reject, method });
    });
  }

  /**
   * Проверка наличия заданий и выполнения их если они имеются 
   */
  async runQueue() {
    if (!this.queue.size) return;
    const keys = [...this.queue.keys()]; // Создаем новый список - это важно

    for (const key of keys) {
      const value = this.queue.get(key);
      if (value === undefined) continue
      try { value.resolve(await value.method()); } catch (err) { value.reject(err); }
      this.queue.delete(key);
    }
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
  simpleRequest(cmd: number, addr: number, quantity: number, writeData?: number[]) {
    const req = ModbusRTU.makeRequest(this.options.address, cmd, addr, quantity, writeData);
    return this.request(req)
  }

  async request(buffer: Buffer, maxRetries = 3) {
    this.Provider.setPkgCheck(ModbusRTU.isCompletePacket)
    await this.Provider.autoRequest(buffer, this.options.timeout, maxRetries)
    const resp = this.Provider.getBuffer()
    return ModbusRTU.parseResponse(resp)
  }

  /**
   * Возвращет следующий индекс очереди
  */
  protected getQueueIndex() {
    return this.queueIndex++;
  }
}