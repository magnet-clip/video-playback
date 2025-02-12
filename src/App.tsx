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
import mp4box, { MP4ArrayBuffer, MP4File } from "mp4box";
import { Kokoko6 } from "./kokoko";

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

const Mp4Content = () => {
    // Log.setLogLevel(Log.debug);
    const videoManager = new Kokoko6();
    let frameSource: Generator<VideoFrame, VideoFrame, unknown>;
    let info: VideoInfo;
    const [playing, setPlaying] = createSignal(false);
    const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
    const [frame, setFrame] = createSignal(0);

    createEffect(async () => {
        const [{ content }, videoInfo] = await videoRepo.getVideo(hash());
        info = videoInfo;
        await videoManager.init(content);
        frameSource = videoManager.iterate();
    });

    createEffect(
        on(dir, () => {
            const p = playing();
            setPlaying(false);
            videoManager.setDirection(dir() === "fwd" ? 1 : -1);
            if (p) play();
        }),
    );

    const paint = () => {
        const { value: s } = frameSource.next();
        const c = canvas();
        c.width = s.codedWidth;
        c.height = s.codedHeight;
        c.getContext("2d").drawImage(s, 0, 0);
    };

    const play = () => {
        if (playing()) {
            setPlaying(false);
        } else {
            setPlaying(true);
            let lastTime = performance.now();
            const interval = setInterval(() => {
                if (playing()) {
                    paint();
                    console.log(`${Math.round(performance.now() - lastTime)}ms`);
                    lastTime = performance.now();
                    setFrame(videoManager.currentFrame);
                } else {
                    clearInterval(interval);
                }
            }, Math.round(1000 / info.fps));
        }
    };

    const step = (dir: "fwd" | "bwd") => {
        videoManager.setDirection(dir === "fwd" ? 1 : -1);
        paint();
        setFrame(videoManager.currentFrame);
    };

    return (
        <Show when={hash()}>
            <canvas ref={setCanvas} style={{ width: "100%" }} />
            <div style={{ display: "flex", "flex-direction": "row", width: "100%", "align-items": "center" }}>
                <span title="Step 1 frame back">
                    <IconButton onClick={() => step("bwd")}>
                        <SkipPreviousIcon />
                    </IconButton>
                </span>
                <span title="Play / pause">
                    <IconButton onClick={play}>{playing() ? <PauseIcon /> : <PlayArrowIcon />}</IconButton>
                </span>
                <span title="Step 1 frame forth">
                    <IconButton onClick={() => step("fwd")}>
                        <SkipNextIcon />
                    </IconButton>
                </span>
                <span>{frame()}</span>
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
