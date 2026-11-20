import { Rule, BasicType, BasicPort, Port } from "vrack2-core";

import fs from 'fs';
import path from "path";

import DeviceRTU from "./DeviceRTU"

/**
 * Универсальное устройство дискретных выходов (DO) до 64 портов.
 *
 * Читает фактическое состояние катушек командой 0x01 (выходы `di1..diN` —
 * обратная связь), принимает желание на входы `do1..doN` и пишет маску
 * командой 0x0F, пока состояние устройства не совпадёт с желаемым.
 */
export default class UniversalDO extends DeviceRTU {

  description(): string {
      return fs.readFileSync(path.join(path.dirname(__dirname), 'docs','UniversalDO.md')).toString('utf-8')
  }

  checkOptions(): { [key: string]: BasicType; } {
    const parent = super.checkOptions()
    return {
      ...parent,
      countDO: Rule.number().integer().default(8).min(1).max(64).description('Количество DO портов'),
      eachGate: Rule.boolean().default(false).description('Отправлять результат при каждом опросе (true) если false будет отправлять только изменения')
    }
  }

  inputs(): { [key: string]: BasicPort; } {
      return {
        ...super.inputs(),
        'do%d': Port.standard().dynamic(this.options.countDO).description('Порт для записи значение в устройство')
      }
  }

  outputs(): { [key: string]: BasicPort; } {
    const parent = super.outputs()
    return {
      ...parent,
      'di%d': Port.standard().dynamic(this.options.countDO).description('Порт для получения фактического статуса DO устройства')
    }
  }

  onRegister(): void {
    this.shares = {
      online: false,
      process: false,
      do: [], // Фактическое состояние дискретных выходов
      bitmask: [], // Текущая маска состояния (получена от устройства)
      write: [] // Маска записи (какой хочет стать мастер)
    }
    for (let i = 1; i <= this.options.countDO; i++) { 
      this.shares.do.push(0) // Заполняем значение отельных портов
      this.addInputHandler('do'+i, (value: number)=>{
        this.inputDO(i, value)
      })
    }  

    // Заполняем полные маски
    const maskCount = Math.ceil(this.options.countDO / 8)
    for (let i = 0; i < maskCount; i++) { 
      this.shares.bitmask.push(0) // Текущая реальная маска
      this.shares.write.push(0) // Такая какая должна быть
    }
  }

  /**
   * Нам вероятно пришло новое значение DO порта которое нам нужно поменять
   * 
   * Для этого нам нужно узнать байт маски в которой находится этот порт
  */
  inputDO(port: number, val:number){
    const bitIndex = port - 1               // Индекс бита
    const byteIndex = Math.floor(bitIndex / 8); // В каком байте
    const bitInByte = bitIndex % 8;             // Какой бит в байте
    const value = (this.shares.write[byteIndex] >> bitInByte) & 1 // Получаем текущее желание
    if (val) val = 1; else val = 0
    if (val === value) return;
    if (val) this.shares.write[byteIndex] |= 1 << bitInByte
    else this.shares.write[byteIndex] &= ~(1 << bitInByte)
    this.Provider.addUrgentQueue(this.id)
  }

  /**
   * Метод запускается внутри DeviceRTU после установок и проверок всех флагов
   * 
   * Если внутри update будет вызвано исключение - оно будет обработано 
   * От успешности выполнения update зависит флаг online
  */
  async update() {
    await this.updateDO()
    await this.writeDO()
  }

  /**
   * Читает фактическое состояние катушек (0x01), обновляет shares.bitmask
   * и выдаёт значения на выходы di1..diN
  */
  async updateDO(){
    const resp = await this.simpleRequest(0x01, 0x00, this.options.countDO);
    const byteCount = Math.ceil(this.options.countDO / 8)
    for (let i = 0; i < byteCount; i++) {
      const offset = i * 8;
      const bitsInThisByte = Math.min(8, this.options.countDO - offset);
      const significant = (1 << bitsInThisByte) - 1 // Маска значимых битов последнего байта
      const byteValue = resp.data.readUInt8(i) & significant;
      this.shares.bitmask[i] = byteValue
      this.fillDI(offset, byteValue, bitsInThisByte);
    }
  }

  /**
   * Пишет желаемую маску (0x0F) если она отличается от фактической.
   * 
   * Повторяется каждый цикл опроса пока состояние устройства не совпадёт
   * с желаемым, поэтому запись доживает до подтверждения даже если устройство
   * не приняла маску с первого раза.
  */
  async writeDO(){
    let dirty = false
    for (let i = 0; i < this.shares.write.length; i++) {
      if (this.shares.write[i] !== this.shares.bitmask[i]) { dirty = true; break }
    }
    if (!dirty) return

    const bits: number[] = []
    for (let i = 0; i < this.options.countDO; i++) {
      bits.push((this.shares.write[Math.floor(i / 8)] >> (i % 8)) & 1)
    }

    await this.simpleRequest(0x0F, 0x00, this.options.countDO, bits)
  } 

/**
 * Заполняет состояния дискретных выходов (DI) из одного байта маски.
 * 
 * Биты читаются от младшего (bit 0) к старшему (bit 7), что соответствует
 * стандартному представлению DI в Modbus: бит 0 → DO1, бит 1 → DO2, и т.д.
 * 
 * Обновление порта происходит только если значение изменилось,
 * либо если включена опция {@link options.eachGate}.
 * 
 * @param {number} offset - Базовый индекс в массиве DI (в битах), с которого начинается запись.
 * @param {number} mask - Байт (0–255), содержащий 8 битовых значений.
 * @param {number} bitCount - Количество значимых битов в маске (1–8), используется для последнего неполного байта.
 */
  fillDI(offset: number, mask: number, bitCount = 8) {
    for (let i = 0; i < bitCount; i++) {
      const bit = (mask >> i) & 1; // Чтение бита
      if (this.shares.do[offset + i] !== bit || this.options.eachGate){
        this.shares.do[offset + i] = bit;
        this.ports.output['di' + (offset + i + 1)].push(bit);
      }
    }
  }
}
