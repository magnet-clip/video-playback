import { IDBPDatabase } from "idb";

export interface IStorage<T> {
    init(count: number): void;
    getRange(from: number, to: number): AsyncGenerator<T, undefined, void>;
    push(idx: number, data: T): Promise<void>;
    get(idx: number): Promise<T>;
    get length(): number;
}

// - filesystem api (?)

export class PlainStorage<T> implements IStorage<T> {
    private items: T[] = [];

    public init() {}

    public async *getRange(from: number, to: number): AsyncGenerator<T, undefined, void> {
        from = (from + this.items.length) % this.items.length;
        to = (to + this.items.length) % this.items.length;
        if (from <= to) {
            for (let i = from; i <= to; i++) {
                yield this.items[i];
            }
        } else {
            // TODO reverse order?
            for (let i = from; i < this.items.length; i++) {
                yield this.items[i];
            }
            for (let i = 0; i <= to; i++) {
                yield this.items[i];
            }
        }
    }

    public async push(idx: number, data: T): Promise<void> {
        this.items[idx] = data;
    }

    public async get(idx: number): Promise<T> {
        return this.items[(idx + this.items.length) % this.items.length];
    }

    public get length() {
        return this.items.length;
    }
}

export class IndexedDBStorage<T> implements IStorage<T> {
    private count = 0;

    public init(count: number) {
        this.count = count;
    }

    public static addTableMigration(db: IDBPDatabase, name: string) {
        const videoInfo = db.createObjectStore(name, {
            keyPath: "idx",
        });
        videoInfo.createIndex("idx", "idx");
        videoInfo.createIndex("ridx", "ridx");
    }

    constructor(private db: IDBPDatabase, private table: string) {
        db.clear(table);
    }

    public async push(idx: number, data: T): Promise<void> {
        this.count += 1;
        await this.db.add(this.table, { idx, ridx: this.count - idx, content: data });
    }

    public async get(idx: number): Promise<T> {
        const res = await this.db.get(this.table, (idx + this.count) % this.count);
        return res?.content as T;
    }

    public async *getRange(from: number, to: number): AsyncGenerator<T, undefined, void> {
        const count = this.count;
        from = (from + count) % count;
        to = (to + count) % count;
        const t = this.db.transaction(this.table, "readonly");
        if (from <= to) {
            for await (const item of t.store.index("idx").iterate(IDBKeyRange.bound(from, to))) {
                yield item.value.content;
            }
        } else {
            // TODO: reversed order?
            for await (const item of t.store.index("idx").iterate(IDBKeyRange.bound(from, count - 1))) {
                yield item.value.content;
            }
            for await (const item of t.store.index("idx").iterate(IDBKeyRange.bound(0, to))) {
                yield item.value.content;
            }
        }
    }

    get length(): number {
        return this.count;
    }
}
