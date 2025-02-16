import { assert } from "./assert";

export interface IPaint<T> {
    paint(source: T): Promise<void>;
}

abstract class GenericPaint<T> implements IPaint<T> {
    constructor(protected _canvas: HTMLCanvasElement | (() => HTMLCanvasElement)) {}

    protected get canvas(): HTMLCanvasElement {
        if (typeof this._canvas === "function") {
            return this._canvas();
        } else {
            return this._canvas;
        }
    }

    public abstract paint(source: T): Promise<void>;
}

export class BlobPaint extends GenericPaint<Blob> {
    public async paint(item: Blob): Promise<void> {
        const start = performance.now();
        return new Promise(async (resolve) => {
            const data = await item.arrayBuffer();
            requestAnimationFrame(() => {
                const arr = new Uint8ClampedArray(data);
                const imdata = new ImageData(arr, this.canvas.width, this.canvas.height, {
                    colorSpace: "srgb",
                });
                this.canvas.getContext("2d").putImageData(imdata, 0, 0);
                console.log(`paint: ${performance.now() - start}ms`);
                // resolve(); // Resolve here causes timeouts
            });
            resolve();
        });
    }
}

export class ArrayBufferPaint extends GenericPaint<Uint8ClampedArray> {
    public async paint(item: Uint8ClampedArray<ArrayBufferLike>): Promise<void> {
        const data = new ImageData(item, this.canvas.width, this.canvas.height, {
            colorSpace: "srgb",
        });
        this.canvas.getContext("2d").putImageData(data, 0, 0);
    }
}

export class VideoFramePaint extends GenericPaint<VideoFrame> {
    constructor(_canvas: HTMLCanvasElement | (() => HTMLCanvasElement)) {
        super(_canvas);
    }

    public async paint(source: VideoFrame): Promise<void> {
        this.canvas.getContext("2d").drawImage(source, 0, 0);
    }
}
