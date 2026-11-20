import { Device, ErrorManager, Metric, MetricOne, Port, BasicPort, BasicType, Rule, Action, BasicAction } from "vrack2-core";

import fs from 'fs';
import path from "path";

import { ModbusRTU } from "./classes/ModbusRTU";

ErrorManager.register('ModbusRTUSlave', 'V2MODBUS_SLAVE_BAD_FRAME',
  'Modbus RTU slave received a frame that failed the CRC check', {
  id: Rule.string().description('Device id'),
  bytes: Rule.number().description('Bytes dropped'),
})

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
export default class ModbusRTUSlave extends Device {

  description(): string {
    return fs.readFileSync(path.join(path.dirname(__dirname), 'docs', 'ModbusRTUSlave.md')).toString('utf-8')
  }

  checkOptions(): { [key: string]: BasicType; } {
    return {
      address: Rule.number().integer().default(1).min(0).max(254).description('Modbus-адрес этого ведомого').example(1),
      debug: Rule.boolean().default(false).description('Логировать принятые и отправленные кадры'),
    }
  }

  inputs(): { [key: string]: BasicPort; } {
    return {
      buffer: Port.standard().description('Входящие байты Modbus RTU (от vrack2-net.ConverterVirtual)'),
    }
  }

  outputs(): { [key: string]: BasicPort; } {
    return {
      buffer: Port.standard().description('Ответы ведомого (в vrack2-net.ConverterVirtual)'),
    }
  }

  metrics(): { [key: string]: MetricOne; } {
    return {
      'modbus.rtu.requests': Metric.one().descriptions('Всего обработано запросов'),
      'modbus.rtu.writes': Metric.one().descriptions('Всего записей в банк по шине'),
      'modbus.rtu.crcErrors': Metric.one().descriptions('Кадры с неверным CRC'),
    }
  }

  actions(): { [key: string]: BasicAction; } {
    return {
      set: Action.global().requirements({
        area: Rule.string().default('holding').description('Область: coils | discrete | holding'),
        address: Rule.number().integer().required().min(0).max(65535).description('Адрес бита или регистра'),
        value: Rule.number().integer().required().min(0).max(65535).description('Новое значение (0/1 для битов)'),
      }).description('Записать значение в банк вручную'),
      read: Action.global().requirements({
        area: Rule.string().default('holding').description('Область: coils | discrete | holding'),
        from: Rule.number().integer().required().min(0).max(65535).description('Первый адрес'),
        count: Rule.number().integer().default(1).min(1).max(125).description('Сколько элементов'),
      }).description('Прочитать значения банка'),
    }
  }

  onRegister(): void {
    this.shares = {
      requests: 0,
      writes: 0,
      crcErrors: 0,
      coils: {} as { [address: string]: number },
      discrete: {} as { [address: string]: number },
      holding: {} as { [address: string]: number },
    }
  }

  protected banks: { [area: string]: Map<number, number> } = {
    coils: new Map(), discrete: new Map(), holding: new Map(),
  }

  protected _buffer = Buffer.alloc(0)
  protected _partialTimer: NodeJS.Timeout | number = 0

  onStop(): void {
    if (this._partialTimer) clearTimeout(this._partialTimer as NodeJS.Timeout)
    this._partialTimer = 0
    this._buffer = Buffer.alloc(0)
  }

  inputBuffer(data: Buffer): void {
    this._buffer = Buffer.concat([this._buffer, Buffer.isBuffer(data) ? data : Buffer.from(data as any)])
    this.resetPartialTimer()

    while (this._buffer.length >= 5) {
      const frame = this.takeFrame()
      if (!frame) return
      this.handleFrame(frame)
    }
  }

  /**
   * Вырезает из буфера один полный кадр по коду функции. false — кадр ещё не долился.
   */
  private takeFrame(): Buffer | false {
    const func = this._buffer.readUInt8(1)
    let expected = 8

    if (func === 0x0F || func === 0x10) {
      if (this._buffer.length < 7) return false
      expected = 9 + this._buffer.readUInt8(6)
    }

    if (this._buffer.length < expected) return false

    const frame = this._buffer.subarray(0, expected)
    this._buffer = this._buffer.subarray(expected)
    return frame
  }

  private resetPartialTimer(): void {
    if (this._partialTimer) clearTimeout(this._partialTimer as NodeJS.Timeout)
    this._partialTimer = setTimeout(() => {
      this._partialTimer = 0
      this._buffer = Buffer.alloc(0)
    }, 500)
  }

  protected handleFrame(frame: Buffer): void {
    const address = this.options.address as number

    if (frame.readUInt8(0) !== address) return // чужой адрес на шине — молча проходим

    if (!ModbusRTU.verifyCRC(frame)) {
      this.shares.crcErrors++
      this.metric('modbus.rtu.crcErrors', this.shares.crcErrors as number)
      this.error('bad frame crc', ErrorManager.make('V2MODBUS_SLAVE_BAD_FRAME', {
        id: this.id,
        bytes: frame.length,
      }))
      return
    }

    const func = frame.readUInt8(1)
    const reg = frame.readUInt16BE(2)

    this.shares.requests++
    this.metric('modbus.rtu.requests', this.shares.requests as number)

    if (this.options.debug) this.event('RECV', { func, reg })

    switch (func) {
      case 0x01:
      case 0x02: {
        const count = frame.readUInt16BE(4)
        if (count < 1 || count > 2000) return this.exception(address, func, 0x03)
        const area = func === 0x01 ? 'coils' : 'discrete'
        const data = this.packBits(area, reg, count)
        const resp = Buffer.alloc(3 + data.length)
        resp.writeUInt8(address, 0)
        resp.writeUInt8(func, 1)
        resp.writeUInt8(data.length, 2)
        data.copy(resp, 3)
        this.send(ModbusRTU.addCRC(resp))
        return
      }

      case 0x03:
      case 0x04: {
        const count = frame.readUInt16BE(4)
        if (count < 1 || count > 125) return this.exception(address, func, 0x03)
        const data = Buffer.alloc(count * 2)
        for (let i = 0; i < count; i++) {
          data.writeUInt16BE(this.getValue('holding', reg + i) & 0xFFFF, i * 2)
        }
        const resp = Buffer.alloc(3 + data.length)
        resp.writeUInt8(address, 0)
        resp.writeUInt8(func, 1)
        resp.writeUInt8(data.length, 2)
        data.copy(resp, 3)
        this.send(ModbusRTU.addCRC(resp))
        return
      }

      case 0x05: {
        const coil = frame.readUInt16BE(4) === 0xFF00 ? 1 : 0
        if (frame.readUInt16BE(4) !== 0xFF00 && frame.readUInt16BE(4) !== 0x0000) {
          return this.exception(address, func, 0x03)
        }
        this.setValue('coils', reg, coil)
        this.countWrite()
        this.send(ModbusRTU.addCRC(frame.subarray(0, 6)))
        return
      }

      case 0x06: {
        const value = frame.readUInt16BE(4)
        this.setValue('holding', reg, value)
        this.countWrite()
        const resp = Buffer.alloc(6)
        resp.writeUInt8(address, 0)
        resp.writeUInt8(0x06, 1)
        resp.writeUInt16BE(reg, 2)
        resp.writeUInt16BE(value, 4)
        this.send(ModbusRTU.addCRC(resp))
        return
      }

      case 0x0F: {
        const count = frame.readUInt16BE(4)
        if (count < 1 || count > 1968) return this.exception(address, func, 0x03)
        if (frame.readUInt8(6) !== Math.ceil(count / 8)) return this.exception(address, func, 0x03)
        for (let i = 0; i < count; i++) {
          const bit = (frame.readUInt8(7 + Math.floor(i / 8)) >> (i % 8)) & 1
          this.setValue('coils', reg + i, bit)
        }
        this.countWrite()
        const resp = Buffer.alloc(6)
        resp.writeUInt8(address, 0)
        resp.writeUInt8(0x0F, 1)
        resp.writeUInt16BE(reg, 2)
        resp.writeUInt16BE(count, 4)
        this.send(ModbusRTU.addCRC(resp))
        return
      }

      case 0x10: {
        const count = frame.readUInt16BE(4)
        if (count < 1 || count > 123) return this.exception(address, func, 0x03)
        if (frame.readUInt8(6) !== count * 2) return this.exception(address, func, 0x03)
        for (let i = 0; i < count; i++) {
          this.setValue('holding', reg + i, frame.readUInt16BE(7 + i * 2))
        }
        this.countWrite()
        const resp = Buffer.alloc(6)
        resp.writeUInt8(address, 0)
        resp.writeUInt8(0x10, 1)
        resp.writeUInt16BE(reg, 2)
        resp.writeUInt16BE(count, 4)
        this.send(ModbusRTU.addCRC(resp))
        return
      }

      default: {
        this.exception(address, func, 0x01)
      }
    }
  }

  private exception(address: number, func: number, code: number): void {
    const resp = Buffer.alloc(3)
    resp.writeUInt8(address, 0)
    resp.writeUInt8(func | 0x80, 1)
    resp.writeUInt8(code, 2)
    this.send(ModbusRTU.addCRC(resp))
  }

  /**
   * Упаковывает count битов области из reg в байты (бит 0 первого байта = reg).
   */
  private packBits(area: string, from: number, count: number): Buffer {
    const data = Buffer.alloc(Math.ceil(count / 8))
    for (let i = 0; i < count; i++) {
      if (this.getValue(area, from + i) & 1) {
        data[Math.floor(i / 8)] |= (1 << (i % 8))
      }
    }
    return data
  }

  private countWrite(): void {
    this.shares.writes++
    this.metric('modbus.rtu.writes', this.shares.writes as number)
    this.render()
  }

  private send(buffer: Buffer): void {
    if (this.options.debug) this.event('SEND', { bytes: buffer.length })
    this.ports.output.buffer.push(buffer)
  }

  protected getValue(area: string, address: number): number {
    return this.banks[area]?.get(address) ?? 0
  }

  protected setValue(area: string, address: number, value: number): void {
    const bank = this.banks[area]
    const masked = (area === 'holding') ? (value & 0xFFFF) : (value ? 1 : 0)
    bank.set(address, masked)
    ;(this.shares[area] as { [address: string]: number })[`0x${address.toString(16).padStart(4, '0')}`] = masked
  }

  private checkArea(area: string): string {
    if (area !== 'coils' && area !== 'discrete' && area !== 'holding') {
      throw new Error(`unknown area: ${area} (expected: coils | discrete | holding)`)
    }
    return area
  }

  actionSet(data: { area: string; address: number; value: number }): { result: string; area: string; address: number } {
    const area = this.checkArea(data.area)
    const value = Number(data.value)
    this.setValue(area, Number(data.address), area === 'holding' ? value : (value ? 1 : 0))
    this.shares.writes = (this.shares.writes as number) + 1
    this.metric('modbus.rtu.writes', this.shares.writes as number)
    this.render()
    return { result: 'success', area, address: Number(data.address) }
  }

  actionRead(data: { area: string; from: number; count: number }): { values: { address: string; value: number }[] } {
    const area = this.checkArea(data.area)
    const values: { address: string; value: number }[] = []

    for (let i = 0; i < data.count; i++) {
      values.push({
        address: `0x${(data.from + i).toString(16).padStart(4, '0')}`,
        value: this.getValue(area, data.from + i),
      })
    }

    return { values }
  }
}
