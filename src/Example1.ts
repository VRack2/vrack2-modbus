import { Action, BasicAction, Rule } from "vrack2-core";
import { ModbusRTU } from "./classes/ModbusRTU";
// Наследуем класс для упращения работы с устройствами ModbusRTU
import DeviceRTU from "./DeviceRTU"

/**
 * Пример реального устройства - Датчика Дождя и Снега (Rain and Snow Sensor) версии 2.0.
 *  
 * Это китайский датчик с очень простым упарвлением
 * 
 * | Регистр | Адрес PLC | Описание | Операция | Код функции | По умолч. | Диапазон |
 * | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
 * | **0000H** | **40001** | **Реальной статус дождя/снега** | Только чтение | 03 | 0 | 0 или 1 |
 * | 0030H | 40049 | Верхний предел темп. подогрева | Чтение/Запись | 03/06 | 35°C | 0~70°C |
 * | 0031H | 40050 | Нижний предел темп. подогрева | Чтение/Запись | 03/06 | 15°C | -30~70°C |
 * | 0032H | 40051 | Гистерезис темп. подогрева | Чтение/Запись | 03/06 | 5°C | 0~70°C |
 * | **0033H** | **40052** | **Задержка сигнала тревоги** | Чтение/Запись | 03/06 | 1 с | 0~60000 с |
 * | **0034H** | **40053** | **Чувствительность** | Чтение/Запись | 03/06 | 800 | 500~3500 |
 * 
 * Но для назначения скорости и адреса используется его отдельный не адресный протокол
 * 
 * Структура:
 * FD FD FD - преамбула
 * [скорость] - байт скорости (0x01=2400, 0x02=4800, 0x03=9600...)
 * [адрес] - байт адреса MODBUS
 * [CRC_L CRC_H] - контрольная сумма
 * 
 * Для управления датчиком используются очереди, что бы можно было оперативно реагировать на экшены
 * 
 * @see makeSpecPkg
*/
export default class Example1 extends DeviceRTU {

  actions(): { [key: string]: BasicAction; } {
    return {
      'set.up': Action.global().requirements({
        value: Rule.number().integer().default(350).min(0).max(700).description('Температура/10')
      }).description('Верхний предел темп. подогрева'),
      'set.down': Action.global().requirements({
        value: Rule.number().integer().default(150).min(-30).max(700).description('Температура/10')
      }).description('Нижний предел темп. подогрева/10'),
      'set.gist': Action.global().requirements({
        value: Rule.number().integer().default(50).min(0).max(700).description('Температура/10')
      }).description('Гистерезис темп. подогрева'),
      'set.address': Action.global().requirements({
        value: Rule.number().integer().default(1).min(0).max(254).description('Новый адрес')
      }).description('Установка адреса (Широковещательный запрос)'),
      'set.speed': Action.global().requirements({
        value: Rule.number().integer().default(3).min(1).max(5).description('Скорость 1-2400 2-4800 3-9600 ...')
      }).description('Установка скорости (Широковещательный запрос)'),
    }
  }

  shares: any = {
    online: false,
    process: false,
    settings: {
      up: 0,
      down: 0,
      gist: 0
    }
  }

  /**
   * Установка нижней планки нагревателя
   * 0030H	40049	Верхний предел темп. подогрева	Чтение/Запись	03/06	35°C	0~70°C
  */
  async actionSetUp(data: { value: number }) {
    // Метод который мы передаем в actionAddQueue должен вернуть Promise!
    // Что бы мы дождались результата
    await this.actionAddQueue(() => {
      if (data.value > 400) data.value = 400
      if (data.value < 0) data.value = 0
      return this.simpleRequest(0x06, 0x30 , data.value);
    })
    return { result: 'success' }
  }

  /**
   * Установка нижней планки планки нагревателя
   * 0031H	40050	Нижний предел темп. подогрева	Чтение/Запись	03/06	15°C	-30~70°C
  */
  async actionSetDown(data: { value: number }) {
    await this.actionAddQueue(() => {
      if (data.value > 700) data.value = 400
      if (data.value < -300) data.value = -300
      const unsignedValue = data.value & 0xFFFF;
      return this.simpleRequest(0x06, 0x31 , unsignedValue);
    })
    return { result: 'success' }
  }

  /**
   * Установка гистерезиса 
   * 0032H	40051	Гистерезис темп. подогрева	Чтение/Запись	03/06	5°C	0~70°C
  */
  async actionSetGist(data: { value: number }) {
    await this.actionAddQueue(() => {
      if (data.value > 300) data.value = 300
      if (data.value < 0) data.value = 0
      return this.simpleRequest(0x06, 0x32 , data.value);
    })
    return { result: 'success' }
  }

  /**
   * Установка адреса своим отдельным протоколом
   * 
  */
  async actionSetAddress(data: { value: number }) {
    if (this.Provider === undefined) return { result: 'error' }
     await this.actionAddQueue(() => {
      if (this.Provider === undefined) return
      this.Provider.setPkgCheck((data)=>{ return (data.length === 7) })
      return this.Provider.autoRequest(this.makeSpecPkg(0, data.value), this.options.timeout, 1)
    })
    return { result: 'success' }
  }

  /**
   * Установка скорости отдельным протоколом 
   * 
  */
  async actionSetSpeed(data: { value: number }) {
    if (this.Provider === undefined) return { result: 'error' }
     await this.actionAddQueue(() => {
      if (this.Provider === undefined) return
      this.Provider.setPkgCheck((data)=>{ return (data.length === 7) })
      return this.Provider.autoRequest(this.makeSpecPkg(data.value, 0), this.options.timeout, 1)
    })
    return { result: 'success' }
  }

  async update(): Promise<void> {
    await this.getSettings()
  }

  async getSettings() {
    await this.updateArray([
      { name: 'snow', address: 0x00 },
      { name: 'interC', address: 0x03 }, // Внутренняя температура
      { name: 'sense', address: 0x05 }, // Уровень ацп
    ], 0x03, this.shares);

    // Обновляет базовые флаги
    await this.updateArray([
      { name: 'up', address: 0x30 },
      { name: 'down', address: 0x31 },
      { name: 'gist', address: 0x32 }
    ], 0x03, this.shares.settings);

    this.render();
  }


  async updateArray(
    regs: Array<{ name: string, address: number }>,
    command: number,
    obj: { [key: string]: any },
    queue = true
  ) {
    for (const reg of regs) {
      if (queue) await this.runQueue();
      const resp = await this.simpleRequest(command, reg.address, 0x01);
      obj[reg.name] = resp.data.readInt16BE();
    }
  }

  makeSpecPkg(nSpeed = 0, nAddress = 0): Buffer{
    let pkg = Buffer.from([0xfd, 0xfd, 0xfd, nSpeed, nAddress])
    return ModbusRTU.addCRC(pkg)
  }
}