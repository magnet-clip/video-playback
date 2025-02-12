export const BUFFER = 5;
export type Dir = -1 | 1;

export class TwoWayArr<T> {
    private array: T[] = [];
    private pos = 0;
    private dir: Dir = 1;

    constructor(private destruct: (v: T) => void = null) {}

    public set direction(value: Dir) {
        if (!value) return;
        if (this.dir !== value) {
            console.log(`direction(${value}), ${this.pos} -> ${this.pos + value}`);
            this.dir = value;
            this.pos += value;
        }
    }

    public get direction() {
        return this.dir;
    }

    public get position() {
        return this.pos;
    }

    public push(t: T) {
        console.log(`Before push: ${this.pos} @ ${this.array.length}, adding ${t.timestamp / 40000}`);
        if (this.array.length > 0) {
            console.log(` Time @ pos: ${this.array[this.pos].timestamp / 40000}`);
        }
        if (this.direction === 1) {
            this.array.push(t);
            // TODO keep until keyframe
            if (this.array.length > BUFFER) {
                console.log(" -- trim --");
                const v = this.array.shift();
                this.destruct?.(v);
                this.pos -= 1;
            }
        } else {
            this.array.unshift(t);
            // TODO keep until keyframe
            if (this.array.length > BUFFER) {
                console.log(" -- trim --");
                const v = this.array.pop();
                this.destruct?.(v);
                this.pos += 1;
            }
        }
        console.log(`After push: ${this.pos} @ ${this.array.length}`);
        if (this.array.length > 0) {
            console.log(` Time @ pos: ${this.array[this.pos]?.timestamp / 40000}`);
        }
    }

    public pop(): T {
        // console.log(`Pop: ${this.pos} -> ${this.pos + this.dir} / ${this.array.length}`);
        const res = this.array[this.pos]; // TODO delete faraway items!
        this.pos += this.dir;
        return res;
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
            return this.array.length - this.pos;
        } else {
            return this.pos;
        }
    }

    public get data() {
        return this.array;
    }
}
