import { OB11GroupNoticeEvent } from './OB11GroupNoticeEvent';
import { NapCatCore } from '@/core';

export class OB11GroupRecallNoticeEvent extends OB11GroupNoticeEvent {
    notice_type = 'group_recall';
    operator_id: string;
    message_id: string;

    constructor(core: NapCatCore, groupId: string, userId: string, operatorId: string, messageId: string) {
        super(core, groupId, userId);
        this.group_id = groupId;
        this.user_id = userId;
        this.operator_id = operatorId;
        this.message_id = messageId;
    }
}
