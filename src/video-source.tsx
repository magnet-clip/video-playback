import mp4box, { DataStream, MP4File, MP4Sample, MP4VideoTrack } from "mp4box";
import { IndexedDBStorage, PlainStorage } from "./storage";
import { db } from "./database";
import { ICache, LinearCache, PlainCache } from "./cache";
import { assert } from "./assert";

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
}

abstract class GenericVideoSource<T> implements IVideoSource<T> {
    protected cache: ICache<T>;
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
                this.cache.prepare(this.size);
                const decoder = new VideoDecoder({
                    output: (v) => this.handleVideoFrame(v), // this is sync, but conversion is not
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
                    await this.cache.finalize();
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

    public async getFrame(idx: number, once: boolean): Promise<T> {
        return await this.cache.get(idx, once);
    }

    public get length() {
        return this.cache.length;
    }

    public async setDirection(dir: -1 | 1) {
        await this.cache.setDirection(dir);
    }
}

abstract class ConvertibleVideoSource<T> extends GenericVideoSource<T> {
    private frames: VideoFrame[] = [];

    constructor(protected resize: number) {
        assert(resize !== null && resize !== undefined, `resize should be defined, got ${resize} instead`);
        assert(resize > 0, `resize should be > 0, got ${resize} instead`);
        super();
    }

    protected handleVideoFrame(v: VideoFrame): void {
        console.log(`Frame ${this.frames.length} / ${this.size} decoded`);
        this.frames.push(v);
    }

    protected async convertFrames(): Promise<void> {
        const canvas = document.createElement("canvas");
        await Promise.all(
            this.frames.map(async (v, i) => {
                let imData: ImageData = null;
                if (this.resize !== 1) {
                    canvas.width = v.displayWidth * this.resize;
                    canvas.height = v.displayHeight * this.resize;
                    canvas.getContext("2d").drawImage(v, 0, 0, canvas.width, canvas.height);
                    imData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
                } else {
                    const options: VideoFrameCopyToOptions = {
                        format: "RGBA",
                    };
                    const size = v.allocationSize(options);
                    const buffer = new Uint8ClampedArray(size);
                    await v.copyTo(buffer, options);
                    imData = new ImageData(buffer, v.displayWidth, v.displayHeight, options);
                }
                v.close();
                this.cache.push(i, this.convertFrame(imData));
                console.log(`Frame ${i} / ${this.size} converted to image data`);
            }),
        );
    }

    public abstract convertFrame(imData: ImageData): T;

    protected cleanup(): void {
        this.frames = [];
    }
}

export class BlobVideoSource extends ConvertibleVideoSource<Blob> {
    constructor(resize: number = 1) {
        super(resize);
        this.cache = new LinearCache<Blob>(new PlainStorage<Blob>());
    }

    public convertFrame(buffer: ImageData): Blob {
        return new Blob([buffer.data]);
    }
}

export class IndexedDBVideoSource extends ConvertibleVideoSource<Uint8ClampedArray> {
    constructor(resize: number = 1) {
        super(resize);
        this.cache = new LinearCache<Uint8ClampedArray>(new IndexedDBStorage<Uint8ClampedArray>(db, "frames"));
    }

    public convertFrame(buffer: ImageData): Uint8ClampedArray {
        return buffer.data;
    }
}

export class PlainVideoSource extends GenericVideoSource<VideoFrame> {
    private i = 0;

    constructor() {
        super();
        this.cache = new PlainCache<VideoFrame>();
    }

    protected handleVideoFrame(v: VideoFrame): void {
        console.log(`Frame ${this.i} / ${this.size} decoded`);
        this.cache.push(this.i++, v);
    }

    protected async convertFrames(): Promise<any> {}

    protected cleanup(): void {}
}
