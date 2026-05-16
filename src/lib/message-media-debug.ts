export function createMediaDebugTraceId(prefix = "media") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readMediaDebugTraceId(request: Request): string | null {
    return request.headers.get("x-media-debug-id");
}

export function buildMediaDebugHeaders(
    debugTraceId?: string | null
): HeadersInit | undefined {
    if (!debugTraceId) {
        return undefined;
    }

    return {
        "x-media-debug-id": debugTraceId,
    };
}

export function logMediaDebug(
    step: string,
    details?: Record<string, unknown>
) {
    const timestamp = new Date().toISOString();

    if (details) {
        void forwardMediaDebugToServer(timestamp, step, details);
        return;
    }

    void forwardMediaDebugToServer(timestamp, step);
}

function forwardMediaDebugToServer(
    timestamp: string,
    step: string,
    details?: Record<string, unknown>
) {
    try {
        const href =
            typeof window !== "undefined" &&
            typeof window.location?.href === "string"
                ? window.location.href
                : "react-native";

        const payload = JSON.stringify({
            timestamp,
            step,
            details: details ?? null,
            source: "client",
            href,
        });

        void fetch("https://halabakk-web.nawaf-alhasosah.workers.dev/api/media-debug", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: payload,
            keepalive: true,
        });
    } catch {
        // Best-effort debug forwarding only.
    }
}
