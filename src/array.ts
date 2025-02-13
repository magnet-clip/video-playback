const BUFFER = 15;
const TOTAL = 2 * BUFFER + 1;
const THRESHOLD = 5;

export interface IStorage<T> {
    getRange(from: number, to: number): AsyncGenerator<T, undefined, void>;
    push(data: T): Promise<void>;
    get(idx: number): Promise<T>;
    get length(): number;
}

// implementations
// - plain array
// - idb
// - list of blobs
// - filesystem api (?)

export class PlainStorage<T> implements IStorage<T> {
    private items: T[] = [];

    public async *getRange(from: number, to: number): AsyncGenerator<T, undefined, void> {
        from = (from + this.items.length) % this.items.length;
        to = (to + this.items.length) % this.items.length;
        if (from <= to) {
            for (let i = from; i <= to; i++) {
                yield this.items[i];
            }
        } else {
            for (let i = from; i < this.items.length; i++) {
                yield this.items[i];
            }
            for (let i = 0; i <= to; i++) {
                yield this.items[i];
            }
        }
    }

    public async push(data: T): Promise<void> {
        this.items.push(data);
    }

    public async get(idx: number): Promise<T> {
        return this.items[(idx + this.items.length) % this.items.length];
    }

    public get length() {
        return this.items.length;
    }
}

export interface ICache<T> {
    setDirection(d: -1 | 1): Promise<void>;
    init(): Promise<void>;
    push(data: T): Promise<void>;
    get(idx: number, once: boolean): Promise<T>;
    get length(): number;
}

export class LinearCache<T> implements ICache<T> {
    private direction: -1 | 1 = 1;
    private items: Record<number, T> = {};

    constructor(private storage: IStorage<T>) {}

    private get itemsInCache() {
        return Object.keys(this.items).length;
    }

    private itemPos(v: number) {
        return Object.keys(this.items)
            .map((v) => +v)
            .indexOf(v);
    }

    private get firstIdx() {
        return +Object.keys(this.items)[0];
    }

    private get lastIdx() {
        return +Object.keys(this.items)[this.itemsInCache - 1];
    }

    private async prefetch(idx: number) {
        if (idx in this.items) {
            const position = this.itemPos(idx);

            if (this.direction > 0) {
                const delta = this.itemsInCache - position;
                if (delta >= THRESHOLD) return;

                const newLastIdx = this.clamp(this.lastIdx + BUFFER);
                let p = this.lastIdx + 1;
                if (newLastIdx <= this.lastIdx) return;

                console.log(`Prefetch: fetch from ${this.lastIdx} to ${newLastIdx}`);
                for await (const t of this.storage.getRange(this.lastIdx + 1, newLastIdx)) {
                    this.items[p++] = t;
                    if (this.itemsInCache > TOTAL) delete this.items[this.firstIdx];
                }
            } else {
                const delta = position;
                if (delta >= THRESHOLD) return;

                const newStart = this.clamp(this.firstIdx - BUFFER);
                let p = newStart;
                if (newStart >= this.firstIdx) return;

                console.log(`Prefetch: fetch from ${newStart} to ${this.firstIdx - 1}`);
                for await (const t of this.storage.getRange(newStart, this.firstIdx - 1)) {
                    this.items[p++] = t;
                    if (this.itemsInCache > TOTAL) delete this.items[this.lastIdx];
                }
            }
        } else {
            await this.init(idx);
        }
    }

    public async setDirection(d: -1 | 1): Promise<void> {
        this.direction = d;
    }

    private clamp = (idx: number) => Math.max(Math.min(idx, this.length - 1), 0);

    public async init(idx: number = 0): Promise<void> {
        this.items = [];
        let start = this.clamp(idx - BUFFER);
        let end = this.clamp(idx + BUFFER);
        console.log(`Init: reading frames around ${idx}: from ${start} to ${end}`);
        let pos = start;
        for await (const t of this.storage.getRange(start, end)) {
            this.items[pos++] = t;
        }
    }

    public async get(idx: number, once: boolean): Promise<T> {
        if (!once) {
            await this.prefetch(idx);
            console.log(`${idx} / ${this.itemsInCache}`);
            const res = this.items[idx];
            // if (res.timestamp / 40000 !== idx) {
            //     console.error("AAA ", idx);
            //     debugger;
            // }
            return res;
        } else {
            if (idx in this.items) {
                return this.items[idx];
            } else {
                return await this.storage.get(idx);
            }
        }
    }

    // TODO these 2 can be removed as they proxy storage which is exposed already
    public async push(data: T): Promise<void> {
        await this.storage.push(data);
    }

    public get length(): number {
        return this.storage.length;
    }
}

export class PlainCache<T> implements ICache<T> {
    private frames: T[] = [];

    public async push(data: T): Promise<void> {
        this.frames.push(data);
    }

    public async init() {}

    public async setDirection(d: -1 | 1) {}

    public async get(idx: number, once: boolean): Promise<T> {
        return this.frames[(idx + this.frames.length) % this.frames.length];
    }

    public get length(): number {
        return this.frames.length;
    }
}
