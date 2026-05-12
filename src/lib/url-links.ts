const URL_PATTERN = String.raw`\b(?:https?:\/\/|www\.)[^\s<>"']+`;
const TRAILING_URL_PUNCTUATION = /[.,!?;:)\]}]+$/;

export type UrlTextPart = {
    text: string;
    isUrl: boolean;
    normalizedUrl?: string;
};

function trimTrailingUrlPunctuation(value: string) {
    return value.replace(TRAILING_URL_PUNCTUATION, "");
}

export function normalizeDetectedUrl(value: string): string | null {
    const trimmed = trimTrailingUrlPunctuation(value.trim());
    const withProtocol = /^www\./i.test(trimmed)
        ? `https://${trimmed}`
        : trimmed;

    try {
        const url = new URL(withProtocol);

        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return null;
        }

        return url.toString();
    } catch {
        return null;
    }
}

export function findFirstUrl(text: string): string | null {
    const matcher = new RegExp(URL_PATTERN, "gi");
    let match = matcher.exec(text);

    while (match) {
        const normalizedUrl = normalizeDetectedUrl(match[0]);

        if (normalizedUrl) {
            return normalizedUrl;
        }

        match = matcher.exec(text);
    }

    return null;
}

export function splitTextByUrls(text: string): UrlTextPart[] {
    if (!text) {
        return [];
    }

    const parts: UrlTextPart[] = [];
    const matcher = new RegExp(URL_PATTERN, "gi");
    let cursor = 0;
    let match = matcher.exec(text);

    while (match) {
        const rawValue = match[0];
        const urlText = trimTrailingUrlPunctuation(rawValue);
        const normalizedUrl = normalizeDetectedUrl(urlText);
        const start = match.index;
        const urlEnd = start + urlText.length;

        if (!normalizedUrl || urlText.length === 0) {
            match = matcher.exec(text);
            continue;
        }

        if (start > cursor) {
            parts.push({
                text: text.slice(cursor, start),
                isUrl: false,
            });
        }

        parts.push({
            text: text.slice(start, urlEnd),
            isUrl: true,
            normalizedUrl,
        });

        cursor = urlEnd;
        match = matcher.exec(text);
    }

    if (cursor < text.length) {
        parts.push({
            text: text.slice(cursor),
            isUrl: false,
        });
    }

    return parts.length > 0
        ? parts
        : [
            {
                text,
                isUrl: false,
            },
        ];
}
