import { type NTQQCollectionApi } from '@/core/apis/collection';
import { OneBotAction } from '@/onebot/action/OneBotAction';
import { ActionName } from '@/onebot/action/router';
import { Type, Static } from '@sinclair/typebox';

const SchemaData = Type.Object({
    category: Type.Number({ default: 0 }),
    count: Type.Number({ default: 1 }),
});

type Payload = Static<typeof SchemaData>;

export class GetCollectionList extends OneBotAction<Payload, Awaited<ReturnType<NTQQCollectionApi['getAllCollection']>>> {
    override actionName = ActionName.GetCollectionList;
    override payloadSchema = SchemaData;

    async _handle(payload: Payload) {
        return await this.core.apis.CollectionApi.getAllCollection(+payload.category, +payload.count);
    }
}
