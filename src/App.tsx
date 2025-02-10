import { Button, Divider, Drawer, FormControlLabel, IconButton, Radio, RadioGroup } from "@suid/material";
import {
    createEffect,
    createMemo,
    createSignal,
    For,
    Index,
    on,
    onCleanup,
    Show,
    type Component,
    type JSX,
} from "solid-js";
import AddIcon from "@suid/icons-material/Add";
import { videoRepo } from "./database";
import DeleteIcon from "@suid/icons-material/Delete";
import { A, useParams } from "@solidjs/router";
import PlayArrowIcon from "@suid/icons-material/PlayArrow";
import SkipNextIcon from "@suid/icons-material/SkipNext";
import SkipPreviousIcon from "@suid/icons-material/SkipPrevious";
import PauseIcon from "@suid/icons-material/Pause";
import mp4box, { DataStream, MP4ArrayBuffer, MP4File, MP4Info, MP4Sample, MP4VideoTrack } from "mp4box";

export type VideoInfo = {
    frames: number;
    resolution: [number, number];
    fps: number;
    hash: string;
    name: string;
};

export type VideoData = {
    hash: string;
    content: ArrayBuffer;
};

const [update, setUpdate] = createSignal(0);
const [hash, setHash] = createSignal<string>();
const [mode, setMode] = createSignal<"mp4box" | "video">("mp4box");
const [dir, setDir] = createSignal<"fwd" | "bwd">("fwd");

export const readFile = async (file: File): Promise<ArrayBuffer> => {
    return new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            resolve(reader.result as ArrayBuffer);
        };
        reader.readAsArrayBuffer(file);
    });
};

export const hashVideo = async (data: ArrayBuffer): Promise<string> => {
    const hash = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hash)].map((a) => a.toString(16).padStart(2, "0")).join("");
};

export const readFps = (file: File | Blob, onProgress: (p: number) => void = null): Promise<[number, number]> => {
    return new Promise((resolve, reject) => {
        const fileSize = file.size;
        const mp4boxfile = mp4box.createFile(false);
        let offset = 0;
        const chunkSize = 1024 * 1204;
        // const sha256 = new jsSHA("SHA-256", "ARRAYBUFFER");
        // const sha512 = new jsSHA("SHA-512", "ARRAYBUFFER");

        mp4boxfile.onError = () => {
            console.log("Failed to parse ISOBMFF data");
            reject();
        };

        mp4boxfile.onSidx = (sidx) => {
            console.log("sidx:", sidx);
        };

        mp4boxfile.onReady = (info) => {
            console.log("Info:", info);
            const track = info.videoTracks.length ? info.videoTracks[0] : info.tracks[0];
            const sample_duration = track.samples_duration / track.nb_samples;
            const fps = track.timescale / sample_duration;
            resolve([fps, track.nb_samples]);
        };

        const onParsedBuffer = (mp4boxfileobj: MP4File, data: ArrayBuffer) => {
            console.log("Appending buffer with offset " + offset);
            const buffer = data as MP4ArrayBuffer;
            buffer.fileStart = offset;
            mp4boxfileobj.appendBuffer(buffer);
        };

        const onBlockRead = (evt: ProgressEvent<FileReader>) => {
            if (evt.target.error == null) {
                const data = evt.target.result as ArrayBuffer;
                onParsedBuffer(mp4boxfile, data);
                offset += data.byteLength;
                onProgress?.((offset / fileSize) * 100);
            } else {
                console.log("Read error: " + evt.target.error);
                return;
            }
            if (offset >= fileSize) {
                console.log("Done reading file (" + fileSize + " bytes)");
                mp4boxfile.flush();
                return;
            }

            readBlock(offset, chunkSize, file);
        };
        // there's nb_samples (131) and samples_duration (67072)
        // a*b = 8786432

        const readBlock = (offset: number, length: number, file: File | Blob) => {
            const r = new FileReader();
            const blob = file.slice(offset, length + offset);
            r.onload = onBlockRead;
            r.readAsArrayBuffer(blob);
        };
        try {
            readBlock(offset, chunkSize, file);
        } catch (e) {
            reject(e);
        }
    });
};

export const getVideoData = async (file: File | Blob): Promise<Omit<VideoInfo, "hash" | "name">> => {
    const [fps, numFrames] = await readFps(file);
    return {
        frames: numFrames,
        resolution: [100, 100],
        fps,
    };
};

export const importVideo = async (file: File) => {
    const content = await readFile(file);
    const hash = await hashVideo(content);
    const data = await getVideoData(file);
    await videoRepo.addVideo(hash, content, { ...data, hash, name: file.name });
};

export const UploadVideo: Component = () => {
    let fileInput!: HTMLInputElement;

    const handleChange: JSX.EventHandler<HTMLInputElement, Event> = async (e) => {
        await importVideo(e.currentTarget.files[0]);
        setUpdate(update() + 1);
    };

    return (
        <div style={{ "text-align": "center" }}>
            <form style={{ display: "none" }}>
                <input ref={fileInput} type="file" accept="video/mp4" onChange={handleChange} />
            </form>
            <Button onClick={() => fileInput.click()} startIcon={<AddIcon />}>
                new video
            </Button>
        </div>
    );
};

export const VideoCard: Component<{
    info: () => VideoInfo;
}> = ({ info }) => {
    const [hover, setHover] = createSignal(false);
    const handleDelete: JSX.EventHandler<HTMLButtonElement, Event> = async (e) => {
        e.stopPropagation();
        e.preventDefault();
        await videoRepo.deleteVideo(info().hash);
        setUpdate(update() + 1);
    };

    return (
        <A
            style={{
                display: "flex",
                "flex-direction": "column",
                "text-decoration": "none",
            }}
            href={`/${info().hash}`}
            activeClass="default"
            inactiveClass="default">
            <Divider style={{ "margin-bottom": "5px" }} />
            <span style={{ margin: "5px" }}>
                <span
                    style={{
                        display: "flex",
                        "flex-direction": "row",
                        "justify-content": "space-between",
                    }}
                    onMouseOver={() => setHover(true)}
                    onMouseOut={() => setHover(false)}>
                    <span
                        style={{
                            "font-weight": hash() === info().hash ? "bold" : null,
                        }}>
                        {info().name || "<no name>"}
                    </span>
                    <span style={{ visibility: hover() ? "visible" : "hidden" }}>
                        <IconButton style={{ padding: 0 }} onClick={(e) => handleDelete(e)}>
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </span>
                </span>
            </span>
        </A>
    );
};

export const VideoList: Component = () => {
    const [videos, setProjects] = createSignal<VideoInfo[]>([]);
    createEffect(
        on(update, async () => {
            setProjects(await videoRepo.getAllVideosInfo());
        }),
    );
    return (
        <div>
            <UploadVideo />
            <Index each={videos()}>{(video, index) => <VideoCard info={video} data-index={index} />}</Index>
        </div>
    );
};

const VideoContent = () => {
    const [video, setVideo] = createSignal<HTMLVideoElement>();
    const [url, setUrl] = createSignal<string>();
    const [info, setInfo] = createSignal<VideoInfo>();
    const [playing, setPlaying] = createSignal(false);
    const [lastTime, setLastTime] = createSignal(0);

    createEffect(async () => {
        const [data, videoInfo] = await videoRepo.getVideo(hash());
        setInfo(videoInfo);
        const blob = new Blob([data.content]);
        setUrl(URL.createObjectURL(blob));
    });

    onCleanup(() => {
        URL.revokeObjectURL(url());
    });

    const delta = () => (dir() === "fwd" ? 1 : -1);

    const getNextFrameTime = () => {
        const t = lastTime(); //video().currentTime;
        let f = Math.round(t * info().fps) + delta();
        const n = info().frames;
        if (f === n - 1) f = 0;
        else if (f < 0) f = n - 1;
        const res = f / info().fps;
        setLastTime(res);
        return res;
    };

    const handleSeeked = () => {
        const time = getNextFrameTime();
        video().currentTime = time;
    };

    const play = () => {
        if (!playing()) {
            video().addEventListener("timeupdate", handleSeeked);
            video().currentTime = getNextFrameTime();
            setPlaying(true);
        } else {
            video().removeEventListener("timeupdate", handleSeeked);
            setPlaying(false);
        }
    };
    const step = (n: number) => {};

    return (
        <Show when={hash()}>
            <video ref={setVideo} style={{ width: "100%" }} src={url()} controls preload="auto" autoplay={false} />
            <div style={{ display: "flex", "flex-direction": "row", width: "100%", "align-items": "center" }}>
                <span title="Step 1 frame back">
                    <IconButton onClick={() => step(-1)}>
                        <SkipPreviousIcon />
                    </IconButton>
                </span>
                <span title="Play / pause">
                    <IconButton onClick={play}>{playing() ? <PauseIcon /> : <PlayArrowIcon />}</IconButton>
                </span>
                <span title="Step 1 frame forth">
                    <IconButton onClick={() => step(1)}>
                        <SkipNextIcon />
                    </IconButton>
                </span>
            </div>
        </Show>
    );
};

const Choose: Component<{ what: () => string; set: (v: string) => void; values: string[] }> = ({
    what,
    set,
    values,
}) => {
    return (
        <span>
            <RadioGroup defaultValue={what()}>
                <For each={values}>
                    {(value) => (
                        <FormControlLabel value={value} control={<Radio />} label={value} onChange={() => set(value)} />
                    )}
                </For>
            </RadioGroup>
        </span>
    );
};

const description = (file: MP4File, track: MP4VideoTrack): BufferSource => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export const extractFrames = async (data: ArrayBuffer, onFrame?: (frame: VideoFrame) => void): Promise<void> => {
    const buffer = data as Mp4BoxBuffer;
    buffer.fileStart = 0;

    const file = mp4box.createFile();
    file.onError = (error) => {
        console.error(error);
    };

    let resolveFileReady: (v: MP4Info) => void;
    const waitFileReady = new Promise<MP4Info>((resolve) => (resolveFileReady = resolve));

    let resolveSamplesReady: (v: MP4Sample[]) => void;
    const waitSamplesReady = new Promise<MP4Sample[]>((resolve) => (resolveSamplesReady = resolve));

    file.onReady = (info) => {
        console.log("File ready", info);
        resolveFileReady(info);
    };
    file.onSamples = (id, user, s) => {
        resolveSamplesReady(s);
    };
    file.onError = (e) => {
        console.log(e); // TODO reject
    };

    file.appendBuffer(buffer);
    file.flush();
    const info = await waitFileReady;
    const track = info.videoTracks[0];
    file.setExtractionOptions(info.videoTracks[0].id);
    file.start();
    const samples = await waitSamplesReady;

    const config: VideoDecoderConfig = {
        codec: track.codec,
        codedHeight: track.video.height,
        codedWidth: track.video.width,
        description: description(file, track),
    };
    const decoder = new VideoDecoder({ output: onFrame, error: console.error });
    decoder.configure(config);
    for (const sample of samples) {
        decoder.decode(sampleToChunk(sample));
    }
    await decoder.flush();
};

class Kokoko {
    private file: mp4box.MP4File;
    private track: mp4box.MP4VideoTrack;

    constructor() {
        const file = mp4box.createFile(false);
        this.file = file;
    }

    public async init(content: ArrayBuffer): Promise<MP4Sample> {
        return new Promise((resolve) => {
            (content as any).fileStart = 0;
            this.file.onReady = (info) => {
                const track = info.tracks[0];
                this.track = track;
                this.file.onSamples = (id, user, [sample]) => {
                    console.log(sample);
                    this.file.stop();
                    resolve(sample);
                };
                this.file.setExtractionOptions(this.track.id, this.track, { nbSamples: 1 });
                this.file.start();
            };
            this.file.appendBuffer(content as Mp4BoxBuffer);
            this.file.flush();
        });
    }

    public async getNextFrame(): Promise<MP4Sample> {
        return new Promise((resolve) => {
            this.file.onSamples = (id, user, [sample]) => {
                console.log(sample);
                this.file.stop();
                resolve(sample);
            };
            this.file.setExtractionOptions(this.track.id, this.track, { nbSamples: 1 });
            this.file.start();
        });
    }

    public async *iterate(content: ArrayBuffer) {
        yield await this.init(content);
    }
}

class Kokoko2 {
    private file: mp4box.MP4File;
    private sample: number;
    private numSamples: number;

    private async init(content: ArrayBuffer): Promise<MP4Sample> {
        const file = mp4box.createFile(false);
        this.file = file;
        return new Promise((resolve) => {
            (content as any).fileStart = 0;
            this.file.onReady = (info) => {
                const track = info.tracks[0];
                this.numSamples = track.nb_samples;
                this.file.onSamples = (id, user, [sample]) => {
                    this.file.stop();
                    resolve(sample);
                };
                this.file.setExtractionOptions(track.id, track, { nbSamples: 1 });
                this.file.start();
            };
            this.file.appendBuffer(content as Mp4BoxBuffer);
            this.file.flush();
        });
    }

    private async getNextFrame(): Promise<MP4Sample> {
        return new Promise((resolve) => {
            this.file.onSamples = (id, user, [sample]) => {
                this.file.stop();
                this.sample = sample.number;
                resolve(sample);
            };
            this.file.start();
        });
    }

    public async *iterate(content: ArrayBuffer) {
        const sample = await this.init(content);
        if (sample.number === this.numSamples) {
            return sample;
        } else {
            yield sample;
        }
        while (true) {
            const sample = await this.getNextFrame();
            if (sample.number === this.numSamples) {
                return sample;
            } else {
                yield sample;
            }
        }
    }
}

class Kokoko3 {
    private file: mp4box.MP4File;
    private numSamples: number;
    private sample: number;
    private decoder: VideoDecoder;
    private resolve: (value: VideoFrame | PromiseLike<VideoFrame>) => void;

    private async init(content: ArrayBuffer): Promise<VideoFrame> {
        const file = mp4box.createFile(false);
        this.file = file;
        return new Promise((resolve) => {
            (content as any).fileStart = 0;
            this.file.onReady = (info) => {
                const track = info.tracks[0];
                this.numSamples = track.nb_samples;
                const config: VideoDecoderConfig = {
                    codec: track.codec,
                    codedHeight: track.video.height,
                    codedWidth: track.video.width,
                    description: description(file, track),
                };
                console.log(config);
                this.resolve = resolve;
                this.decoder = new VideoDecoder({
                    output: (v) => {
                        this.resolve(v);
                    },
                    error: console.error,
                });
                this.decoder.configure(config);
                console.log(this.decoder);

                this.file.onSamples = (id, user, [sample]) => {
                    this.file.stop();
                    this.sample = sample.number;
                    this.decoder.decode(sampleToChunk(sample));
                    this.decoder.flush();
                };
                this.file.setExtractionOptions(track.id, track, { nbSamples: 1 });
                this.file.start();
            };
            this.file.appendBuffer(content as Mp4BoxBuffer);
            this.file.flush();
        });
    }

    private async getNextFrame(): Promise<VideoFrame> {
        return new Promise<VideoFrame>((resolve) => {
            this.resolve = resolve;
            this.file.onSamples = (id, user, [sample]) => {
                this.file.stop();
                this.sample = sample.number;
                this.decoder.decode(sampleToChunk(sample));
                this.decoder.flush();
            };
            this.file.start();
        });
    }

    public async *iterate(content: ArrayBuffer) {
        const sample = await this.init(content);
        if (this.sample === this.numSamples - 1) {
            return sample;
        } else {
            yield sample;
        }
        while (true) {
            const sample = await this.getNextFrame();
            if (this.sample === this.numSamples - 1) {
                return sample;
            } else {
                yield sample;
            }
        }
    }

    public async *iterateFrames(content: ArrayBuffer) {}
}

const Mp4Content = () => {
    const k = new Kokoko3();
    let data: ArrayBuffer;
    let q: AsyncGenerator<VideoFrame, VideoFrame, unknown>;
    const [playing, setPlaying] = createSignal(false);
    const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
    let lastTime = 0;

    createEffect(async () => {
        const [{ content }] = await videoRepo.getVideo(hash());
        data = content;
    });

    const playNext = async () => {
        if (!playing()) return;
        const { value: s, done } = await q.next();
        const c = canvas();
        c.width = s.displayWidth;
        c.height = s.displayHeight;
        c.getContext("2d").drawImage(s, 0, 0);
        s.close();
        console.log(performance.now() - lastTime);
        lastTime = performance.now();

        if (done) {
            q = k.iterate(data);
            setPlaying(false);
        } else {
            playNext();
        }
    };

    const play = async () => {
        if (playing()) {
            setPlaying(false);
        } else {
            setPlaying(true);
            if (!q) q = k.iterate(data);
            await playNext();

            // const { value: s, done } = await q.next();
            // const c = canvas();
            // c.width = s.displayWidth;
            // c.height = s.displayHeight;
            // c.getContext("2d").drawImage(s, 0, 0);
            // s.close();

            // if (done) {
            //     q = k.iterate(data);
            // } else {
            //     play();
            // }

            // for await (const s of k.iterate(data)) {
            //     const c = canvas();
            //     c.width = s.displayWidth;
            //     c.height = s.displayHeight;
            //     c.getContext("2d").drawImage(s, 0, 0);
            //     s.close();
            // }
        }
    };

    const step = (n: number) => {};

    return (
        <Show when={hash()}>
            <canvas ref={setCanvas} style={{ width: "100%" }} />
            <div style={{ display: "flex", "flex-direction": "row", width: "100%", "align-items": "center" }}>
                <span title="Step 1 frame back">
                    <IconButton onClick={() => step(-1)}>
                        <SkipPreviousIcon />
                    </IconButton>
                </span>
                <span title="Play / pause">
                    <IconButton onClick={play}>{playing() ? <PauseIcon /> : <PlayArrowIcon />}</IconButton>
                </span>
                <span title="Step 1 frame forth">
                    <IconButton onClick={() => step(1)}>
                        <SkipNextIcon />
                    </IconButton>
                </span>
            </div>
        </Show>
    );
};

const App: Component = () => {
    const params = useParams();

    createEffect(() => {
        setHash(params.videoId);
    });

    return (
        <main style={{ display: "flex", "flex-direction": "row" }}>
            <Drawer variant="permanent" PaperProps={{ sx: { width: "210px" } }} style={{ width: "210px" }}>
                <VideoList />
            </Drawer>
            <div style={{ width: "100%", padding: "5px" }}>
                <span style={{ display: "flex", "flex-direction": "row" }}>
                    <Choose what={mode} set={setMode} values={["mp4box", "video"]} />
                    <Choose what={dir} set={setDir} values={["fwd", "bwd"]} />
                </span>
                <Show when={mode() === "video"}>
                    <VideoContent />
                </Show>
                <Show when={mode() === "mp4box"}>
                    <Mp4Content />
                </Show>
            </div>
        </main>
    );
};

export default App;
