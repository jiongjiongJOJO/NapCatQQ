import { NapCatOneBot11Adapter, OB11Message, OB11MessageDataType } from '@/onebot';
import { NapCatCore } from '@/core';
import { ActionMap } from '@/onebot/action';
import { OB11PluginAdapter } from '@/onebot/network/plugin';

export const plugin_onmessage = async (adapter: string, _core: NapCatCore, _obCtx: NapCatOneBot11Adapter, message: OB11Message, action: ActionMap, instance: OB11PluginAdapter) => {
    const id = message.message.find(m => m.type === 'reply')?.data.id;
    if (message.message.find(m => m.type === 'text' && m.data.text === '/取') && id) {
        let ori_msg = await action.get('get_msg')?.handle({ message_id: id }, adapter, instance.config);
        await action.get('send_group_msg')?.handle({
            group_id: String(message.group_id), message: [
                {
                    type: OB11MessageDataType.node,
                    data: {
                        user_id: String(message.user_id),
                        nickname: message.sender?.nickname || 'unknown',
                        name: message.sender?.nickname || 'unknown',
                        content: [
                            {
                                type: OB11MessageDataType.text,
                                data: {
                                    text: JSON.stringify(ori_msg?.data),
                                },
                            }
                        ],
                    },
                }, {
                    type: OB11MessageDataType.node,
                    data: {
                        user_id: String(message.user_id),
                        nickname: message.sender?.nickname || 'unknown',
                        name: message.sender?.nickname || 'unknown',
                        content: [
                            {
                                type: OB11MessageDataType.text,
                                data: {
                                    text: JSON.stringify(ori_msg?.data?.message),
                                },
                            }
                        ],
                    },
                }
            ]
        }, adapter, instance.config);
    }
};
