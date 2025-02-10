import { openDB } from "idb";
import { VideoData, VideoInfo } from "./App";

const LAST_DB_VERSION = 1;
const VIDEO_INFO_TABLE = "video-info"; // hash -> arraybuffer
const VIDEO_DATA_TABLE = "video-data"; // hash -> fps, resolution, num of frames, size

const db = await openDB("playback", LAST_DB_VERSION, {
    upgrade: (db, oldVer, newVer) => {
        if (oldVer <= 1) {
            const videoInfo = db.createObjectStore(VIDEO_INFO_TABLE, {
                keyPath: "hash",
            });
            videoInfo.createIndex("hash", "hash");
            const videoData = db.createObjectStore(VIDEO_DATA_TABLE, {
                keyPath: "hash",
            });
            videoData.createIndex("hash", "hash");
        }
    },
});

class VideoRepo {
    public async addVideo(hash: string, content: ArrayBuffer, data: VideoInfo) {
        const t = db.transaction([VIDEO_INFO_TABLE, VIDEO_DATA_TABLE], "readwrite");
        const videoInfo = t.objectStore(VIDEO_INFO_TABLE);
        const record = await videoInfo.get(hash);
        if (record) {
            t.abort();
        } else {
            await videoInfo.add(data);
            const videoData = t.objectStore(VIDEO_DATA_TABLE);
            await videoData.add({ hash, content });
            t.commit();
        }
    }

    public async getVideo(hash: string): Promise<[VideoData, VideoInfo]> {
        return Promise.all([db.get(VIDEO_DATA_TABLE, hash), db.get(VIDEO_INFO_TABLE, hash)]);
    }

    public async getAllVideosInfo(): Promise<VideoInfo[]> {
        return await db.getAll(VIDEO_INFO_TABLE);
    }

    public async deleteVideo(hash: string) {
        await db.delete(VIDEO_DATA_TABLE, hash);
        await db.delete(VIDEO_INFO_TABLE, hash);
    }

    public async getVideoInfo(hash: string): Promise<VideoInfo> {
        return await db.get(VIDEO_INFO_TABLE, hash);
    }
}

export const videoRepo = new VideoRepo();
