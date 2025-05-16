import { OB11BaseNoticeEvent } from './OB11BaseNoticeEvent';
import { NapCatCore } from '@/core';

export abstract class OB11GroupNoticeEvent extends OB11BaseNoticeEvent {
    group_id: string;
    user_id: string;

    constructor(core: NapCatCore, group_id: string, user_id: string) {
        super(core);
        this.group_id = group_id;
        this.user_id = user_id;
    }
}
