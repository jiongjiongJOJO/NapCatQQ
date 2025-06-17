import * as net from 'net';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

export interface Packet<T = any> {
    command: string;
    trace: string;
    data: T;
    type: 'listener_callback' | 'event_response' | 'event_request' | 'default';
}

// 协议常量
const PROTOCOL_MAGIC = 0x4E415043; // 'NAPC'
const PROTOCOL_VERSION = 0x01;
const HEADER_SIZE = 12;
const MAX_PACKET_SIZE = 16 * 1024 * 1024; // 降低到16MB
const BUFFER_HIGH_WATER_MARK = 2 * 1024 * 1024; // 2MB背压阈值
const BUFFER_LOW_WATER_MARK = 512 * 1024; // 512KB恢复阈值

// 高效缓冲区管理器
class BufferManager {
    private buffers: Buffer[] = [];
    private totalSize: number = 0;
    private readOffset: number = 0;
    private isHighWaterMark: boolean = false;

    // 添加数据
    append(data: Buffer): void {
        this.buffers.push(data);
        this.totalSize += data.length;

        // 检查背压
        if (!this.isHighWaterMark && this.totalSize > BUFFER_HIGH_WATER_MARK) {
            this.isHighWaterMark = true;
        }
    }

    // 消费数据
    consume(length: number): Buffer {
        if (length > this.available) {
            throw new Error('消费长度超过可用数据');
        }

        const result = Buffer.allocUnsafe(length);
        let resultOffset = 0;
        let remaining = length;

        while (remaining > 0 && this.buffers.length > 0) {
            const currentBuffer = this.buffers[0];
            if (!currentBuffer?.[0]) continue;
            const availableInCurrent = currentBuffer.length - this.readOffset;
            const toCopy = Math.min(remaining, availableInCurrent);

            currentBuffer.copy(result, resultOffset, this.readOffset, this.readOffset + toCopy);
            resultOffset += toCopy;
            remaining -= toCopy;
            this.readOffset += toCopy;

            // 如果当前buffer用完了，移除它
            if (this.readOffset >= currentBuffer.length) {
                this.buffers.shift();
                this.readOffset = 0;
            }
        }

        this.totalSize -= length;

        // 检查是否可以恢复读取
        if (this.isHighWaterMark && this.totalSize < BUFFER_LOW_WATER_MARK) {
            this.isHighWaterMark = false;
        }

        return result;
    }

    // 预览数据（不消费）
    peek(length: number): Buffer | null {
        if (length > this.available) {
            return null;
        }

        const result = Buffer.allocUnsafe(length);
        let resultOffset = 0;
        let remaining = length;
        let bufferIndex = 0;
        let currentReadOffset = this.readOffset;

        while (remaining > 0 && bufferIndex < this.buffers.length) {
            const currentBuffer = this.buffers[bufferIndex];
            if (!currentBuffer) continue;
            const availableInCurrent = currentBuffer.length - currentReadOffset;
            const toCopy = Math.min(remaining, availableInCurrent);

            currentBuffer.copy(result, resultOffset, currentReadOffset, currentReadOffset + toCopy);
            resultOffset += toCopy;
            remaining -= toCopy;

            if (currentReadOffset + toCopy >= currentBuffer.length) {
                bufferIndex++;
                currentReadOffset = 0;
            } else {
                currentReadOffset += toCopy;
            }
        }

        return result;
    }

    get available(): number {
        return this.totalSize;
    }

    get shouldPause(): boolean {
        return this.isHighWaterMark;
    }

    reset(): void {
        this.buffers = [];
        this.totalSize = 0;
        this.readOffset = 0;
        this.isHighWaterMark = false;
    }
}

// 简化的数据包管理器
class PacketManager {
    static pack(packet: Packet): Buffer {
        const jsonStr = JSON.stringify(packet);
        const jsonBuffer = Buffer.from(jsonStr, 'utf8');

        if (jsonBuffer.length > MAX_PACKET_SIZE - HEADER_SIZE) {
            throw new Error(`数据包过大: ${jsonBuffer.length}`);
        }

        const buffer = Buffer.allocUnsafe(HEADER_SIZE + jsonBuffer.length);

        buffer.writeUInt32BE(PROTOCOL_MAGIC, 0);
        buffer.writeUInt32BE(jsonBuffer.length, 4);
        buffer.writeUInt32BE(PROTOCOL_VERSION, 8);
        jsonBuffer.copy(buffer, HEADER_SIZE);

        return buffer;
    }

    static unpack(bufferManager: BufferManager): Packet[] {
        const packets: Packet[] = [];

        while (bufferManager.available >= HEADER_SIZE) {
            // 检查魔数
            const header = bufferManager.peek(HEADER_SIZE);
            if (!header) break;

            const magic = header.readUInt32BE(0);
            if (magic !== PROTOCOL_MAGIC) {
                // 简单的同步恢复：跳过一个字节
                bufferManager.consume(1);
                continue;
            }

            const dataLength = header.readUInt32BE(4);
            const version = header.readUInt32BE(8);

            // 基本验证
            if (dataLength <= 0 || dataLength > MAX_PACKET_SIZE - HEADER_SIZE) {
                bufferManager.consume(1);
                continue;
            }

            // 检查完整包
            const totalSize = HEADER_SIZE + dataLength;
            if (bufferManager.available < totalSize) {
                break;
            }

            // 消费完整包
            bufferManager.consume(HEADER_SIZE);
            const jsonBuffer = bufferManager.consume(dataLength);

            try {
                const packet = JSON.parse(jsonBuffer.toString('utf8')) as Packet;
                if (this.isValidPacket(packet)) {
                    packets.push(packet);
                }
            } catch (error) {
                console.error('JSON解析失败:', error);
            }
        }

        return packets;
    }

    private static isValidPacket(packet: any): packet is Packet {
        return packet &&
            typeof packet.command === 'string' &&
            typeof packet.trace === 'string' &&
            packet.data !== undefined &&
            ['listener_callback', 'event_response', 'event_request', 'default'].includes(packet.type);
    }

    static createRequest<T = any>(command: string, data: T, trace?: string): Packet<T> {
        return {
            command,
            trace: trace || randomUUID(),
            data,
            type: 'event_request'
        };
    }

    static createResponse<T = any>(trace: string, data: T, command = ''): Packet<T> {
        return {
            command,
            trace,
            data,
            type: 'event_response'
        };
    }

    static createCallback<T = any>(command: string, data: T, trace?: string): Packet<T> {
        return {
            command,
            trace: trace || randomUUID(),
            data,
            type: 'listener_callback'
        };
    }
}

// 响应助手类
class ResponseHelper {
    private responseSent = false;

    constructor(private socket: net.Socket, private trace: string, private command: string = '') { }

    success<T = any>(data: T): void {
        if (this.responseSent) return;

        const response = PacketManager.createResponse(this.trace, data, this.command);
        this.writePacket(response);
        this.responseSent = true;
    }

    error(message: string, code = 500): void {
        if (this.responseSent) return;

        const response = PacketManager.createResponse(this.trace, { error: message, code }, this.command);
        this.writePacket(response);
        this.responseSent = true;
    }

    sendEventResponse<T = any>(trace: string, data: T): void {
        const response = PacketManager.createResponse(trace, data, this.command);
        this.writePacket(response);
    }

    sendListenerCallback<T = any>(command: string, data: T): void {
        const callback = PacketManager.createCallback(command, data);
        this.writePacket(callback);
    }

    private writePacket(packet: Packet): void {
        console.log(`发送数据包: ${packet.command}, trace: ${packet.trace} (${packet.type}) `);
        if (!this.socket.destroyed) {
            const buffer = PacketManager.pack(packet);
            this.socket.write(buffer);
        }
    }

    get hasResponseSent(): boolean {
        return this.responseSent;
    }
}

// 带背压控制的Socket包装器
class ManagedSocket {
    private bufferManager = new BufferManager();
    private isPaused = false;

    constructor(private socket: net.Socket, private onPacket: (packet: Packet) => void) {
        this.setupSocket();
    }

    private setupSocket(): void {
        this.socket.on('data', (chunk) => {
            this.bufferManager.append(chunk);

            // 背压控制
            if (this.bufferManager.shouldPause && !this.isPaused) {
                this.socket.pause();
                this.isPaused = true;
                console.warn('Socket暂停读取 - 缓冲区过大');
            }

            this.processPackets();
        });

        this.socket.on('drain', () => {
            // 当socket的写缓冲区有空间时，检查是否可以恢复读取
            if (this.isPaused && !this.bufferManager.shouldPause) {
                this.socket.resume();
                this.isPaused = false;
                console.log('Socket恢复读取');
            }
        });
    }

    private processPackets(): void {
        try {
            const packets = PacketManager.unpack(this.bufferManager);
            packets.forEach(packet => this.onPacket(packet));

            // 处理完包后检查是否可以恢复读取
            if (this.isPaused && !this.bufferManager.shouldPause) {
                this.socket.resume();
                this.isPaused = false;
                console.log('Socket恢复读取');
            }
        } catch (error) {
            console.error('处理数据包失败:', error);
            this.bufferManager.reset();
            if (this.isPaused) {
                this.socket.resume();
                this.isPaused = false;
            }
        }
    }

    write(buffer: Buffer): boolean {
        return this.socket.write(buffer);
    }

    destroy(): void {
        this.socket.destroy();
    }

    get destroyed(): boolean {
        return this.socket.destroyed;
    }
}

type PacketHandler = (packet: Packet, helper: ResponseHelper) => Promise<any> | any;

// 简化的管道服务端
class PipeServer extends EventEmitter {
    private server: net.Server;
    private clients: Map<net.Socket, ManagedSocket> = new Map();
    private handler: PacketHandler | null = null;

    constructor(private pipeName: string) {
        super();
        this.server = net.createServer();
        this.setupServer();
    }

    private setupServer(): void {
        this.server.on('connection', (socket) => {
            console.log('客户端连接');

            const managedSocket = new ManagedSocket(socket, (packet) => {
                this.handlePacket(packet, socket);
            });

            this.clients.set(socket, managedSocket);

            socket.on('close', () => {
                console.log('客户端断开');
                this.clients.delete(socket);
            });

            socket.on('error', (error) => {
                console.error('Socket错误:', error);
                this.clients.delete(socket);
            });
        });
    }

    registerHandler(handler: PacketHandler): void {
        this.handler = handler;
    }

    private async handlePacket(packet: Packet, socket: net.Socket): Promise<void> {
        if (packet.type === 'event_response' || packet.type === 'listener_callback') {
            this.emit(packet.type, packet);
            return;
        }

        const helper = new ResponseHelper(socket, packet.trace, packet.command);

        if (!this.handler) {
            helper.error('未注册处理器');
            return;
        }

        try {
            const result = await this.handler(packet, helper);
            if (result !== undefined && !helper.hasResponseSent) {
                helper.success(result);
            }
        } catch (error) {
            if (!helper.hasResponseSent) {
                const message = error instanceof Error ? error.message : String(error);
                helper.error(message);
            }
        }
    }

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.listen(this.pipeName, () => {
                console.log(`管道服务器启动: ${this.pipeName}`);
                resolve();
            });
            this.server.on('error', reject);
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve) => {
            this.clients.forEach((managedSocket) => managedSocket.destroy());
            this.clients.clear();
            this.server.close(() => {
                console.log('管道服务器停止');
                resolve();
            });
        });
    }

    broadcast<T = any>(command: string, data: T, type: Packet['type'] = 'default'): void {
        const packet: Packet<T> = {
            command,
            trace: randomUUID(),
            data,
            type
        };
        const buffer = PacketManager.pack(packet);

        this.clients.forEach((managedSocket) => {
            if (!managedSocket.destroyed) {
                managedSocket.write(buffer);
            }
        });
    }

    get clientCount(): number {
        return this.clients.size;
    }
}

// 简化的管道客户端
class PipeClient extends EventEmitter {
    private socket: net.Socket | null = null;
    private managedSocket: ManagedSocket | null = null;
    private isConnected = false;
    private handler: PacketHandler | null = null;

    constructor(private pipeName: string) {
        super();
    }

    registerHandler(handler: PacketHandler): void {
        this.handler = handler;
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket = net.createConnection(this.pipeName);

            this.managedSocket = new ManagedSocket(this.socket, (packet) => {
                this.handlePacket(packet);
            });

            this.socket.on('connect', () => {
                console.log('连接到管道服务器');
                this.isConnected = true;
                resolve();
            });

            this.socket.on('close', () => {
                console.log('与服务器断开连接');
                this.isConnected = false;
                this.emit('disconnect');
            });

            this.socket.on('error', (error) => {
                console.error('Socket错误:', error);
                this.isConnected = false;
                reject(error);
            });
        });
    }

    private async handlePacket(packet: Packet): Promise<void> {
        if (this.handler && this.socket) {
            const helper = new ResponseHelper(this.socket, packet.trace, packet.command);
            try {
                await this.handler(packet, helper);
            } catch (error) {
                console.error('处理数据包失败:', error);
            }
        }
    }

    sendRequest<T = any>(command: string, data: T, trace?: string): void {
        if (!this.isConnected || !this.managedSocket) {
            throw new Error('未连接到服务器');
        }

        const packet = PacketManager.createRequest(command, data, trace);
        const buffer = PacketManager.pack(packet);
        this.managedSocket.write(buffer);
    }

    sendResponse<T = any>(trace: string, data: T, command = ''): void {
        if (!this.isConnected || !this.managedSocket) {
            throw new Error('未连接到服务器');
        }

        const packet = PacketManager.createResponse(trace, data, command);
        const buffer = PacketManager.pack(packet);
        this.managedSocket.write(buffer);
    }

    disconnect(): void {
        if (this.managedSocket) {
            this.managedSocket.destroy();
            this.managedSocket = null;
        }
        this.socket = null;
        this.isConnected = false;
    }

    get connected(): boolean {
        return this.isConnected;
    }
}

export { PipeServer, PipeClient, PacketManager, ResponseHelper, BufferManager };