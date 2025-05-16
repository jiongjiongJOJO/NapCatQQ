/*!
 * on-finished
 * Copyright(c) 2013 Jonathan Ong
 * Copyright(c) 2014 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * 定义消息对象接口
 */
interface Message {
    socket?: Socket;
    finished?: boolean;
    complete?: boolean;
    readable?: boolean;
    upgrade?: boolean;
    __onFinished?: Listener;
    on?: (event: string, callback: (socket: Socket) => void) => void;
    removeListener?: (event: string, callback: Function) => void;
    assignSocket?: (socket: Socket) => void;
}

/**
 * 定义Socket接口
 */
interface Socket {
    writable: boolean;
    readable: boolean;
    on?: (event: string, callback: Function) => void;
    removeListener?: (event: string, callback: Function) => void;
}

/**
 * 事件处理器类型
 */
type EventHandler = (err?: Error) => void;

/**
 * 事件元组: [对象, ...事件名称]
 */
type EventTuple = [unknown, ...string[]];

/**
 * 取消函数类型
 */
interface CancelableListener {
    cancel: () => void;
}

/**
 * 监听器函数类型
 */
type ListenerCallback = (err: Error | null, msg: Message) => void;

/**
 * 修改监听器接口，使其参数类型更通用
 */
interface Listener {
    (err: Error | null | undefined): void;
    queue: ListenerCallback[] | null;
}

/**
 * 模块导出
 * @public
 */
export { onFinished as default, isFinished };

/**
 * 模块依赖
 * @private
 */
const asyncHooks = tryRequireAsyncHooks();

/**
 * 变量
 * @private
 */
const defer = function(fn: ListenerCallback, err: Error | null, msg: Message): void {
    setImmediate(fn, err, msg);
};

/**
 * 实现 ee-first 功能：监听多个事件，当第一个事件触发时执行回调并移除所有监听器
 * @param {Array<EventTuple>} stuff - 事件元组数组
 * @param {EventHandler} done - 完成时的回调
 * @returns {CancelableListener} 可取消的监听器对象
 * @private
 */
function first(stuff: EventTuple[], done: EventHandler): CancelableListener {
    if (!Array.isArray(stuff)) {
        throw new TypeError('参数 "stuff" 必须是数组');
    }

    if (typeof done !== 'function') {
        throw new TypeError('参数 "done" 必须是函数');
    }

    const cleanups: Function[] = [];
    let finished = false;

    // 处理所有传入的对象和事件
    for (const tuple of stuff) {
        if (!Array.isArray(tuple) || tuple.length < 2) {
            throw new TypeError('每个事件元组必须是长度大于等于2的数组');
        }

        const obj = tuple[0];

        if (!obj || typeof obj !== 'object') {
            throw new TypeError('监听目标必须是对象');
        }

        // 使用类型断言确保obj有on和removeListener方法
        const target = obj as { 
            on: (event: string, callback: Function) => void;
            removeListener: (event: string, callback: Function) => void;
        };

        if (typeof target.on !== 'function' || typeof target.removeListener !== 'function') {
            throw new TypeError('监听目标必须支持 on/removeListener 方法');
        }

        const events = tuple.slice(1);

        // 为每个事件创建一个监听器
        for (const event of events) {
            if (typeof event !== 'string') {
                throw new TypeError('事件名称必须是字符串');
            }

            const listener = createEventListener(target, event, cleanup);
            cleanups.push(listener.cleanup);
            target.on(event, listener.callback);
        }
    }

    // 创建可取消的监听器对象
    return {
        cancel: cleanup
    };

    // 清理函数
    function cleanup(): void {
        if (finished) return;
        finished = true;

        // 执行所有清理函数
        for (const cleanup of cleanups) {
            try {
                cleanup();
            } catch (err) {
                console.error('清理事件监听器时出错:', err);
            }
        }
    }

    // 创建单个事件监听器
    function createEventListener(
        obj: { on: Function; removeListener: Function }, 
        event: string, 
        cleanup: Function
    ): {
        callback: (arg?: unknown) => void;
        cleanup: () => void;
    } {
        const callback = (arg?: unknown): void => {
            cleanup();
            done(arg instanceof Error ? arg : undefined);
        };

        return {
            callback,
            cleanup: () => {
                obj.removeListener(event, callback);
            }
        };
    }
}

/**
 * 当响应结束时调用回调，用于资源清理
 *
 * @param {Message} msg
 * @param {ListenerCallback} listener
 * @return {Message}
 * @public
 */
function onFinished(msg: Message, listener: ListenerCallback): Message {
    if (!msg || typeof msg !== 'object') {
        throw new TypeError('参数 "msg" 必须是对象');
    }

    if (typeof listener !== 'function') {
        throw new TypeError('参数 "listener" 必须是函数');
    }

    if (isFinished(msg) !== false) {
        defer(listener, null, msg);
        return msg;
    }

    // 将监听器附加到消息
    attachListener(msg, wrap(listener));

    return msg;
}

/**
 * 确定消息是否已完成
 *
 * @param {Message} msg
 * @return {boolean | undefined}
 * @public
 */
function isFinished(msg: Message): boolean | undefined {
    if (!msg || typeof msg !== 'object') {
        throw new TypeError('参数 "msg" 必须是对象');
    }

    const socket = msg.socket;

    if (typeof msg.finished === 'boolean') {
        // OutgoingMessage
        return Boolean(msg.finished || (socket && !socket.writable));
    }

    if (typeof msg.complete === 'boolean') {
        // IncomingMessage
        return Boolean(msg.upgrade || !socket || !socket.readable || (msg.complete && !msg.readable));
    }

    // 不确定状态
    return undefined;
}

/**
 * 将完成监听器附加到消息
 *
 * @param {Message} msg
 * @param {Function} callback
 * @private
 */
function attachFinishedListener(msg: Message, callback: (error?: Error) => void): void {
    let eeMsg: CancelableListener;
    let eeSocket: CancelableListener;
    let finished = false;

    function onFinish(error?: Error): void {
        if (!eeMsg || !eeSocket) {
            return; // 防御性检查
        }

        eeMsg.cancel();
        eeSocket.cancel();

        finished = true;
        callback(error);
    }

    // 在第一个消息事件上完成
    eeMsg = eeSocket = first([[msg, 'end', 'finish']], onFinish);

    function onSocket(socket: Socket): void {
        // 移除监听器
        if (msg.removeListener && typeof msg.removeListener === 'function') {
            msg.removeListener('socket', onSocket);
        }

        if (finished) return;
        if (eeMsg !== eeSocket) return;

        if (!socket || typeof socket !== 'object') {
            return; // 防御性检查
        }

        // 在第一个socket事件上完成
        eeSocket = first([[socket, 'error', 'close']], onFinish);
    }

    if (msg.socket) {
        // socket已分配
        onSocket(msg.socket);
        return;
    }

    // 等待socket分配
    if (msg.on && typeof msg.on === 'function') {
        msg.on('socket', onSocket);
    }
}

/**
 * 将监听器附加到消息
 *
 * @param {Message} msg
 * @param {ListenerCallback} listener
 * @private
 */
function attachListener(msg: Message, listener: ListenerCallback): void {
    let attached = msg.__onFinished;

    // 创建私有单一监听器和队列
    if (!attached || !attached.queue) {
        attached = msg.__onFinished = createListener(msg);
        attachFinishedListener(msg, attached);
    }

    if (attached.queue) {
        attached.queue.push(listener);
    }
}

/**
 * 在消息上创建监听器
 *
 * @param {Message} msg
 * @return {Listener}
 * @private
 */
function createListener(msg: Message): Listener {
    const listener: Listener = function listener(err: Error | null | undefined): void {
        if (msg.__onFinished === listener) msg.__onFinished = undefined;
        if (!listener.queue) return;

        const queue = listener.queue;
        listener.queue = null;

        for (let i = 0; i < queue.length; i++) {
            queue[i]?.(err || null, msg);
        }
    };

    listener.queue = [];

    return listener;
}

/**
 * 尝试引入async_hooks
 * @private
 */
function tryRequireAsyncHooks(): { AsyncResource?: typeof import('async_hooks').AsyncResource } {
    try {
        return require('async_hooks');
    } catch (e) {
        return {};
    }
}

/**
 * 如果可能，用async resource包装函数
 * @private
 */
function wrap(fn: ListenerCallback): ListenerCallback {
    if (typeof fn !== 'function') {
        throw new TypeError('参数必须是函数');
    }

    // Node.js 16+ 总是有 AsyncResource
    if (!asyncHooks.AsyncResource) {
        return fn;
    }

    // 创建匿名资源
    const res = new asyncHooks.AsyncResource(fn.name || 'bound-anonymous-fn');

    // 返回绑定函数
    return (res.runInAsyncScope.bind(res, fn, null) as ListenerCallback);
}