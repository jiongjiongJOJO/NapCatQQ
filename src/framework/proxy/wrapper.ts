import { NodeIKernelLoginService, NodeIQQNTWrapperEngine, NodeIQQNTWrapperSession, NodeQQNTWrapperUtil, WrapperNodeApi } from "@/core";
import { NodeIO3MiscService } from "@/core/services/NodeIO3MiscService";

export const LocalVirtualWrapper: WrapperNodeApi = {
    NodeIO3MiscService: {
        get: () => LocalVirtualWrapper.NodeIO3MiscService,
        addO3MiscListener: () => 0,
        setAmgomDataPiece: () => { },
        reportAmgomWeather: () => { },
    } as NodeIO3MiscService,
    NodeQQNTWrapperUtil: {
        get: () => LocalVirtualWrapper.NodeQQNTWrapperUtil,
        getNTUserDataInfoConfig: function (): string {
            throw new Error("Function not implemented.");
        }
    } as NodeQQNTWrapperUtil,
    NodeIQQNTWrapperSession: {} as NodeIQQNTWrapperSession,
    NodeIQQNTWrapperEngine: {} as NodeIQQNTWrapperEngine,
    NodeIKernelLoginService: {} as NodeIKernelLoginService,
};