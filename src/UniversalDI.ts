import { Rule, BasicType, BasicPort, Port } from "vrack2-core";
import DeviceRTU from "./DeviceRTU"
import fs from 'fs';
import path from "path";

/**
 * Пример устройствоа для чтения дискретных входов READ_DISCRETE_INPUTS 0x02
 * Универсальное устроство до 64 входящих портов
*/
export default class UniversalDI extends DeviceRTU {

  description(): string {
      return fs.readFileSync(path.join(path.dirname(__dirname), 'docs','UniversalDI.md')).toString('utf-8')
  }

  checkOptions(): { [key: string]: BasicType; } {
    const parent = super.checkOptions()
    return {
      ...parent,
      сountDI: Rule.number().integer().default(8).min(1).max(64).description('Количество входящих DI портов'),
      eachGate: Rule.boolean().default(false).description('Отправлять результат при каждом опросе (true) если false будет отправлять только изменения')
    }
  }

  outputs(): { [key: string]: BasicPort; } {
    const parent = super.outputs()
    return {
      ...parent,
      'di%d': Port.standart().dynamic(this.options.сountDI).description('Порт для получения значения DI устройства')
    }
  }

  shares: any = {
    online: false,
    process: false,
    di: [] // Значение наших дискретных входов (0 индекс = 1 порт)
  }

  preProcess(): void {
    for (let i = 1; i <= this.options.сountDI; i++) this.shares.di.push(0)
  }

  /**
   * Метод запускается внутри DeviceRTU после установок и проверок всех флагов
   * 
   * Если внутри update будет вызвано исключение - оно будет обработано 
   * От успешности выполнения update зависит флаг online
  */
  async update() {
    await this.updateDI()
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
  async updateDI() {
    // Команда READ_DISCRETE_INPUTS 0x02
    const resp = await this.simpleRequest(0x02, 0x00, this.options.сountDI);
    const byteCount = Math.ceil(this.options.сountDI / 8)
    for (let i = 0; i < byteCount; i++) {
      const byteValue = resp.data.readUInt8(i);
      const offset = i * 8;
      const bitsInThisByte = Math.min(8, this.options.сountDI - offset);
      this.fillDI(offset, byteValue, bitsInThisByte);
    }
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
  fillDI(offset: number, mask: number, bitCount = 8) {
    for (let i = 0; i < bitCount; i++) {
      const bit = (mask >> i) & 1; // Чтение бита
      if (this.shares.di[offset + i] !== bit || this.options.eachGate){
        this.shares.di[offset + i] = bit;
        this.ports.output['di' + (offset + i + 1)].push(bit);
      }
    }
  }
}