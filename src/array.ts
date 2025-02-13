export const BUFFER = 5;
export type Dir = -1 | 1;

export interface ICache<T> {}

// export class IDBCache<T> implements ICache<T> {}

export interface IBuffer<T> {
    add(data: T): Promise<void>;
    get(idx: number, once: boolean): Promise<T>;
    get length(): number;
}

export class PlainBuffer<T> implements IBuffer<T> {
    private frames: T[] = [];
    public async add(data: T): Promise<void> {
        this.frames.push(data);
    }
    public async get(idx: number, once: boolean): Promise<T> {
        return this.frames[(idx + this.frames.length) % this.frames.length];
    }
    public get length(): number {
        return this.frames.length;
    }
}
