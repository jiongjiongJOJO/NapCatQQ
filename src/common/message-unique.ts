import { Peer } from '@/core';
export class LimitedHashTable<K, V> {
    private readonly keyToValue: Map<K, V> = new Map();
    private readonly valueToKey: Map<V, K> = new Map();
    private maxSize: number;

    constructor(maxSize: number) {
        this.maxSize = maxSize;
    }

    resize(count: number) {
        this.maxSize = count;
    }

    set(key: K, value: V): void {
        this.keyToValue.set(key, value);
        this.valueToKey.set(value, key);
        while (this.keyToValue.size !== this.valueToKey.size) {
            this.keyToValue.clear();
            this.valueToKey.clear();
        }
        while (this.keyToValue.size > this.maxSize || this.valueToKey.size > this.maxSize) {
            const oldestKey = this.keyToValue.keys().next().value;
            if (oldestKey !== undefined) {
                this.valueToKey.delete(this.keyToValue.get(oldestKey) as V);
                this.keyToValue.delete(oldestKey);
            }
        }
    }

    getValue(key: K): V | undefined {
        return this.keyToValue.get(key);
    }

    getKey(value: V): K | undefined {
        return this.valueToKey.get(value);
    }

    deleteByValue(value: V): void {
        const key = this.valueToKey.get(value);
        if (key !== undefined) {
            this.keyToValue.delete(key);
            this.valueToKey.delete(value);
        }
    }

    deleteByKey(key: K): void {
        const value = this.keyToValue.get(key);
        if (value !== undefined) {
            this.keyToValue.delete(key);
            this.valueToKey.delete(value);
        }
    }

    getKeyList(): K[] {
        return Array.from(this.keyToValue.keys());
    }

    //获取最近刚写入的几个值
    getHeads(size: number): { key: K; value: V }[] | undefined {
        const keyList = this.getKeyList();
        if (keyList.length === 0) {
            return undefined;
        }
        const result: { key: K; value: V }[] = [];
        const listSize = Math.min(size, keyList.length);
        for (let i = 0; i < listSize; i++) {
            const key = keyList[listSize - i];
            if (key !== undefined) {
                result.push({ key, value: this.keyToValue.get(key)! });
            }

        }
        return result;
    }
}

class MessageUniqueWrapper {
    constructor() {
    }

    getOutputData(peer: Peer, msg_id: string, seq: string): string {
        return `${peer.chatType}|${msg_id}|${peer.peerUid}|${seq}`;
    }

    getInnerData(shortId: string): { MsgId: string; Peer: Peer, seq: string } | undefined {
        const [chatType, msgId, peerUid, seq] = shortId.split('|');
        if (!chatType || !msgId || !peerUid || !seq) {
            return undefined;
        }
        return { MsgId: msgId, Peer: { chatType: parseInt(chatType), peerUid, guildId: '' }, seq: seq };
    }
}

export const MessageUnique: MessageUniqueWrapper = new MessageUniqueWrapper();
