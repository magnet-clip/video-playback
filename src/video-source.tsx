import mp4box, { DataStream, MP4File, MP4Sample, MP4VideoTrack } from "mp4box";
import { ICache, IndexedDBStorage, LinearCache, PlainCache, PlainStorage } from "./array";
import { db } from "./database";

const description = (file: MP4File, track: MP4VideoTrack): BufferSource => {
    const trak = file.getTrackById(track.id) as any;
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
        if (entry.avcC || entry.hvcC) {
            const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
            if (!("getPosition" in stream)) stream["getPosition"] = () => stream.position;
            if (entry.avcC) {
                entry.avcC.write(stream);
            } else {
                entry.hvcC.write(stream);
            }
            return new Uint8Array(stream.buffer, 8); // Remove the box header.
        }
    }
    throw new Error("avcC or hvcC not found");
};

const sampleToChunk = (sample: MP4Sample): EncodedVideoChunk =>
    new EncodedVideoChunk({
        type: sample.is_sync ? "key" : "delta",
        timestamp: (1e6 * sample.cts) / sample.timescale,
        duration: (1e6 * sample.duration) / sample.timescale,
        data: sample.data,
    });

type Mp4BoxBuffer = ArrayBuffer & { fileStart: number };

export interface IVideoSource<T> {
    init(content: ArrayBuffer): Promise<void>;

    get length(): number;
    getFrame(idx: number, once: boolean): Promise<T>;
    setDirection(dir: -1 | 1): Promise<void>;

    paint(item: T, canvas: HTMLCanvasElement): Promise<void>;
}

abstract class GenericVideoSource<T> implements IVideoSource<T> {
    protected videoFrames: ICache<T>;
    protected size: number;

    public async init(content: ArrayBuffer): Promise<void> {
        const file = mp4box.createFile(false);
        return new Promise((resolve) => {
            (content as any).fileStart = 0;
            file.onReady = (info) => {
                const track = info.tracks[0];
                const config: VideoDecoderConfig = {
                    codec: track.codec,
                    codedHeight: track.video.height,
                    codedWidth: track.video.width,
                    description: description(file, track),
                };

                this.size = track.nb_samples;
                const decoder = new VideoDecoder({
                    output: (v) => this.handleVideoFrame(v),
                    error: console.error,
                });
                decoder.configure(config);

                file.onSamples = async (_id, _user, samples) => {
                    file.stop();
                    file.flush();
                    for (const s of samples) {
                        decoder.decode(sampleToChunk(s));
                    }
                    // TODO: perhaps decoding and conversion could be done in parallel
                    // TODO: web worker ?
                    await decoder.flush();
                    await this.convertFrames();
                    await this.videoFrames.init();
                    this.cleanup();
                    resolve();
                };
                file.setExtractionOptions(track.id, track);
                file.start();
            };
            file.appendBuffer(content as Mp4BoxBuffer);
            file.flush();
        });
    }
    protected abstract cleanup(): void;
    protected abstract convertFrames(): Promise<void>;
    protected abstract handleVideoFrame(v: VideoFrame): void;

    public abstract paint(item: T, canvas: HTMLCanvasElement): Promise<void>;

    public async getFrame(idx: number, once: boolean): Promise<T> {
        return await this.videoFrames.get(idx, once);
    }

    public get length() {
        return this.videoFrames.length;
    }

    public async setDirection(dir: -1 | 1) {
        await this.videoFrames.setDirection(dir);
    }
}

export class BlobVideoSource extends GenericVideoSource<Blob> {
    private frames: VideoFrame[] = [];

    constructor() {
        super();
        this.videoFrames = new LinearCache<Blob>(new PlainStorage<Blob>());
    }

    protected handleVideoFrame(v: VideoFrame): void {
        console.log(`Frame ${this.frames.length} / ${this.size} decoded`);
        this.frames.push(v);
    }

    protected async convertFrames(): Promise<any> {
        return Promise.all(
            this.frames.map(async (v, i) => {
                const options: VideoFrameCopyToOptions = {
                    format: "RGBA",
                };
                const size = v.allocationSize(options);
                const buffer = new Uint8ClampedArray(size);
                await v.copyTo(buffer, options);
                this.videoFrames.push(i, new Blob([buffer]));
                v.close();
                console.log(`Frame ${i} / ${this.size} converted`);
            }),
        );
    }

    protected cleanup(): void {
        this.frames = [];
    }

    public async paint(item: Blob, canvas: HTMLCanvasElement): Promise<void> {
        const start = performance.now();
        return new Promise(async (resolve) => {
            const data = await item.arrayBuffer();
            requestAnimationFrame(() => {
                const arr = new Uint8ClampedArray(data);
                const imdata = new ImageData(arr, canvas.width, canvas.height, { colorSpace: "srgb" });
                canvas.getContext("2d").putImageData(imdata, 0, 0);
                console.log(`paint: ${performance.now() - start}ms`);
                // resolve(); // Resolve here causes timeouts
            });
            resolve();
        });
    }
}

export class PlainVideoSource extends GenericVideoSource<VideoFrame> {
    private i = 0;

    constructor() {
        super();
        this.videoFrames = new PlainCache<VideoFrame>();
    }

    protected handleVideoFrame(v: VideoFrame): void {
        console.log(`Frame ${this.i} / ${this.size} decoded`);
        this.videoFrames.push(this.i++, v);
    }

    protected async convertFrames(): Promise<any> {}

    protected cleanup(): void {}

    public async paint(item: VideoFrame, canvas: HTMLCanvasElement): Promise<void> {
        canvas.getContext("2d").drawImage(item, 0, 0);
    }
}

export class IndexedDBVideoSource extends GenericVideoSource<Uint8ClampedArray> {
    private frames: VideoFrame[] = [];

    constructor() {
        super();
        this.videoFrames = new LinearCache<Uint8ClampedArray>(new IndexedDBStorage<Uint8ClampedArray>(db, "frames"));
    }

    protected handleVideoFrame(v: VideoFrame): void {
        console.log(`Frame ${this.frames.length} / ${this.size} decoded`);
        this.frames.push(v);
    }

    protected async convertFrames(): Promise<any> {
        return Promise.all(
            this.frames.map(async (v, i) => {
                const options: VideoFrameCopyToOptions = {
                    format: "RGBA",
                };
                const size = v.allocationSize(options);
                const buffer = new Uint8ClampedArray(size);
                await v.copyTo(buffer, options);
                this.videoFrames.push(i, buffer);
                v.close();
                console.log(`Frame ${i} / ${this.size} converted`);
            }),
        );
    }

    protected cleanup(): void {
        this.frames = [];
    }

    public async paint(item: Uint8ClampedArray<ArrayBufferLike>, canvas: HTMLCanvasElement): Promise<void> {
        canvas
            .getContext("2d")
            .putImageData(new ImageData(item, canvas.width, canvas.height, { colorSpace: "srgb" }), 0, 0);
    }
}
