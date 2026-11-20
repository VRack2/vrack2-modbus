import { Device, MetricOne, BasicPort, BasicType, BasicAction } from "vrack2-core";
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
    description(): string;
    checkOptions(): {
        [key: string]: BasicType;
    };
    inputs(): {
        [key: string]: BasicPort;
    };
    outputs(): {
        [key: string]: BasicPort;
    };
    metrics(): {
        [key: string]: MetricOne;
    };
    actions(): {
        [key: string]: BasicAction;
    };
    onRegister(): void;
    protected banks: {
        [area: string]: Map<number, number>;
    };
    protected _buffer: Buffer<ArrayBuffer>;
    protected _partialTimer: NodeJS.Timeout | number;
    onStop(): void;
    inputBuffer(data: Buffer): void;
    /**
     * Вырезает из буфера один полный кадр по коду функции. false — кадр ещё не долился.
     */
    private takeFrame;
    private resetPartialTimer;
    protected handleFrame(frame: Buffer): void;
    private exception;
    /**
     * Упаковывает count битов области из reg в байты (бит 0 первого байта = reg).
     */
    private packBits;
    private countWrite;
    private send;
    protected getValue(area: string, address: number): number;
    protected setValue(area: string, address: number, value: number): void;
    private checkArea;
    actionSet(data: {
        area: string;
        address: number;
        value: number;
    }): {
        result: string;
        area: string;
        address: number;
    };
    actionRead(data: {
        area: string;
        from: number;
        count: number;
    }): {
        values: {
            address: string;
            value: number;
        }[];
    };
}
