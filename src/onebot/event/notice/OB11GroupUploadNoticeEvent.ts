import { OB11GroupNoticeEvent } from './OB11GroupNoticeEvent';
import { NapCatCore } from '@/core';

export interface GroupUploadFile {
    id: string,
    name: string,
    size: number,
    busid: number,
}

export class OB11GroupUploadNoticeEvent extends OB11GroupNoticeEvent {
    notice_type = 'group_upload';
    file: GroupUploadFile;

    constructor(core: NapCatCore, groupId: string, userId: string, file: GroupUploadFile) {
        super(core, groupId, userId);
        this.group_id = groupId;
        this.user_id = userId;
        this.file = file;
    }
}
