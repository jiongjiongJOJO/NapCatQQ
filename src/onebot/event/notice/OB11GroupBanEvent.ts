import { OB11GroupNoticeEvent } from './OB11GroupNoticeEvent';
import { NapCatCore } from '@/core';

export class OB11GroupBanEvent extends OB11GroupNoticeEvent {
    notice_type = 'group_ban';
    operator_id: string;
    duration: number;
    sub_type: 'ban' | 'lift_ban';

    constructor(core: NapCatCore, groupId: string, userId: string, operatorId: string, duration: number, sub_type: 'ban' | 'lift_ban') {
        super(core, groupId, userId);
        this.group_id = groupId;
        this.operator_id = operatorId;
        this.user_id = userId;
        this.duration = duration;
        this.sub_type = sub_type;
    }
}
