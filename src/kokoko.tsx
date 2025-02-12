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
    private videoFrames: VideoFrame[] = [];

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
                const decoder = new VideoDecoder({
                    output: (v) => {
                        this.videoFrames.push(v);
                        console.log(v.timestamp / 40000);
                        resolve();
                    },
                    error: console.error,
                });
                decoder.configure(config);

                file.onSamples = (_id, _user, samples) => {
                    file.stop();
                    file.flush();
                    console.log("# samples: ", samples.length);
                    for (const s of samples) {
                        decoder.decode(sampleToChunk(s));
                    }
                    decoder.flush;
                };
                file.setExtractionOptions(track.id, track);
                file.start();
            };
            file.appendBuffer(content as Mp4BoxBuffer);
            file.flush();
        });
    }

    private getNextFrame(): VideoFrame {
        const v = this.videoFrames[this.currentFrame];
        this.currentFrame += this.direction;
        this.currentFrame += this.videoFrames.length;
        this.currentFrame %= this.videoFrames.length;
        return v;
    }

    public setDirection(dir: 1 | -1) {
        console.log(`Set direction ${dir}`);
        this.direction = dir;
    }

    public *iterate(): Generator<VideoFrame, VideoFrame, unknown> {
        while (true) {
            yield this.getNextFrame();
        }
    }
}
