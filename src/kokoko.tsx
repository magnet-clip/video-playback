import mp4box, { DataStream, MP4File, MP4Sample, MP4VideoTrack } from "mp4box";
import { TwoWayArr, BUFFER } from "./array";

const THRESHOLD = 2;

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

export class Kokoko6 {
    public currentFrame: number = 0;
    private direction: 1 | -1 = 1;
    private lastFrame: number;
    private decoder: VideoDecoder;
    private samples: MP4Sample[];
    private videoFrames = new TwoWayArr<VideoFrame>((v) => v.close());
    private timescale = 0;
    private ctsToNum: Record<number, number> = {};
    private cache: VideoFrame[] = [];

    private left: number;
    private resolve: () => void;
    private prefetching: boolean = false;

    public async init(content: ArrayBuffer): Promise<void> {
        const file = mp4box.createFile(false);
        return new Promise((resolve) => {
            (content as any).fileStart = 0;
            file.onReady = (info) => {
                const track = info.tracks[0];
                this.lastFrame = track.nb_samples - 1;
                this.timescale = track.timescale;
                const config: VideoDecoderConfig = {
                    codec: track.codec,
                    codedHeight: track.video.height,
                    codedWidth: track.video.width,
                    description: description(file, track),
                };
                this.decoder = new VideoDecoder({
                    output: (v) => {
                        if (this.direction === 1) {
                            this.videoFrames.push(v);
                        } else {
                            this.cache.unshift(v);
                        }
                        if (--this.left === 0) {
                            if (this.direction < 0) {
                                for (const v of this.cache) {
                                    this.videoFrames.push(v);
                                }
                                this.cache = [];
                            }
                            this.resolve();
                        }
                    },
                    error: console.error,
                });
                this.decoder.configure(config);

                file.onSamples = (id, user, samples) => {
                    file.stop();
                    file.flush();
                    this.samples = samples;
                    for (const sample of samples) {
                        this.ctsToNum[sample.cts] = sample.number;
                    }
                    console.log(this.ctsToNum);
                    // console.log("onSamples", samples.map((s) => (s.is_sync ? "K" : "_")).join(""));
                    console.log("CTS", samples.map((s) => s.cts).join(","));
                    console.log("DTS", samples.map((s) => s.dts).join(","));
                    this.prefetchFrames().then(resolve);
                };
                file.setExtractionOptions(track.id, track);
                file.start();
            };
            file.appendBuffer(content as Mp4BoxBuffer);
            file.flush();
        });
    }

    private vfToTime = (v: VideoFrame): number => this.ctsToNum[(v.timestamp * this.timescale) / 1e6];

    private intervals: number[] = [];
    private clearIntervals() {
        while (this.intervals.length > 0) clearInterval(this.intervals.pop());
    }
    private async getNextFrame(): Promise<VideoFrame> {
        return new Promise<VideoFrame>(async (resolve) => {
            this.prefetchFrames();
            this.intervals.push(
                setInterval(() => {
                    if (this.videoFrames.left() === 0) {
                        console.warn("No frames to show");
                        return;
                    }
                    const v = this.videoFrames.pop();
                    this.currentFrame = v.timestamp / 40000; //this.vfToTime(v); // TODO: why ?
                    console.log(`Frame #: ${this.currentFrame} @ ${v.timestamp}`);
                    this.clearIntervals();
                    resolve(v);
                }, 10),
            );
        });
    }

    private async prefetchFrames() {
        // console.log(`prefetchFrames(), ${this.videoFrames.left()} frames in buffer`);
        return new Promise<void>((resolve, reject) => {
            if (this.prefetching) {
                resolve();
                return;
            }
            this.prefetching = true;
            const left = this.videoFrames.left();
            if (left < THRESHOLD) {
                console.log(`Too little frames: ${left}`);
                let curr = this.currentFrame;
                if (left > 0) {
                    const lastFrame = this.videoFrames.last();
                    curr = this.vfToTime(lastFrame) + 1; // TODO: why can't divide by 40k?
                } else {
                    console.warn("No frames left in buffer");
                }
                let samples: MP4Sample[] = [];
                let finished = false;
                while (!finished) {
                    const s = this.samples[curr]; // Must be a keyframe as we fetch until a keyframe
                    if (samples.length === 0 && !s.is_sync) {
                        console.error("Must be a keyframe");
                        this.prefetching = false;
                        reject();
                        return;
                    }
                    samples.push(s);
                    curr = (curr + this.lastFrame + this.direction) % this.lastFrame; // TODO direction // TODO is it ok to jump over the end of video?
                    finished = samples.length >= BUFFER && this.samples[curr].is_sync;
                    if (samples.length > this.lastFrame) {
                        console.error("No keyframe at all");
                        this.prefetching = false;
                        reject();
                        return;
                    }
                }
                this.left = samples.length;
                this.resolve = () => {
                    this.prefetching = false;
                    console.log(`Prefetch done, ${this.videoFrames.left()} frames in buffer`);
                    // this.videoFrames.sort((a, b) => b.timestamp - a.timestamp);
                    // TODO: here I can remove unnecessary frames.
                    resolve();
                };
                if (this.direction < 0) samples.reverse();
                for (const s of samples) {
                    this.decoder.decode(sampleToChunk(s));
                }
                this.decoder.flush();
            } else {
                this.prefetching = false;
                resolve();
            }
        });
    }

    public async setDirection(dir: 1 | -1) {
        console.log(`Set direction ${dir}`);
        this.direction = this.videoFrames.direction = dir;
    }

    public async addFrames(n: number) {
        // TODO instead step in this.videoFrames by n
        // this.currentFrame = (this.currentFrame + this.lastFrame + n) % this.lastFrame;
        // await this.prefetchFrames();
    }

    public async *iterate(): AsyncGenerator<VideoFrame, VideoFrame, unknown> {
        while (true) {
            yield await this.getNextFrame();
        }
    }
}
