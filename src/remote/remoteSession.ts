import { createRemoteServiceClient } from "@/remote/service";
import {
    NodeIQQNTWrapperSession,
    WrapperSessionInitConfig
} from "../core/wrapper";
import { NodeIKernelSessionListener } from "../core/listeners/NodeIKernelSessionListener";
import {
    NodeIDependsAdapter,
    NodeIDispatcherAdapter
} from "../core/adapters";
import { ServiceNamingMapping } from "@/core";

class RemoteServiceManager {
    private services: Map<string, any> = new Map();
    private handler;

    constructor(handler: (client: any, listenerCommand: string, ...args: any[]) => Promise<any>) {
        this.handler = handler;
    }
    private createRemoteService<T extends keyof ServiceNamingMapping>(
        serviceName: T
    ): ServiceNamingMapping[T] {
        if (this.services.has(serviceName)) {
            return this.services.get(serviceName);
        }

        let serviceClient: any;
        serviceClient = createRemoteServiceClient(serviceName, async (serviceCommand, ...args) => {
            return await this.handler(serviceClient, serviceCommand, ...args);
        });

        this.services.set(serviceName, serviceClient.object);
        return serviceClient.object;
    }

    getService<T extends keyof ServiceNamingMapping>(
        serviceName: T
    ): ServiceNamingMapping[T] {
        return this.createRemoteService(serviceName);
    }

}
export class RemoteWrapperSession implements NodeIQQNTWrapperSession {
    private serviceManager: RemoteServiceManager;

    constructor(handler: (client: { object: keyof ServiceNamingMapping, receiverListener: (command: string, ...args: any[]) => void }, listenerCommand: string, ...args: any[]) => Promise<void>) {
        this.serviceManager = new RemoteServiceManager(handler);
    }

    create(): RemoteWrapperSession {
        return this;
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