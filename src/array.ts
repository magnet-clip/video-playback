export const BUFFER = 15;
export const THRESHOLD = 5;

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
    private frames: Record<number, T> = {};

    constructor(private storage: IStorage<T>) {}

    private get count() {
        return Object.keys(this.frames).length;
    }

    private position(v: number) {
        return Object.keys(this.frames)
            .map((v) => +v)
            .indexOf(v);
    }

    private get start() {
        return +Object.keys(this.frames)[0];
    }

    private get end() {
        return +Object.keys(this.frames)[this.count - 1];
    }

    private async prefetch(idx: number) {
        if (idx in this.frames) {
            const poss = this.position(idx);

            if (this.direction > 0) {
                const delta = this.count - poss;
                if (delta < THRESHOLD) {
                    const newEnd = this.clamp(this.end + delta);
                    let endPos = this.end + 1;
                    if (newEnd > this.end) {
                        for await (const t of this.storage.getRange(this.end + 1, newEnd)) {
                            this.frames[endPos++] = t;
                            if (this.count > 2 * BUFFER + 1) delete this.frames[this.start];
                        }
                    }
                }
            } else {
                const delta = poss;
                if (delta < THRESHOLD) {
                    const newStart = this.clamp(this.start - delta);
                    let startPos = newStart;
                    if (newStart < this.start) {
                        for await (const t of this.storage.getRange(newStart, this.start - 1)) {
                            this.frames[startPos++] = t;
                            if (this.count > 2 * BUFFER + 1) delete this.frames[this.end];
                        }
                    }
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
        this.frames = [];
        let start = this.clamp(idx - BUFFER);
        let end = this.clamp(idx + BUFFER);
        console.log(`Init: reading frames around ${idx}: from ${start} to ${end}`);
        let pos = start;
        for await (const t of this.storage.getRange(start, end)) {
            this.frames[pos++] = t;
        }
    }

    public async get(idx: number, once: boolean): Promise<T> {
        if (!once) {
            await this.prefetch(idx);
            console.log(`${idx} / ${this.count}`);
            const res = this.frames[idx];
            // if (res.timestamp / 40000 !== idx) {
            //     console.error("AAA ", idx);
            //     debugger;
            // }
            return res;
        } else {
            if (idx in this.frames) {
                return this.frames[idx];
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

// export class StorageCache<T> implements ICache<T> {
//     private frames: Record<number, T> = {}; // indexed from -BUFFER to BUFFER
//     private center = 0;
//     private direction: -1 | 1 = 1;

//     constructor(private storage: IStorage<T>) {}

//     public async setDirection(d: -1 | 1) {
//         await this.init();
//         this.direction = d;
//     }

//     public async init() {
//         console.log(`Init around ${this.center}`);
//         let i = -BUFFER + this.center;
//         this.frames = [];
//         for await (const t of this.storage.getRange(-BUFFER + this.center, BUFFER + this.center)) {
//             this.set(i++, t);
//         }
//     }

//     private get count() {
//         return Object.keys(this.frames).length;
//     }

//     private set(idx: number, value: T) {
//         const key = (idx + this.storage.length) % this.storage.length;
//         if (key in this.frames) {
//             console.error(`Setting existing item @ ${key}`);
//             debugger;
//         }
//         this.frames[key] = value;
//     }

//     private del(idx: number) {
//         const key = (idx + this.storage.length) % this.storage.length;
//         if (!(key in this.frames)) {
//             console.error(`Deleting non-existing item @ ${key}`);
//             debugger;
//         }
//         delete this.frames[key];
//     }

//     private async prefetch(idx: number) {
//         if (this.count !== 2 * BUFFER + 1) {
//             console.error(`Precheck: invalid buffer state: expected ${2 * BUFFER + 1} items, got ${this.count} items`);
//             throw new Error("Invalid amount of records in cache");
//         }

//         if (this.direction > 0) {
//             let delta = idx - this.center;
//             delta = (delta + this.storage.length) % this.storage.length;

//             if (-THRESHOLD < delta && delta < THRESHOLD) return;
//             console.log(`Forward prefetch: center ${this.center}, idx ${idx}, distance ${delta}`);
//             const oldStart = this.center - BUFFER;
//             const newStart = this.center - BUFFER + delta + 1;
//             const oldEnd = this.center + BUFFER;
//             const newEnd = this.center + BUFFER + delta;

//             let start = oldStart;
//             let end = oldEnd + 1;
//             for await (const t of this.storage.getRange(oldEnd + 1, newEnd)) {
//                 this.set(end++, t);
//                 this.del(start++);
//             }
//             this.center = (this.center + delta + this.storage.length) % this.storage.length;
//         } else {
//             let delta = this.center - idx;
//             delta = (delta + this.storage.length) % this.storage.length;

//             if (-THRESHOLD < delta && delta < THRESHOLD) return;
//             console.log(`Backward prefetch: center ${this.center}, idx ${idx}, distance ${delta}`);
//             const oldStart = this.center - BUFFER;
//             const newStart = this.center - BUFFER - delta;
//             const oldEnd = this.center + BUFFER;
//             const newEnd = this.center + BUFFER - delta;

//             let start = newStart;
//             let end = newEnd + 1;
//             for await (const t of this.storage.getRange(newStart, oldStart - 1)) {
//                 this.set(start++, t);
//                 this.del(end++);
//             }
//             this.center = (this.center - delta + this.storage.length) % this.storage.length;
//         }

//         if (this.count !== 2 * BUFFER + 1) {
//             console.error(`Postcheck: Invalid buffer state: expected ${2 * BUFFER + 1} items, got ${this.count} items`);
//             throw new Error("Invalid amount of records in cache");
//         }
//     }

//     public async push(data: T): Promise<void> {
//         this.storage.push(data);
//     }

//     public async get(idx: number, once: boolean): Promise<T> {
//         if (!once) {
//             await this.prefetch(idx);
//             const res = this.frames[idx];
//             // if (res.timestamp / 40000 !== idx) {
//             //     console.error("AAA ", idx);
//             //     debugger;
//             // }
//             return res;
//         } else {
//             // const pos = idx - this.center;
//             // if (pos in this.frames) {
//             //     return this.frames[pos];
//             // } else {
//             this.center = idx;
//             await this.init();
//             return this.frames[idx]; //await this.storage.get(idx);
//             // }
//         }
//     }

//     public get length(): number {
//         return this.storage.length;
//     }
// }

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
