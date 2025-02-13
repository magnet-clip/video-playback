import mp4box, { DataStream, MP4File, MP4Sample, MP4VideoTrack } from "mp4box";
import { ICache, LinearCache, PlainStorage } from "./array";

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
    private videoFrames: ICache<VideoFrame> = new LinearCache<VideoFrame>(new PlainStorage<VideoFrame>());
    //new PlainCache<VideoFrame>();

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
                const decoder = new VideoDecoder({
                    output: (v) => {
                        // TODO: less frames than samples
                        // TODO: v.copyTo (ArrayBuffer / Uint8ClampedArray)
                        this.videoFrames.push(v);
                    },
                    error: console.error,
                });
                decoder.configure(config);

                file.onSamples = (_id, _user, samples) => {
                    file.stop();
                    file.flush();
                    console.log("# samples: ", samples.length);
                    console.log("# cts: ", new Set([...samples.map((s) => s.cts)]).size);
                    console.log("# dts: ", new Set([...samples.map((s) => s.dts)]).size);
                    for (const s of samples) {
                        decoder.decode(sampleToChunk(s));
                    }
                    decoder
                        .flush()
                        .then(() => this.videoFrames.init())
                        .then(() => resolve());
                };
                file.setExtractionOptions(track.id, track);
                file.start();
            };
            file.appendBuffer(content as Mp4BoxBuffer);
            file.flush();
        });
    }

    public async getFrame(idx: number, once: boolean): Promise<VideoFrame> {
        return await this.videoFrames.get(idx, once);
    }

    public get length() {
        return this.videoFrames.length;
    }

    public async setDirection(dir: -1 | 1) {
        await this.videoFrames.setDirection(dir);
    }
}
