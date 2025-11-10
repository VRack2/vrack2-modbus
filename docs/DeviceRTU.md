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
  await this.updateDI(); // ваша логика
}
```

- Если метод завершается успешно — `online = true`.
- При ошибке — `online = false`, ошибка попадает в `error("Update device error", Error)`.
- **Не обрабатывайте ошибки внутри `update`** — они должны всплывать наверх.
- После завершение метода `update` автоматически на порт `provider` отправляется текущий `TCPProvider` для передачи управления следующему устрйоству или самому провайдеру

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
   * @param {Array<number>|Array<boolean>} [writeData] - Данные для записи (только для команд записи).
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

## 4. Асинхронные действия (запись, настройка)

Для операций записи используйте очередь, чтобы избежать конфликтов с фоновым опросом.

```ts
async actionSetRelay(data) {
  return this.actionAddQueue(async () => {
    await this.simpleRequest(0x05, data.relayIndex, data.value ? 0xFF00 : 0x0000);
    this.render();
  });
}
```

Если вы используете долгие опросы, рекомендуется выполнять runQueue внутри ваших циклических вызово опроса

Пример из **Example1.ts**
```ts
for (const reg of regs) {
  await this.runQueue();
  const resp = await this.simpleRequest(command, reg.address, 0x01);
  obj[reg.name] = resp.data.readInt16BE();
}
```

Для практического примера использования очереди - смотрите **Example1.ts**

