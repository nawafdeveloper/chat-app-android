type ProgressCallback = (progress: {
    loaded: number;
    total: number;
    lengthComputable: boolean;
}) => void;

export type SyncProgressUpdate = {
    title: string;
    percentage: number;
};

export type SyncProgressCallback = (progress: SyncProgressUpdate) => void;

type RequestJsonWithProgressOptions = {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    onDownloadProgress?: ProgressCallback;
    onUploadProgress?: ProgressCallback;
};

export async function requestJsonWithProgress<T>(
    url: string,
    {
        method = "GET",
        headers,
        body,
        onDownloadProgress,
        onUploadProgress,
    }: RequestJsonWithProgressOptions = {}
) {
    return new Promise<T>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.open(method, url);

        for (const [key, value] of Object.entries(headers ?? {})) {
            xhr.setRequestHeader(key, value);
        }

        xhr.onprogress = (event) => {
            onDownloadProgress?.({
                loaded: event.loaded,
                total: event.total,
                lengthComputable: event.lengthComputable,
            });
        };

        if (xhr.upload) {
            xhr.upload.onprogress = (event) => {
                onUploadProgress?.({
                    loaded: event.loaded,
                    total: event.total,
                    lengthComputable: event.lengthComputable,
                });
            };
        }

        xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                reject(new Error(`Request failed with status ${xhr.status}`));
                return;
            }

            try {
                resolve(JSON.parse(xhr.responseText) as T);
            } catch (error) {
                reject(error);
            }
        };

        xhr.onerror = () => reject(new Error("Network request failed"));
        xhr.ontimeout = () => reject(new Error("Network request timed out"));
        xhr.onabort = () => reject(new Error("Network request aborted"));

        xhr.send(body);
    });
}

export function reportSyncProgress(
    onProgress: SyncProgressCallback | undefined,
    title: string,
    percentage: number
) {
    onProgress?.({
        title,
        percentage: Math.max(0, Math.min(100, Math.round(percentage))),
    });
}

export function reportMappedByteProgress({
    onProgress,
    title,
    start,
    end,
    loaded,
    total,
    lengthComputable,
}: {
    onProgress?: SyncProgressCallback;
    title: string;
    start: number;
    end: number;
    loaded: number;
    total: number;
    lengthComputable: boolean;
}) {
    if (!lengthComputable || total <= 0) {
        return;
    }

    const completedRatio = Math.max(0, Math.min(1, loaded / total));
    reportSyncProgress(onProgress, title, start + (end - start) * completedRatio);
}
