/// <reference types="node" />
/// <reference types="node" />
import { BasicAction } from "vrack2-core";
import DeviceRTU from "./DeviceRTU";
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
    actions(): {
        [key: string]: BasicAction;
    };
    shares: any;
    /**
     * Установка нижней планки нагревателя
     * 0030H	40049	Верхний предел темп. подогрева	Чтение/Запись	03/06	35°C	0~70°C
    */
    actionSetUp(data: {
        value: number;
    }): Promise<{
        result: string;
    }>;
    /**
     * Установка нижней планки планки нагревателя
     * 0031H	40050	Нижний предел темп. подогрева	Чтение/Запись	03/06	15°C	-30~70°C
    */
    actionSetDown(data: {
        value: number;
    }): Promise<{
        result: string;
    }>;
    /**
     * Установка гистерезиса
     * 0032H	40051	Гистерезис темп. подогрева	Чтение/Запись	03/06	5°C	0~70°C
    */
    actionSetGist(data: {
        value: number;
    }): Promise<{
        result: string;
    }>;
    /**
     * Установка адреса своим отдельным протоколом
     *
    */
    actionSetAddress(data: {
        value: number;
    }): Promise<{
        result: string;
    }>;
    /**
     * Установка скорости отдельным протоколом
     *
    */
    actionSetSpeed(data: {
        value: number;
    }): Promise<{
        result: string;
    }>;
    update(): Promise<void>;
    getSettings(): Promise<void>;
    updateArray(regs: Array<{
        name: string;
        address: number;
    }>, command: number, obj: {
        [key: string]: any;
    }, queue?: boolean): Promise<void>;
    makeSpecPkg(nSpeed?: number, nAddress?: number): Buffer;
}
