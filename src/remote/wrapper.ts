import { NodeIKernelLoginService, NodeIQQNTWrapperEngine, NodeIQQNTWrapperSession, NodeQQNTWrapperUtil, WrapperNodeApi } from "@/core";
import { NodeIO3MiscService } from "@/core/services/NodeIO3MiscService";
import { dirname } from "path";
import { fileURLToPath } from "url";

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
            let current_path = dirname(fileURLToPath(import.meta.url));
            return current_path;
        }
    } as NodeQQNTWrapperUtil,
    NodeIQQNTWrapperSession: {} as NodeIQQNTWrapperSession,
    NodeIQQNTWrapperEngine: {} as NodeIQQNTWrapperEngine,
    NodeIKernelLoginService: {} as NodeIKernelLoginService,
};