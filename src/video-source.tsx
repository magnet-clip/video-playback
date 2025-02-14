import mp4box, { DataStream, MP4File, MP4Sample, MP4VideoTrack } from "mp4box";
import { ICache, IndexedDBStorage, LinearCache, PlainStorage } from "./array";
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

export class VideoSource {
    private videoFrames: ICache<Blob> = new LinearCache<Blob>(new PlainStorage<Blob>());
    // private videoFrames: ICache<Uint8ClampedArray> = new LinearCache<Uint8ClampedArray>(
    //     new IndexedDBStorage<Uint8ClampedArray>(db, "frames"),
    // );
    // private videoFrames: ICache<VideoFrame> = new PlainCache<VideoFrame>();

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
                let i = 0;
                // TODO save all frames to array and then map to promises and promise.all!

                // TODO very low mem consumption and high speed

                // TODO drawback: requestAnimationFrame
                const samples: [number, VideoFrame][] = [];
                const convertFrames = () => {
                    console.log(`Got ${samples.length} vs ${track.nb_samples} expected`);
                    return Promise.all(
                        samples.map(async ([i, v]) => {
                            const options: VideoFrameCopyToOptions = {
                                format: "RGBA",
                            };
                            const size = v.allocationSize(options);
                            const buffer = new Uint8ClampedArray(size);
                            await v.copyTo(buffer, options);
                            this.videoFrames.push(i, new Blob([buffer]));
                            v.close();
                            console.log(`Frame ${i} converted`);
                        }),
                    );
                };

                const decoder = new VideoDecoder({
                    output: (v) => {
                        console.log(`Frame ${i} decoded`);
                        samples.push([i++, v]);
                        // Raw frames
                        // this.videoFrames.push(v);

                        // Uint8array
                        // const options: VideoFrameCopyToOptions = {
                        //     format: "RGBA",
                        // };
                        // const size = v.allocationSize(options);
                        // const buffer = new Uint8ClampedArray(size);
                        // v.copyTo(buffer, options).then(() => {
                        //     this.videoFrames.push(buffer);
                        //     v.close();
                        // });

                        // Blob
                        // const options: VideoFrameCopyToOptions = {
                        //     format: "RGBA",
                        // };
                        // const size = v.allocationSize(options);
                        // const buffer = new Uint8ClampedArray(size);
                        // v.copyTo(buffer, options).then(() => {
                        //     this.videoFrames.push(i++, new Blob([buffer]));
                        //     v.close();
                        // });
                    },
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
                    await convertFrames();
                    await this.videoFrames.init();
                    resolve();
                };
                file.setExtractionOptions(track.id, track);
                file.start();
            };
            file.appendBuffer(content as Mp4BoxBuffer);
            file.flush();
        });
    }

    public async getFrame(idx: number, once: boolean): Promise<Blob> {
        return await this.videoFrames.get(idx, once);
    }

    public get length() {
        return this.videoFrames.length;
    }

    public async setDirection(dir: -1 | 1) {
        await this.videoFrames.setDirection(dir);
    }
}
