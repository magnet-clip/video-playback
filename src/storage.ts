import { IDBPDatabase } from "idb";

export interface IStorage<T> {
    init(count: number): void;
    getRange(from: number, to: number): AsyncGenerator<T, undefined, void>;
    push(idx: number, data: T): Promise<void>;
    get(idx: number): Promise<T>;
    get length(): number;
}

// - filesystem api (?)

abstract class GenericStorage<T> implements IStorage<T> {
    public abstract init(count: number): void;

    public getRange(from: number, to: number): AsyncGenerator<T, undefined, void> {
        from = (from + this.length) % this.length;
        to = (to + this.length) % this.length;
        if (from <= to) {
            return this.getRangeImpl(from, to);
        } else {
            console.error(`Can't fetch frames in reverse order: ${from} -> ${to}`);
            throw new Error("Invalid frame order");
        }
    }

    protected abstract getRangeImpl(from: number, to: number): AsyncGenerator<T, undefined, void>;

    public abstract push(idx: number, data: T): Promise<void>;
    public abstract get(idx: number): Promise<T>;
    public abstract get length(): number;
}

export class PlainStorage<T> extends GenericStorage<T> {
    private items: T[] = [];

    public init() {}

    public async *getRangeImpl(from: number, to: number): AsyncGenerator<T, undefined, void> {
        from = (from + this.items.length) % this.items.length;
        to = (to + this.items.length) % this.items.length;
        for (let i = from; i <= to; i++) {
            yield this.items[i];
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

export class IndexedDBStorage<T> extends GenericStorage<T> {
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
        super();
        db.clear(table);
    }

    public async push(idx: number, data: T): Promise<void> {
        await this.db.add(this.table, { idx, ridx: this.count - idx, content: data });
    }

    public async get(idx: number): Promise<T> {
        const res = await this.db.get(this.table, (idx + this.count) % this.count);
        return res?.content as T;
    }

    public async *getRangeImpl(from: number, to: number): AsyncGenerator<T, undefined, void> {
        const t = this.db.transaction(this.table, "readonly");
        for await (const item of t.store.index("idx").iterate(IDBKeyRange.bound(from, to))) {
            yield item.value.content;
        }
    }

    get length(): number {
        return this.count;
    }
}
