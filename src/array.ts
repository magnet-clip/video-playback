export const BUFFER = 30;
export type Dir = -1 | 1;

export class TwoWayArr<T> {
    private array: T[] = [];
    private pos = 0;
    private dir: Dir = 1;

    constructor(private destruct: (v: T) => void = null) {}

    public set direction(value: Dir) {
        if (!value) return;
        if (this.dir !== value) {
            this.dir = value;
            // TODO
        }
    }

    public get direction() {
        return this.dir;
    }

    public push(t: T) {
        // console.log(`Before push: ${this.array.length} / ${this.pos}; dir: ${this.direction}`);
        if (this.direction === 1) {
            this.array.push(t);
            // TODO keep until keyframe
            if (this.array.length > BUFFER) {
                const v = this.array.shift();
                this.destruct?.(v);
                this.pos -= 1;
            }
        } else {
            this.array.unshift(t);
            // TODO keep until keyframe
            if (this.array.length > BUFFER) {
                const v = this.array.pop();
                this.destruct?.(v);
                this.pos += 1;
            }
        }
        // console.log(`After push: ${this.array.length} / ${this.pos}`);
    }

    public pop(): T {
        // console.log(`Pop: ${this.pos} -> ${this.pos + this.dir} / ${this.array.length}`);
        this.pos += this.dir;
        return this.array[this.pos]; // TODO delete faraway items!
    }

    public last(): T {
        if (this.direction === 1) {
            return this.array[this.array.length - 1];
        } else {
            return this.array[0];
        }
    }

    public left() {
        if (this.direction === 1) {
            return this.array.length - 1 - this.pos;
        } else {
            return this.pos;
        }
    }
}
