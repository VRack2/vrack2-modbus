# Как писать Modbus RTU-устройства на основе `DeviceRTU`

Класс `DeviceRTU` — это базовая абстракция для создания **Modbus RTU-устройств**. 

Класс выполняет:

- управление подключением через `TCPProvider` из `vrack2-net`,
- обработку жизненного цикла (онлайн/оффлайн/process),
- очередь асинхронных действий,
- отправку и разбор Modbus-запросов.

Ваши устройства наследуются от `DeviceRTU` и **переопределяют только логику работы с конкретными функциями Modbus**.

Проще всего посмотреть примеры репозитория [vrack2-other-rtu](https://github.com/VRack2/vrack2-other-rtu)

---

## 1. Базовая структура устройства

```ts
import DeviceRTU from "../../vrack2-modbus/devices/DeviceRTU"
// или в случае js - через const DeviceRTU = require("../../vrack2-modbus/devices/DeviceRTU")
export default class MyDevice extends DeviceRTU {
  // 1. Опционально: расширьте параметры
  checkOptions() { /* ... */ }

  // 2. Опционально: объявите входы/выходы
  outputs() { /* ... */ }
  inputs() { /* ... */ }

  // 3. Обязательно: реализуйте основную логику опроса
  async update() { /* ... */ }
}
```

Рекомендация при определении собственных портов и опций:

```ts
export default class MyDevice extends DeviceRTU {
  // Поскольку DeviceRTU содержит свои опции timeout и тп
  checkOptions() { 
    ...super.checkOptions() 
    /* Ваши параметры */ 
  }

  // Опционально: объявите входы/выходы
  outputs() { 
    ...super.outputs()
    /* Ваши выходы */ 
  }
  // Тоже самое с входами
  inputs() {
    ...super.inputs()
  }
}
```

Смотрите простой пример **UniversalDI.ts**

## 2. Основной метод опроса (`update`)

Этот метод вызывается **автоматически** при получении `vrack2-net.TCPProvider` или другого похожего по реализации провайдера.

```ts
async update() {
  // ваша логика
  // Например 
  await this.updateDI(); 
  // ОБЯЗАТЕЛЬНО await!
}
```

В зависимости от успешного завершения метода `update()` зависит флаг `online` для устройства внутри **ConverterBus**. Ошибки которые происходят внутри `update` должны пробрасываться наверх. Вы можете их обрабатывать сами, но продолжать пробрасывать их выше

---

## 3. Работа с Modbus: `simpleRequest` и `request`

### Упрощённый запрос
```ts
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
   * @param {Array<number>} [writeData] - Данные для записи (только для команд записи).
   *   - Для 0x05/0x06: один элемент (число или булево).
   *   - Для 0x0F/0x10: массив значений (битов или 16-битных регистров).
   * @returns {Promise<{ data: Buffer; }>} Объект с полезной нагрузкой ответа (`data` — буфер без заголовков Modbus).
   * @throws {Error} Если провайдер не подключён или запрос завершился неудачей.
*/
const resp = await this.simpleRequest(
  0x02,        // команда (READ_DISCRETE_INPUTS)
  0x00,        // стартовый адрес
  this.options.CountDI // количество битов/регистров
);
// resp.data — Buffer с полезной нагрузкой
```

Поддерживаемые команды:
- `0x01` — Read Coils
- `0x02` — Read Discrete Inputs
- `0x03` — Read Holding Registers
- `0x04` — Read Input Registers
- `0x05`, `0x06`, `0x0F`, `0x10` — запись (требует `writeData`)

### Низкоуровневый запрос

Если нужен кастомный буфер:
```ts
const buffer = ModbusRTU.makeRequest(...);
const resp = await this.request(buffer);
```

## 4. Внутренняя очередь

Внутренняя очередь используется, если есть необходимость выполнить запрос, который пришел с помощью экшена или события полученного через входящий порт. 

Запуск очереди происходит в момент получения класса провайдера `TCPProvider` перед вызовом `update()`. 

Пример установки через `Action`:

```ts
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
```

За проверку и вызов очереди отвечает метод `DeviceRTU`:

```js
await this.runQueue()
```

Если вы используете долгие опросы, рекомендуется выполнять runQueue внутри ваших циклических вызовоd опроса. Проверка наличия задачь в очереди не занимет значимое время.

Пример из **Example1.ts**
```ts
for (const reg of regs) {
  await this.runQueue();
  const resp = await this.simpleRequest(command, reg.address, 0x01);
  obj[reg.name] = resp.data.readInt16BE();
}
```

Для практического примера использования очереди - смотрите **Example1.ts**



