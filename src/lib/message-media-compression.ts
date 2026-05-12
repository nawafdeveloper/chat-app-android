"use client";

import type { Message } from "@/types/messages";

export const MESSAGE_MEDIA_TARGET_MAX_BYTES = 5 * 1024 * 1024;
export const MESSAGE_MEDIA_INPUT_MAX_BYTES = 50 * 1024 * 1024;

const IMAGE_MAX_DIMENSION = 4096;
const IMAGE_MIN_DIMENSION = 720;
const IMAGE_QUALITY_MAX = 0.92;
const IMAGE_QUALITY_MIN = 0.58;

type CompressibleAttachment = Extract<
    Message["attached_media"],
    "photo" | "video" | "voice" | "file"
>;

type PreparedMessageMediaFile = {
    file: File;
    originalFile: File;
    didCompress: boolean;
};

function isImageFile(file: File) {
    return file.type.startsWith("image/");
}

function getOutputImageType(file: File) {
    if (file.type === "image/png" || file.type === "image/webp") {
        return "image/webp";
    }

    return "image/jpeg";
}

function getOutputFileName(file: File, outputType: string) {
    const extension = outputType === "image/webp" ? "webp" : "jpg";
    const baseName = file.name.replace(/\.[^/.]+$/, "") || "image";

    return `${baseName}.${extension}`;
}

async function canvasToBlob(
    canvas: HTMLCanvasElement,
    type: string,
    quality: number
) {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                    return;
                }

                reject(new Error("Failed to compress image."));
            },
            type,
            quality
        );
    });
}

function getScaledDimensions(
    width: number,
    height: number,
    maxDimension: number
) {
    const largestDimension = Math.max(width, height);

    if (largestDimension <= maxDimension) {
        return { width, height };
    }

    const scale = maxDimension / largestDimension;

    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

async function renderImageToCanvas(file: File, maxDimension: number) {
    const bitmap = await createImageBitmap(file);
    const dimensions = getScaledDimensions(
        bitmap.width,
        bitmap.height,
        maxDimension
    );
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const context = canvas.getContext("2d", {
        alpha: true,
    });
    if (!context) {
        bitmap.close();
        throw new Error("Image compression is not supported in this browser.");
    }

    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    bitmap.close();

    return canvas;
}

async function compressImageFile(file: File) {
    const outputType = getOutputImageType(file);
    let maxDimension = IMAGE_MAX_DIMENSION;
    let bestBlob: Blob | null = null;

    while (maxDimension >= IMAGE_MIN_DIMENSION) {
        const canvas = await renderImageToCanvas(file, maxDimension);
        let low = IMAGE_QUALITY_MIN;
        let high = IMAGE_QUALITY_MAX;

        for (let index = 0; index < 7; index += 1) {
            const quality = (low + high) / 2;
            const blob = await canvasToBlob(canvas, outputType, quality);

            if (blob.size <= MESSAGE_MEDIA_TARGET_MAX_BYTES) {
                bestBlob = blob;
                low = quality;
            } else {
                high = quality;
            }
        }

        if (bestBlob) {
            return new File([bestBlob], getOutputFileName(file, outputType), {
                type: outputType,
                lastModified: Date.now(),
            });
        }

        maxDimension = Math.floor(maxDimension * 0.78);
    }

    throw new Error("This image could not be compressed under 5 MB.");
}

export async function prepareMessageMediaFile(
    file: File,
    attachedMedia: CompressibleAttachment
): Promise<PreparedMessageMediaFile> {
    if (file.size > MESSAGE_MEDIA_INPUT_MAX_BYTES) {
        throw new Error("Attachments must be 50 MB or smaller.");
    }

    if (file.size <= MESSAGE_MEDIA_TARGET_MAX_BYTES) {
        return {
            file,
            originalFile: file,
            didCompress: false,
        };
    }

    if (attachedMedia === "photo" || isImageFile(file)) {
        const compressedFile = await compressImageFile(file);

        if (compressedFile.size > MESSAGE_MEDIA_TARGET_MAX_BYTES) {
            throw new Error("This image could not be compressed under 5 MB.");
        }

        return {
            file: compressedFile,
            originalFile: file,
            didCompress: true,
        };
    }

    throw new Error(
        "This attachment is over 5 MB. Images can be compressed automatically; other file types must be 5 MB or smaller."
    );
}
