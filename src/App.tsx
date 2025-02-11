import { Button, Divider, Drawer, FormControlLabel, IconButton, Radio, RadioGroup } from "@suid/material";
import { createEffect, createSignal, For, Index, on, onCleanup, Show, type Component, type JSX } from "solid-js";
import AddIcon from "@suid/icons-material/Add";
import { videoRepo } from "./database";
import DeleteIcon from "@suid/icons-material/Delete";
import { A, useParams } from "@solidjs/router";
import PlayArrowIcon from "@suid/icons-material/PlayArrow";
import SkipNextIcon from "@suid/icons-material/SkipNext";
import SkipPreviousIcon from "@suid/icons-material/SkipPrevious";
import PauseIcon from "@suid/icons-material/Pause";
import mp4box, { DataStream, MP4ArrayBuffer, MP4File, MP4Sample, MP4VideoTrack } from "mp4box";

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

    let lastFrameTime = 0;

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
        console.log(performance.now() - lastFrameTime);
        lastFrameTime = performance.now();
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

class Kokoko5 {
    public currentFrame: number = 0;
    public direction = 1;
    private numFrames: number;
    private decoder: VideoDecoder;
    private samples: MP4Sample[];
    private resolve: (value: VideoFrame | PromiseLike<VideoFrame>) => void;

    public async init(content: ArrayBuffer): Promise<void> {
        const file = mp4box.createFile(false);
        return new Promise((resolve) => {
            (content as any).fileStart = 0;
            file.onReady = (info) => {
                const track = info.tracks[0];
                this.numFrames = track.nb_samples;
                const config: VideoDecoderConfig = {
                    codec: track.codec,
                    codedHeight: track.video.height,
                    codedWidth: track.video.width,
                    description: description(file, track),
                };
                this.decoder = new VideoDecoder({
                    output: (v) => {
                        this.resolve(v);
                    },
                    error: console.error,
                });
                this.decoder.configure(config);

                file.onSamples = (id, user, samples) => {
                    file.stop();
                    file.flush();
                    this.samples = samples;
                    resolve();
                };
                file.setExtractionOptions(track.id, track);
                file.start();
            };
            file.appendBuffer(content as Mp4BoxBuffer);
            file.flush();
        });
    }

    private async getNextFrame(): Promise<VideoFrame> {
        return new Promise<VideoFrame>((resolve) => {
            this.resolve = resolve;
            const s = this.samples[this.currentFrame];
            this.currentFrame = (this.currentFrame + this.numFrames - 1 + this.direction) % (this.numFrames - 1);
            console.log(this.currentFrame);
            this.decoder.decode(sampleToChunk(s));
            this.decoder.flush(); // TODO smarter - several in a row
        });
    }

    public async *iterate(): AsyncGenerator<VideoFrame, VideoFrame, unknown> {
        while (true) {
            yield await this.getNextFrame();
        }
    }
}
const BUFFER = 30;
const THRESHOLD = 2;

class Kokoko6 {
    public currentFrame: number = 0;
    private direction = 1;
    private numFrames: number;
    private decoder: VideoDecoder;
    private samples: MP4Sample[];
    private videoFrames: VideoFrame[] = [];

    private left: number;
    private resolve: () => void;

    public async init(content: ArrayBuffer): Promise<void> {
        const file = mp4box.createFile(false);
        return new Promise((resolve) => {
            (content as any).fileStart = 0;
            file.onReady = (info) => {
                const track = info.tracks[0];
                this.numFrames = track.nb_samples;
                const config: VideoDecoderConfig = {
                    codec: track.codec,
                    codedHeight: track.video.height,
                    codedWidth: track.video.width,
                    description: description(file, track),
                };
                this.decoder = new VideoDecoder({
                    output: (v) => {
                        // console.log(v, this.left);
                        this.left--;
                        this.videoFrames.push(v);
                        if (this.left === 0) this.resolve();
                    },
                    error: console.error,
                });
                this.decoder.configure(config);

                file.onSamples = (id, user, samples) => {
                    file.stop();
                    file.flush();
                    this.samples = samples;
                    this.prefetch().then(resolve);
                };
                file.setExtractionOptions(track.id, track);
                file.start();
            };
            file.appendBuffer(content as Mp4BoxBuffer);
            file.flush();
        });
    }

    public async setDirection(dir: "fwd" | "bwd") {
        this.direction = dir === "fwd" ? 1 : -1;
        this.videoFrames = [];
        await this.prefetch();
        // TODO prefetch frames
    }

    private async getNextFrame(): Promise<VideoFrame> {
        return new Promise<VideoFrame>(async (resolve) => {
            this.prefetch();
            const interval = setInterval(() => {
                if (this.videoFrames.length === 0) return;
                this.currentFrame = (this.currentFrame + this.numFrames - 1 + this.direction) % (this.numFrames - 1);
                console.log(this.currentFrame);
                const v = this.videoFrames.shift();
                clearInterval(interval);
                resolve(v);
            }, 10);
        });
    }

    private async prefetch() {
        return new Promise<void>((resolve) => {
            if (this.videoFrames.length < THRESHOLD) {
                let left = BUFFER;
                let curr = this.currentFrame;
                while (left > 0) {
                    const s = this.samples[curr];
                    curr = (curr + this.numFrames - 1 + this.direction) % (this.numFrames - 1);
                    this.decoder.decode(sampleToChunk(s));
                    left--;
                }
                this.left = BUFFER;
                this.resolve = resolve;
                this.decoder.flush(); // TODO smarter - several in a row
            } else {
                resolve();
            }
        });
    }

    public async *iterate(): AsyncGenerator<VideoFrame, VideoFrame, unknown> {
        while (true) {
            yield await this.getNextFrame();
        }
    }
}

const Mp4Content = () => {
    // Log.setLogLevel(Log.debug);
    const videoManager = new Kokoko6();
    let frameSource: AsyncGenerator<VideoFrame, VideoFrame, unknown>;
    let info: VideoInfo;
    const [playing, setPlaying] = createSignal(false);
    const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
    let lastTime = 0;

    createEffect(async () => {
        const [{ content }, videoInfo] = await videoRepo.getVideo(hash());
        info = videoInfo;
        await videoManager.init(content);
        frameSource = videoManager.iterate();
    });

    createEffect(() => {
        videoManager.setDirection(dir());
    });

    const paint = async () => {
        const { value: s } = await frameSource.next();
        const c = canvas();
        c.width = s.displayWidth;
        c.height = s.displayHeight;
        c.getContext("2d").drawImage(s, 0, 0);
        s.close();
    };

    const playNext = async () => {
        if (!playing()) return;

        await paint();
        console.log(performance.now() - lastTime);
        lastTime = performance.now();

        playNext();
    };

    const play = async () => {
        if (playing()) {
            setPlaying(false);
        } else {
            setPlaying(true);
            await playNext();
        }
    };

    const addFrames = (n: number): number => {
        const nextFrame = videoManager.currentFrame + n;
        return (nextFrame + (info.frames - 1)) % (info.frames - 1);
    };

    const step = async (n: number) => {
        videoManager.currentFrame = addFrames(n);
        await paint();
    };

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
