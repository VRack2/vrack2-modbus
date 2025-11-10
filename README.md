# VRack2-Modbus

Упращенная работа с устройстами которые работают по протоколу Modbus. 

## Установка

Перед установкой необходимо установить так же:

- [vrack2-net](https://github.com/VRack2/vrack2-net) - Для работы с преобразователями и **TCPProvider**

Клонируем в директорию устройств (по умолчанию /opt/vrack2-service/devices)

```
cd /opt/vrack2-service/devices/
git clone https://github.com/VRack2/vrack2-other-rtu
```

----------

На данный момент все устройства не протестированны достаточно хорошо, но уже сейчас могут служить основой ваших устройств.

----------

## Использование

 [DeviceRTU](./docs/DeviceRTU.md) - Класс для создания своих абстракцию для реальных ModbusRTU устройств
 [ModbusRTU](./src/classes/ModbusRTU.ts) - Статический класс для работы с протоколом ModbusRTU
 [Пример сервиса](./services/example1.json) - Самый просто пример сервиса для организации опроса 1 устройства
 [UniversalDI](./src/UniversalDI.ts) - Простое универсальное устройство DI до 64 портов
 [Сложный пример устройства](./src/Example1.ts) - Использование экшенов очередей и тп.

## Дополнительно

 [vrack2-other-rtu](https://github.com/VRack2/vrack2-other-rtu) - Набор разных ModbusRTU устройств

## Связанные репозитории

- [VRack2](https://github.com/VRack2/vrack2) - фреймворк для автоматизации и управления сервисами
- [VRack2-Service](https://github.com/VRack2/vrack2-service) — запуск сервисов на базе VRack2-Core.
- [VRack2-Core](https://github.com/VRack2/vrack2-core) — фреймворк для событийно-ориентированных сервисов на JavaScript/TypeScript.
- [VGranite](https://github.com/VRack2/VGranite) — сервис для организации туннелей Socket → Serial.
- [VRack2-Remote](https://github.com/VRack2/vrack2-remote) - библиотека для работы с VRack2 API
