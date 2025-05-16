import { OneBotAction } from '@/onebot/action/OneBotAction';
import { ActionName } from '@/onebot/action/router';
import { Static, Type } from '@sinclair/typebox';

const SchemaData = Type.Object({
    face_id: Type.String(),// 参考 face_config.json 的 QSid
    face_type: Type.String({ default: '1' }),
    wording: Type.String({ default: ' ' }),
});

type Payload = Static<typeof SchemaData>;

export class SetDiyOnlineStatus extends OneBotAction<Payload, string> {
    override actionName = ActionName.SetDiyOnlineStatus;
    override payloadSchema = SchemaData;

    async _handle(payload: Payload) {
        const ret = await this.core.apis.UserApi.setDiySelfOnlineStatus(
            payload.face_id,
            payload.wording,
            payload.face_type,
        );
        if (ret.result !== 0) {
            throw new Error('设置在线状态失败');
        }
        return ret.errMsg;
    }
}
