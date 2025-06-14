import { FuncKeys, NTEventWrapper } from "@/common/event";
import { ServiceNamingMapping } from "@/core";

type ServiceMethodCommand = {
    [Service in keyof ServiceNamingMapping]: `${Service}/${FuncKeys<ServiceNamingMapping[Service]>}`
}[keyof ServiceNamingMapping];

export const RegisterListenerCmd: Array<ServiceMethodCommand> = [
    'NodeIKernelMsgService/addKernelMsgListener',
    'NodeIKernelGroupService/addKernelGroupListener',
    'NodeIKernelProfileLikeService/addKernelProfileLikeListener',
    'NodeIKernelProfileService/addKernelProfileListener',
    'NodeIKernelBuddyService/addKernelBuddyListener',
];

export function createVirtualServiceServer<T extends keyof ServiceNamingMapping>(
    serviceName: T,
    ntevent: NTEventWrapper,
    callback: (command: ServiceMethodCommand, ...args: any[]) => Promise<any>
): ServiceNamingMapping[T] {
    return new Proxy(() => { }, {
        get: (_target: any, functionName: string) => {
            const command = `${serviceName}/${functionName}` as ServiceMethodCommand;
            if (RegisterListenerCmd.includes(command as ServiceMethodCommand)) {
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

// 问题2: 全局状态管理可能导致内存泄漏和状态污染
export const listenerCmdRegisted = new Map<ServiceMethodCommand, boolean>();
export const clientCallback = new Map<string, (command: string, ...args: any[]) => Promise<any>>();
export async function handleServiceServerOnce(
    command: ServiceMethodCommand,// 服务注册命令
    recvListener: (command: string, ...args: any[]) => Promise<any>,//listener监听器
    ntevent: NTEventWrapper,// 事件处理器
    ...args: any[]//实际参数
) {
    if (RegisterListenerCmd.includes(command)) {
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
    console.log('handleServiceServerOnce', command, 'args', args);
    console.log('params', args);
    return await (ntevent.callNoListenerEvent as (command: ServiceMethodCommand, ...args: any[]) => Promise<any>)(command, ...args);
}

export function createVirtualServiceClient<T extends keyof ServiceNamingMapping>(
    serviceName: T,
    receiverEvent: (command: ServiceMethodCommand, ...args: any[]) => Promise<any>
) {
    const object = new Proxy(() => { }, {
        get: (_target: any, functionName: string) => {
            const command = `${serviceName}/${functionName}` as ServiceMethodCommand;
            if (RegisterListenerCmd.includes(command as ServiceMethodCommand)) {
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
        return clientCallback.get(command)?.(command, ...args);
    };
    return { receiverListener: receiverListener, object: object as ServiceNamingMapping[T] };
}

// 建议添加清理函数
export function clearServiceState() {
    listenerCmdRegisted.clear();
    clientCallback.clear();
}