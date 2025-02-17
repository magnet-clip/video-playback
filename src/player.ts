import { ArrayBufferPaint, BlobPaint, IPaint, NativeVideoPaint, VideoFramePaint } from "./paint";
import {
    BlobVideoSource,
    IndexedDBVideoSource,
    IVideoSource,
    NativeVideoSource,
    PlainVideoSource,
} from "./video-source";

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

    private getNextFrame() {
        let next = this.currentFrame + this.direction;
        next += this.metadata.numFrames;
        next %= this.metadata.numFrames;
        return next;
    }

    private async paintFrame(idx: number, once: boolean = false, target?: HTMLCanvasElement) {
        if (this.painting || !this.playing) return false;
        this.painting = true;
        const startTime = performance.now();

        const frame = await this.source.getFrame(idx, once);
        await this.painter.paint(frame, target);

        this.onFrame(idx, performance.now() - startTime);
        this.painting = false;
        return true;
    }

    private async playFrame() {
        const nextFrame = this.getNextFrame();
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
        await this.paintFrame(n);
        this.currentFrame = n;
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
    initialize(
        data: ArrayBuffer,
        metadata: VideoMetadata,
        resize: number,
        onProgress: (stage: string, progress: number) => void,
    ): Promise<void> {
        throw new Error("Method not implemented.");
    }

    play(): void {
        throw new Error("Method not implemented.");
    }

    pause(): void {
        throw new Error("Method not implemented.");
    }

    goto(n: number): Promise<void> {
        throw new Error("Method not implemented.");
    }

    paint(n: number, target?: HTMLCanvasElement): Promise<void> {
        throw new Error("Method not implemented.");
    }

    setDirection(direction: -1 | 1): void {
        throw new Error("Method not implemented.");
    }
}
