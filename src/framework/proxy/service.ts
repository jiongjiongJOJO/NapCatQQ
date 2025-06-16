import { FuncKeys, NTEventWrapper } from "@/common/event";
import { ServiceNamingMapping } from "@/core";

export type ServiceMethodCommand = {
    [Service in keyof ServiceNamingMapping]: `${Service}/${FuncKeys<ServiceNamingMapping[Service]>}`
}[keyof ServiceNamingMapping];

const LISTENER_COMMAND_PATTERN = /\/addKernel\w*Listener$/;

function isListenerCommand(command: ServiceMethodCommand): boolean {
    return LISTENER_COMMAND_PATTERN.test(command);
}

export function createRemoteServiceServer<T extends keyof ServiceNamingMapping>(
    serviceName: T,
    ntevent: NTEventWrapper,
    callback: (command: ServiceMethodCommand, ...args: any[]) => Promise<any>
): ServiceNamingMapping[T] {
    return new Proxy(() => { }, {
        get: (_target: any, functionName: string) => {
            const command = `${serviceName}/${functionName}` as ServiceMethodCommand;
            if (isListenerCommand(command)) {
                return async (..._args: any[]) => {
                    const listener = new Proxy(new class { }(), {
                        apply: (_target, _thisArg, _arguments) => {
                            return callback(command, ..._arguments);
                        }
                    });
                    return await (ntevent.callNoListenerEvent as any)(command, listener);
                };
            }
            return async (...args: any[]) => {
                return await (ntevent.callNoListenerEvent as any)(command, ...args);
            };
        }
    });
}


// 避免重复远程注册 多份传输会消耗很大
export const listenerCmdRegisted = new Map<ServiceMethodCommand, boolean>();
// 已经注册的Listener实例托管
export const clientCallback = new Map<string, (...args: any[]) => Promise<any>>();
export async function handleServiceServerOnce(
    command: ServiceMethodCommand,// 服务注册命令
    recvListener: (command: string, ...args: any[]) => Promise<any>,//listener监听器
    ntevent: NTEventWrapper,// 事件处理器
    ...args: any[]//实际参数
) {
    if (isListenerCommand(command)) {
        if (!listenerCmdRegisted.has(command)) {
            listenerCmdRegisted.set(command, true);
            return (ntevent.callNoListenerEvent as any)(command, new Proxy(new class { }(), {
                get: (_target: any, prop: string) => {
                    return async (..._args: any[]) => {
                        let listenerCmd = `${command.split('/')[0]}/${prop}`;
                        recvListener(listenerCmd, ..._args);
                    };
                }
            }));
        }
        return 0;
    }
    return await (ntevent.callNoListenerEvent as (command: ServiceMethodCommand, ...args: any[]) => Promise<any>)(command, ...args);
}

export function createRemoteServiceClient<T extends keyof ServiceNamingMapping>(
    serviceName: T,
    receiverEvent: (command: ServiceMethodCommand, ...args: any[]) => Promise<any>
) {
    const object = new Proxy(() => { }, {
        get: (_target: any, functionName: string) => {
            const command = `${serviceName}/${functionName}` as ServiceMethodCommand;
            if (isListenerCommand(command)) {
                if (!clientCallback.has(command)) {
                    return async (listener: Record<string, any>) => {
                        // 遍历 listener
                        for (const key in listener) {
                            if (typeof listener[key] === 'function') {
                                const listenerCmd = `${command.split('/')[0]}/${key}`;
                                clientCallback.set(listenerCmd, listener[key].bind(listener));
                            }
                        }
                        return await receiverEvent(command);
                    };
                }
            }
            return async (...args: any[]) => {
                return await receiverEvent(command, ...args);
            };
        }
    });

    const receiverListener = function (command: string, ...args: any[]) {
        return clientCallback.get(command)?.(...args);
    };
    return { receiverListener: receiverListener, object: object as ServiceNamingMapping[T] };
}


export function clearServiceState() {
    listenerCmdRegisted.clear();
    clientCallback.clear();
}