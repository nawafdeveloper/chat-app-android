const PREVIEW_MAX_DIMENSION = 56;
const PREVIEW_QUALITY = 0.35;

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Failed to load image preview source."));
        image.src = url;
    });
}

function createCanvas(width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function scaleDimensions(width: number, height: number) {
    if (width <= PREVIEW_MAX_DIMENSION && height <= PREVIEW_MAX_DIMENSION) {
        return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
    }

    const scale = Math.min(
        PREVIEW_MAX_DIMENSION / width,
        PREVIEW_MAX_DIMENSION / height
    );

    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

export async function getMessageMediaDimensions(
    file: File
): Promise<{ width: number; height: number } | null> {
    if (file.type.startsWith("image/")) {
        const objectUrl = URL.createObjectURL(file);

        try {
            const image = await loadImage(objectUrl);

            return {
                width: Math.max(1, image.naturalWidth || 1),
                height: Math.max(1, image.naturalHeight || 1),
            };
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }

    if (file.type.startsWith("video/")) {
        const objectUrl = URL.createObjectURL(file);

        try {
            const video = document.createElement("video");
            video.src = objectUrl;
            video.muted = true;
            video.playsInline = true;
            video.preload = "metadata";

            await new Promise<void>((resolve, reject) => {
                video.onloadedmetadata = () => resolve();
                video.onerror = () =>
                    reject(new Error("Failed to load video metadata."));
            });

            return {
                width: Math.max(1, video.videoWidth || 1),
                height: Math.max(1, video.videoHeight || 1),
            };
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }

    return null;
}

function canvasToPreviewBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error("Failed to generate media preview blob."));
                    return;
                }

                resolve(blob);
            },
            "image/jpeg",
            PREVIEW_QUALITY
        );
    });
}

export async function createMessageMediaPreview(file: File): Promise<Blob | null> {
    if (file.type.startsWith("image/")) {
        const objectUrl = URL.createObjectURL(file);

        try {
            const image = await loadImage(objectUrl);
            const scaled = scaleDimensions(image.naturalWidth, image.naturalHeight);
            const canvas = createCanvas(scaled.width, scaled.height);
            const context = canvas.getContext("2d");

            if (!context) {
                throw new Error("Failed to render image preview.");
            }

            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "low";
            context.drawImage(image, 0, 0, scaled.width, scaled.height);

            return await canvasToPreviewBlob(canvas);
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }

    if (file.type.startsWith("video/")) {
        const objectUrl = URL.createObjectURL(file);

        try {
            const video = document.createElement("video");
            video.src = objectUrl;
            video.muted = true;
            video.playsInline = true;
            video.preload = "metadata";

            await new Promise<void>((resolve, reject) => {
                video.onloadedmetadata = () => resolve();
                video.onerror = () =>
                    reject(new Error("Failed to load video preview source."));
            });

            const targetTime = Math.min(
                Math.max((video.duration || 0) * 0.15, 0.1),
                Math.max((video.duration || 0) - 0.1, 0.1)
            );

            await new Promise<void>((resolve, reject) => {
                const handleSeeked = () => {
                    cleanup();
                    resolve();
                };
                const handleError = () => {
                    cleanup();
                    reject(new Error("Failed to seek video preview frame."));
                };
                const cleanup = () => {
                    video.removeEventListener("seeked", handleSeeked);
                    video.removeEventListener("error", handleError);
                };

                video.addEventListener("seeked", handleSeeked);
                video.addEventListener("error", handleError);

                try {
                    video.currentTime = targetTime;
                } catch {
                    cleanup();
                    resolve();
                }
            });

            const scaled = scaleDimensions(video.videoWidth || 1, video.videoHeight || 1);
            const canvas = createCanvas(scaled.width, scaled.height);
            const context = canvas.getContext("2d");

            if (!context) {
                throw new Error("Failed to render video preview.");
            }

            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "low";
            context.drawImage(video, 0, 0, scaled.width, scaled.height);

            return await canvasToPreviewBlob(canvas);
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }

    return null;
}
