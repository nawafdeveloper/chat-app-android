export type AvatarSource =
    | string
    | null
    | undefined
    | {
        imageUrl?: unknown;
        image_url?: unknown;
        avatarUrl?: unknown;
        avatar_url?: unknown;
        mediaUrl?: unknown;
        media_url?: unknown;
        url?: unknown;
        uri?: unknown;
        src?: unknown;
        href?: unknown;
        path?: unknown;
        objectKey?: unknown;
        object_key?: unknown;
        key?: unknown;
        source?: unknown;
        avatar?: unknown;
        image?: unknown;
        media?: unknown;
        file?: unknown;
        profileImage?: unknown;
        profile_image?: unknown;
    };

const STRING_KEYS = [
    "imageUrl",
    "image_url",
    "avatarUrl",
    "avatar_url",
    "mediaUrl",
    "media_url",
    "url",
    "uri",
    "src",
    "href",
    "path",
] as const;

const OBJECT_KEY_KEYS = ["objectKey", "object_key", "key"] as const;
const NESTED_KEYS = [
    "source",
    "avatar",
    "image",
    "media",
    "file",
    "profileImage",
    "profile_image",
] as const;

function nonEmptyString(value: unknown): string {
    return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function resolveAvatarSource(value: AvatarSource, depth = 0): string {
    if (!value || depth > 3) {
        return "";
    }

    const directValue = nonEmptyString(value);
    if (directValue) {
        return directValue;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const resolved = resolveAvatarSource(item as AvatarSource, depth + 1);
            if (resolved) {
                return resolved;
            }
        }

        return "";
    }

    if (typeof value !== "object") {
        return "";
    }

    const record = value as Record<string, unknown>;

    for (const key of STRING_KEYS) {
        const resolved = nonEmptyString(record[key]);
        if (resolved) {
            return resolved;
        }
    }

    for (const key of OBJECT_KEY_KEYS) {
        const resolved = nonEmptyString(record[key]);
        if (resolved) {
            return resolved;
        }
    }

    for (const key of NESTED_KEYS) {
        const resolved = resolveAvatarSource(record[key] as AvatarSource, depth + 1);
        if (resolved) {
            return resolved;
        }
    }

    return "";
}
