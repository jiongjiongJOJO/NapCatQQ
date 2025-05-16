import { ActionName } from '@/onebot/action/router';
import { OneBotAction } from '@/onebot/action/OneBotAction';
import { MessageUnique } from '@/common/message-unique';
import { Static, Type } from '@sinclair/typebox';

const SchemaData = Type.Object({
    message_id: Type.String(),
});

type Payload = Static<typeof SchemaData>;

class DeleteMsg extends OneBotAction<Payload, void> {
    override actionName = ActionName.DeleteMsg;
    override payloadSchema = SchemaData;

    async _handle(payload: Payload) {
        const msg = MessageUnique.getInnerData(payload.message_id);
        if (msg) {
            await this.core.apis.MsgApi.recallMsg(msg.Peer, msg.MsgId);
        } else {
            throw new Error('Recall failed');
        }
    }
}

export default DeleteMsg;
