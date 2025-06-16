import { NTEventWrapper } from "@/common/event";
import { createVirtualServiceClient } from "@/framework/proxy/service";
import { handleServiceServerOnce } from "@/framework/proxy/service";
import { ServiceMethodCommand } from "@/framework/proxy/service";
import {
    NodeIQQNTWrapperSession,
    WrapperSessionInitConfig
} from "./wrapper";
import { NodeIKernelSessionListener } from "./listeners/NodeIKernelSessionListener";
import {
    NodeIDependsAdapter,
    NodeIDispatcherAdapter
} from "./adapters";
import superjson from "superjson";

class VirtualServiceManager {
    private services: Map<string, any> = new Map();
    private eventWrapper: NTEventWrapper;

    constructor(eventWrapper: NTEventWrapper) {
        this.eventWrapper = eventWrapper;
    }

    /**
     * 创建虚拟服务实例
     */
    private createVirtualService<T extends keyof import("@/core/services").ServiceNamingMapping>(
        serviceName: T
    ): import("@/core/services").ServiceNamingMapping[T] {
        if (this.services.has(serviceName)) {
            return this.services.get(serviceName);
        }

        const serviceClient = createVirtualServiceClient(serviceName, async (serviceCommand, ...args) => {
            const call_dto = superjson.stringify({ command: serviceCommand, params: args });
            const call_data = superjson.parse<{ command: ServiceMethodCommand; params: any[] }>(call_dto);

            return handleServiceServerOnce(
                call_data.command,
                async (listenerCommand: string, ...args: any[]) => {
                    const listener_dto = superjson.stringify({ command: listenerCommand, params: args });
                    const listener_data = superjson.parse<{ command: string; params: any[] }>(listener_dto);
                    serviceClient.receiverListener(listener_data.command, ...listener_data.params);
                },
                this.eventWrapper,
                ...call_data.params
            );
        });

        this.services.set(serviceName, serviceClient.object);
        return serviceClient.object;
    }

    /**
     * 获取或创建服务实例
     */
    getService<T extends keyof import("@/core/services").ServiceNamingMapping>(
        serviceName: T
    ): import("@/core/services").ServiceNamingMapping[T] {
        return this.createVirtualService(serviceName);
    }
}

/**
 *
 * NodeIQQNTWrapperSession 的行为
 */
export class VirtualWrapperSession implements NodeIQQNTWrapperSession {
    private serviceManager: VirtualServiceManager;

    constructor(eventWrapper: NTEventWrapper) {
        this.serviceManager = new VirtualServiceManager(eventWrapper);
    }

    create(): NodeIQQNTWrapperSession {
        return new VirtualWrapperSession(this.serviceManager['eventWrapper']);
    }

    init(
        _wrapperSessionInitConfig: WrapperSessionInitConfig,
        _nodeIDependsAdapter: NodeIDependsAdapter,
        _nodeIDispatcherAdapter: NodeIDispatcherAdapter,
        _nodeIKernelSessionListener: NodeIKernelSessionListener,
    ): void {
    }

    startNT(_session?: number): void {
    }
    getBdhUploadService() { return null; }
    getECDHService() { return this.serviceManager.getService('NodeIKernelECDHService'); }
    getMsgService() { return this.serviceManager.getService('NodeIKernelMsgService'); }
    getProfileService() { return this.serviceManager.getService('NodeIKernelProfileService'); }
    getProfileLikeService() { return this.serviceManager.getService('NodeIKernelProfileLikeService'); }
    getGroupService() { return this.serviceManager.getService('NodeIKernelGroupService'); }
    getStorageCleanService() { return this.serviceManager.getService('NodeIKernelStorageCleanService'); }
    getBuddyService() { return this.serviceManager.getService('NodeIKernelBuddyService'); }
    getRobotService() { return this.serviceManager.getService('NodeIKernelRobotService'); }
    getTicketService() { return this.serviceManager.getService('NodeIKernelTicketService'); }
    getTipOffService() { return this.serviceManager.getService('NodeIKernelTipOffService'); }
    getNodeMiscService() { return this.serviceManager.getService('NodeIKernelNodeMiscService'); }
    getRichMediaService() { return this.serviceManager.getService('NodeIKernelRichMediaService'); }
    getMsgBackupService() { return this.serviceManager.getService('NodeIKernelMsgBackupService'); }
    getAlbumService() { return this.serviceManager.getService('NodeIKernelAlbumService'); }
    getTianShuService() { return this.serviceManager.getService('NodeIKernelTianShuService'); }
    getUnitedConfigService() { return this.serviceManager.getService('NodeIKernelUnitedConfigService'); }
    getSearchService() { return this.serviceManager.getService('NodeIKernelSearchService'); }
    getDirectSessionService() { return null; }
    getRDeliveryService() { return null; }
    getAvatarService() { return this.serviceManager.getService('NodeIKernelAvatarService'); }
    getFeedChannelService() { return null; }
    getYellowFaceService() { return null; }
    getCollectionService() { return this.serviceManager.getService('NodeIKernelCollectionService'); }
    getSettingService() { return null; }
    getQiDianService() { return null; }
    getFileAssistantService() { return this.serviceManager.getService('NodeIKernelFileAssistantService'); }
    getGuildService() { return null; }
    getSkinService() { return null; }
    getTestPerformanceService() { return this.serviceManager.getService('NodeIkernelTestPerformanceService'); }
    getQQPlayService() { return null; }
    getDbToolsService() { return this.serviceManager.getService('NodeIKernelDbToolsService'); }
    getUixConvertService() { return this.serviceManager.getService('NodeIKernelUixConvertService'); }
    getOnlineStatusService() { return this.serviceManager.getService('NodeIKernelOnlineStatusService'); }
    getRemotingService() { return null; }
    getGroupTabService() { return null; }
    getGroupSchoolService() { return null; }
    getLiteBusinessService() { return null; }
    getGuildMsgService() { return null; }
    getLockService() { return null; }
    getMSFService() { return this.serviceManager.getService('NodeIKernelMSFService'); }
    getGuildHotUpdateService() { return null; }
    getAVSDKService() { return null; }
    getRecentContactService() { return this.serviceManager.getService('NodeIKernelRecentContactService'); }
    getConfigMgrService() { return null; }
}

/**
 * 创建完全虚拟的QQ NT会话
 * @param eventWrapper 事件包装器
 * @returns 虚拟会话实例
 */
export function createVirtualSession(eventWrapper: NTEventWrapper): NodeIQQNTWrapperSession {
    return new VirtualWrapperSession(eventWrapper) as NodeIQQNTWrapperSession;
}
