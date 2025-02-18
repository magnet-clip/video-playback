import { assert } from "./assert";
import { ArrayBufferPaint, BlobPaint, IPaint, NativeVideoPaint, VideoFramePaint } from "./paint";
import { BlobVideoSource, IndexedDBVideoSource, IVideoSource, NativeVideoSource, PlainVideoSource } from "./source";

export type VideoMetadata = {
    fps: number;
    numFrames: number;
    width: number;
    height: number;
};

export interface IPlayer {
    initialize(
        data: ArrayBuffer,
        metadata: VideoMetadata,
        resize: number,
        onProgress: (stage: string, progress: number) => void,
    ): Promise<void>;

    play(): void;

    pause(): void;

    goto(n: number): Promise<void>;

    paint(n: number, target?: HTMLCanvasElement): Promise<void>;

    setDirection(direction: -1 | 1): void;
}

abstract class FrameBasedPlayer<T> implements IPlayer {
    protected source: IVideoSource<T>;
    protected painter: IPaint<T>;
    protected metadata: VideoMetadata;
    protected resize: number;

    private direction: -1 | 1 = 1;
    private currentFrame: number = 0;
    private playing: boolean = false;
    private painting: boolean = false;

    private interval: number = null;

    constructor(
        protected canvas: HTMLCanvasElement | (() => HTMLCanvasElement),
        private onFrame: (idx: number, time: number) => void,
    ) {}

    public setDirection(direction: -1 | 1): void {
        this.direction = direction;
    }

    protected abstract initPainterAndSource(): void;

    public async initialize(
        data: ArrayBuffer,
        metadata: VideoMetadata,
        resize: number,
        onProgress: (stage: string, progress: number) => void,
    ): Promise<void> {
        this.resize = resize;
        this.metadata = metadata;
        this.initPainterAndSource();
        await this.source.init(data, onProgress);
    }

    private clampFrame(n: number) {
        n += this.metadata.numFrames;
        n %= this.metadata.numFrames;
        return n;
    }

    private getNextFrame(from: number) {
        let next = from + this.direction;
        return this.clampFrame(next);
    }

    private async paintFrame(idx: number, once: boolean = false, target?: HTMLCanvasElement): Promise<void> {
        if (this.painting) return;
        if (!once && !this.playing) return;
        this.painting = true;
        const startTime = performance.now();

        const frame = await this.source.getFrame(idx, once);
        await this.painter.paint(frame, target);

        this.onFrame(idx, performance.now() - startTime);
        this.painting = false;
    }

    private async playFrame() {
        const nextFrame = this.getNextFrame(this.currentFrame);
        await this.paintFrame(nextFrame);
        this.currentFrame = nextFrame;
    }

    public play(): void {
        if (this.playing) return;
        this.playing = true;
        this.interval = setInterval(() => this.playFrame(), Math.round(1000 / this.metadata.fps));
    }

    public pause(): void {
        this.playing = false;
        clearInterval(this.interval);
    }

    public async goto(n: number): Promise<void> {
        this.currentFrame = this.clampFrame(n);
        await this.paintFrame(this.currentFrame, true);
    }

    public async paint(n: number, target?: HTMLCanvasElement): Promise<void> {
        await this.paintFrame(n, true, target);
    }
}

export class NativeByFramePlayer extends FrameBasedPlayer<HTMLVideoElement> {
    protected initPainterAndSource(): void {
        this.source = new NativeVideoSource(this.metadata.fps, this.resize);
        this.painter = new NativeVideoPaint(this.canvas);
    }
}

export class BlobPlayer extends FrameBasedPlayer<Blob> {
    protected initPainterAndSource(): void {
        this.source = new BlobVideoSource(this.resize);
        this.painter = new BlobPaint(this.canvas);
    }
}

export class ArrayBufferPlayer extends FrameBasedPlayer<Uint8ClampedArray> {
    protected initPainterAndSource(): void {
        this.source = new IndexedDBVideoSource(this.resize);
        this.painter = new ArrayBufferPaint(this.canvas);
    }
}

export class InMemoryPlayer extends FrameBasedPlayer<VideoFrame> {
    protected initPainterAndSource(): void {
        this.source = new PlainVideoSource(this.resize);
        this.painter = new VideoFramePaint(this.canvas);
    }
}

export class NativePlayer implements IPlayer {
    private source: NativeVideoSource;
    private metadata: VideoMetadata;
    private callbacks: number[] = [];

    private playing: boolean = false;
    private manualPause: boolean = false;

    constructor(
        protected _canvas: HTMLCanvasElement | (() => HTMLCanvasElement),
        private onFrame: (idx: number, time: number) => void,
    ) {}

    public async initialize(
        data: ArrayBuffer,
        metadata: VideoMetadata,
        resize: number,
        onProgress: (stage: string, progress: number) => void,
    ): Promise<void> {
        this.metadata = metadata;
        this.source = new NativeVideoSource(metadata.fps, resize);
        await this.source.init(data, onProgress);
    }

    private get video() {
        return this.source.native;
    }

    private get canvas() {
        return typeof this._canvas === "function" ? this._canvas() : this._canvas;
    }

    private cancelFrameCallbacks() {
        while (this.callbacks.length > 0) {
            this.video.cancelVideoFrameCallback(this.callbacks.pop());
        }
    }

    private frameCallback(time: DOMHighResTimeStamp, meta: VideoFrameCallbackMetadata) {
        this.onFrame(Math.round(meta.mediaTime * this.metadata.fps), null);
        this.canvas.getContext("2d").drawImage(this.video, 0, 0);
        this.callbacks.push(this.video.requestVideoFrameCallback((time, meta) => this.frameCallback(time, meta)));
    }

    public play(): void {
        if (this.playing) return;
        this.callbacks.push(this.video.requestVideoFrameCallback((time, meta) => this.frameCallback(time, meta)));
        this.video.play();
        this.video.onpause = () => {
            if (this.manualPause) {
                this.playing = false;
                this.cancelFrameCallbacks();
            } else {
                this.video.addEventListener(
                    "timeupdate",
                    () => {
                        this.video.play();
                    },
                    { once: true },
                );
                this.video.currentTime = 0;
            }
            this.manualPause = false;
        };
    }

    public pause(): void {
        this.manualPause = true;
        this.video.pause();
    }

    public async goto(n: number): Promise<void> {
        return new Promise((resolve) => {
            this.video.addEventListener(
                "timeupdate",
                async () => {
                    this.canvas.getContext("2d").drawImage(this.video, 0, 0);
                    resolve();
                },
                { once: true },
            );
            this.video.currentTime = n / this.metadata.fps;
        });
    }

    public async paint(n: number, target?: HTMLCanvasElement): Promise<void> {
        // TODO this is once-off => I need to load video separately and get a frame and unload
        // Or, otherwise, navigate to frame, get it, and come back (?)
        throw new Error("Method not implemented.");
    }

    public setDirection(direction: -1 | 1): void {
        assert(direction === 1, "Reverse playback not supported");
    }
}
