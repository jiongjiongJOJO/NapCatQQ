import { OB11BaseNoticeEvent } from './OB11BaseNoticeEvent';
import { NapCatCore } from '@/core';

export class OB11FriendRecallNoticeEvent extends OB11BaseNoticeEvent {
    notice_type = 'friend_recall';
    user_id: string;
    message_id: string;

    public constructor(core: NapCatCore, userId: string, messageId: string) {
        super(core);
        this.user_id = userId;
        this.message_id = messageId;
    }
}
