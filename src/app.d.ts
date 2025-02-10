// https://github.com/gpac/mp4box.js/issues/233
declare module "mp4box" {
    interface MP4MediaTrack {
        id: number;
        created: Date;
        modified: Date;
        movie_duration: number;
        movie_timescale: number;
        layer: number;
        alternate_group: number;
        volume: number;
        track_width: number;
        track_height: number;
        timescale: number;
        duration: number;
        bitrate: number;
        codec: string;
        language: string;
        nb_samples: number;
    }

    interface MP4VideoData {
        width: number;
        height: number;
    }

    export interface MP4VideoTrack extends MP4MediaTrack {
        video: MP4VideoData;
        mdia: any;
    }

    interface MP4AudioData {
        sample_rate: number;
        channel_count: number;
        sample_size: number;
    }

    export interface MP4AudioTrack extends MP4MediaTrack {
        audio: MP4AudioData;
    }

    type MP4Track = MP4VideoTrack | MP4AudioTrack;

    export interface MP4Info {
        duration: number;
        timescale: number;
        fragment_duration: number;
        isFragmented: boolean;
        isProgressive: boolean;
        hasIOD: boolean;
        brands: string[];
        created: Date;
        modified: Date;
        tracks: MP4VideoTrack[];
        audioTracks: MP4AudioTrack[];
        videoTracks: MP4VideoTrack[];
    }

    export interface MP4Sample {
        alreadyRead: number;
        chunk_index: number;
        chunk_run_index: number;
        cts: number;
        data: Uint8Array;
        degradation_priority: number;
        depends_on: number;
        description: any;
        description_index: number;
        dts: number;
        duration: number;
        has_redundancy: number;
        is_depended_on: number;
        is_leading: number;
        is_sync: boolean;
        number: number;
        offset: number;
        size: number;
        timescale: number;
        track_id: number;
    }

    export interface MP4VideoTrack {
        id: number;
        name: string;
        references: any[];
        edits: [
            {
                segment_duration: number;
                media_time: number;
                media_rate_integer: number;
                media_rate_fraction: number;
            },
        ];
        created: Date;
        modified: Date;
        movie_duration: number;
        movie_timescale: number;
        layer: number;
        alternate_group: number;
        volume: number;
        matrix: Int32Array;
        track_width: number;
        track_height: number;
        timescale: number;
        duration: number;
        samples_duration: number;
        codec: string;
        kind: {
            schemeURI: string;
            value: string;
        };
        language: string;
        nb_samples: number;
        size: number;
        bitrate: number;
        type: "video";
        video: {
            width: number;
            height: number;
        };
    }

    export type MP4ArrayBuffer = ArrayBuffer & { fileStart: number };

    export type MP4TrackOptions = {
        width: number;
        height: number;
        id?: number;
        type?: string;
        timescale?: number;
        nb_samples?: number;
        duration?: number;
        layer?: number;
        media_duration?: number;
        language?: string;
        hdlr?: string;
        name?: string;
        hevcDecoderConfigRecord?: BufferSource;
        avcDecoderConfigRecord?: BufferSource;
        balance?: number;
        channel_count?: number;
        sample_size?: number;
        sample_rate?: number;
        namespace?: string;
        schema_location?: string;
        auxiliary_mime_types?: string;
        description?: any;
        description_boxes?: any[];
        default_sample_description_index?: number;
        default_sample_duration?: number;
        default_sample_size?: number;
        default_sample_flags?: number;
    };

    export type MP4SampleOptions = {
        is_sync?: boolean;
        sample_description_index?: number;
        cts?: number;
        dts?: number;
        duration?: number;
        is_leading?: number;
        depends_on?: number;
        is_depended_on?: number;
        has_redundancy?: number;
        degradation_priority?: number;
        subsamples?: any;
    };

    export interface MP4File {
        getBuffer(): ArrayBuffer;
        addTrack(trackOptions: MP4TrackOptions): number;
        addSample(track: any, ab: ArrayBuffer, sampleOptions: MP4SampleOptions): unknown;
        save(fileName: string): void;
        onMoovStart?: () => void;
        onReady?: (info: MP4Info) => void;
        onError?: (e: string) => void;
        onSidx?: (sidx: any) => void;
        onSamples?: (id: number, user: any, samples: MP4Sample[]) => any;
        onSegment: (id: any, user: any, buffer: any, sampleNumber: any, last: any) => any;
        setSegmentOptions: (track_id: any, user: any, options: any) => any;
        initializeSegmentation: () => any;
        getTrackById: (trackId: number) => MP4Track;

        appendBuffer(data: MP4ArrayBuffer): number;
        start(): void;
        stop(): void;
        flush(): void;
        releaseUsedSamples(trackId: number, sampleNumber: number): void;
        setExtractionOptions(
            trackId: number,
            user?: any,
            options?: { nbSamples?: number; rapAlignment?: number },
        ): void;
        getInfo(): MP4Info;
    }

    interface DataStream {
        getPosition?: () => number;
        position: number;
        buffer: ArrayBuffer;
    }

    export var DataStream: {
        readonly BIG_ENDIAN: boolean;
        prototype: DataStream;
        getPosition?: () => number;
        new (arrayBuffer: ArrayBuffer, byteOffset: number, endianness: boolean): DataStream;
    };

    export function createFile(param?: boolean): MP4File;

    export {};
}

interface VideoFrame {
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoFrame/codedHeight) */
    readonly codedHeight: number;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoFrame/codedRect) */
    readonly codedRect: DOMRectReadOnly | null;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoFrame/codedWidth) */
    readonly codedWidth: number;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoFrame/colorSpace) */
    readonly colorSpace: VideoColorSpace;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoFrame/displayHeight) */
    readonly displayHeight: number;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoFrame/displayWidth) */
    readonly displayWidth: number;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoFrame/duration) */
    readonly duration: number | null;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoFrame/format) */
    readonly format: VideoPixelFormat | null;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoFrame/timestamp) */
    readonly timestamp: number;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoFrame/visibleRect) */
    readonly visibleRect: DOMRectReadOnly | null;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoFrame/allocationSize) */
    allocationSize(options?: VideoFrameCopyToOptions): number;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoFrame/clone) */
    clone(): VideoFrame;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoFrame/close) */
    close(): void;
    copyTo(destination: BufferSource, options?: VideoFrameCopyToOptions): Promise<PlaneLayout[]>;
}

declare var VideoFrame: {
    prototype: VideoFrame;
    new (image: CanvasImageSource, init?: VideoFrameInit): VideoFrame;
    new (data: BufferSource, init: VideoFrameBufferInit): VideoFrame;
};

interface VideoEncoder extends EventTarget {
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoEncoder/encodeQueueSize) */
    readonly encodeQueueSize: number;
    ondequeue: ((this: VideoEncoder, ev: Event) => any) | null;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoEncoder/state) */
    readonly state: CodecState;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoEncoder/close) */
    close(): void;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoEncoder/configure) */
    configure(config: VideoEncoderConfig): void;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoEncoder/encode) */
    encode(frame: VideoFrame, options?: VideoEncoderEncodeOptions): void;
    flush(): Promise<void>;
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/VideoEncoder/reset) */
    reset(): void;
    addEventListener<K extends keyof VideoEncoderEventMap>(
        type: K,
        listener: (this: VideoEncoder, ev: VideoEncoderEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void;
    removeEventListener<K extends keyof VideoEncoderEventMap>(
        type: K,
        listener: (this: VideoEncoder, ev: VideoEncoderEventMap[K]) => any,
        options?: boolean | EventListenerOptions,
    ): void;
    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
    ): void;
}

declare var VideoEncoder: {
    prototype: VideoEncoder;
    new (init: VideoEncoderInit): VideoEncoder;
    isConfigSupported(config: VideoEncoderConfig): Promise<VideoEncoderSupport>;
};

declare let __BUILD_VERSION__: string;
