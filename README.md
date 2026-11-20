# VRack2-Modbus

Упрощённая работа с устройствами которые работают по протоколу Modbus. 

## Установка

Перед установкой необходимо установить так же:

- [vrack2-net](https://github.com/VRack2/vrack2-net) - Для работы с преобразователями и **TCPProvider**

Клонируем в директорию устройств (по умолчанию /opt/vrack2-service/devices)

```
cd /opt/vrack2-service/devices/
git clone https://github.com/VRack2/vrack2-modbus
```

----------

## Тесты

Бинарные тесты устройств гоняются настоящим ядром (graph-фикстуры `tests/*.js`, см. [vrack2-test/README](../vrack2-test/README.md)), сборка TypeScript — локальным `tsc`:

```bash
cd devices/vrack2-modbus
npm run build   # src/*.ts -> devices/*.js
npm test        # node run/run-test.js по каждому tests/*.js
```

| тест | что проверяет |
|---|---|
| `tests/load.js` | весь `list.json` собирается и стартует, материализация динамических портов `do%d/di%d` |
| `tests/universal-di.js` | маска DI ставится стендом, побитовый разбор, частичный байт, `eachGate` (изменения / каждый цикл) |
| `tests/universal-do.js` | желание `do*` -> запись `0x0F` -> чтение состояния `0x01` -> `di*`; нет повторных записей при совпадении |
| `tests/rtu-lab.js` | граф `service-examples/rtu-lab.json` собирается целиком: оба мастера на одной шине против стенда |

Живой стенд для проверок через MCP/платформу — `service-examples/rtu-lab.json` (порт 15051).

## Использование

**Для организации опроса** устроиств сети типа Ethernet ↔ Serial / RS485 / CAN используется [ConverterBus](https://github.com/VRack2/vrack2-net/blob/main/docs/ConverterBus.md)

  - [DeviceRTU](./docs/DeviceRTU.md) - Класс для создания своих абстракций для реальных ModbusRTU устройств
  - [ModbusRTU](./src/classes/ModbusRTU.ts) - Статический класс для работы с протоколом ModbusRTU
  - [UniversalDI](./docs/UniversalDI.md) - Простое универсальное устройство DI до 64 портов (чтение `0x02`)
  - [UniversalDO](./docs/UniversalDO.md) - Универсальное устройство DO до 64 портов (чтение состояния `0x01`, запись маски `0x0F`)
  - [ModbusRTUSlave](./docs/ModbusRTUSlave.md) - Виртуальное ведомое (банк coils/discrete/holding) — стенд для тестов и лабораторных сервисов без железа
  - [Сложный пример устройства](./src/Example1.ts) - Использование экшенов очередей и тп.
  - [Пример сервиса](./services/example1.json) - Самый простой пример сервиса для организации опроса 1 устройства
  - [Пример сервиса DO](./service-examples/universal-do.json) - Сервис с UniversalDO на шине ConverterBus
  - [Лабораторный сервис](./service-examples/rtu-lab.json) - UniversalDI + UniversalDO против ModbusRTUSlave (порт 15051) — работает без железа, подходит для проверок через MCP

## Дополнительно

 [vrack2-other-rtu](https://github.com/VRack2/vrack2-other-rtu) - Набор разных ModbusRTU устройств

## Связанные репозитории

- [VRack2](https://github.com/VRack2/vrack2) - фреймворк для автоматизации и управления сервисами
- [VRack2-Service](https://github.com/VRack2/vrack2-service) — запуск сервисов на базе VRack2-Core.
- [VRack2-Core](https://github.com/VRack2/vrack2-core) — фреймворк для событийно-ориентированных сервисов на JavaScript/TypeScript.
- [VGranite](https://github.com/VRack2/VGranite) — сервис для организации туннелей Socket → Serial.
- [VRack2-Remote](https://github.com/VRack2/vrack2-remote) - библиотека для работы с VRack2 API
