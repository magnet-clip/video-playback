export const BUFFER = 5;

export interface ICache<T> {
    push(data: T): Promise<void>;
    get(idx: number, once: boolean): Promise<T>;
    get length(): number;
}

export class PlainCache<T> implements ICache<T> {
    private frames: T[] = [];

    public async push(data: T): Promise<void> {
        this.frames.push(data);
    }

    public async get(idx: number, once: boolean): Promise<T> {
        return this.frames[(idx + this.frames.length) % this.frames.length];
    }

    public get length(): number {
        return this.frames.length;
    }
}

export interface IBuffer<T> {
    push(data: T): Promise<void>;
    get(idx: number, once: boolean): Promise<T>;
    get length(): number;
}

export class CachedBuffer<T> implements IBuffer<T> {
    constructor(private frames: ICache<T>) {}

    public async push(data: T): Promise<void> {
        this.frames.push(data);
    }

    public async get(idx: number, once: boolean): Promise<T> {
        return this.frames.get((idx + this.frames.length) % this.frames.length, once);
    }

    public get length(): number {
        return this.frames.length;
    }
}

// export class PlainBuffer<T> implements IBuffer<T> {
//     private frames: T[] = [];

//     public async push(data: T): Promise<void> {
//         this.frames.push(data);
//     }

//     public async get(idx: number, _once: boolean): Promise<T> {
//         return this.frames[(idx + this.frames.length) % this.frames.length];
//     }

//     public get length(): number {
//         return this.frames.length;
//     }
// }
