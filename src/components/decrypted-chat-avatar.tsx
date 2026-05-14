import type { AvatarSource } from "@/lib/avatar-source";
import { resolveAvatarSource } from "@/lib/avatar-source";
import {
    fetchAndDecryptMessageMedia,
    isLocalMediaUri,
    parseManagedMessageMediaUrl,
} from "@/lib/message-media";
import {
    fetchAndDecryptProfileImage,
    parseManagedProfileImageUrl,
} from "@/lib/profile-image";
import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useMemo, useState } from "react";
import { useColorScheme, View } from "react-native";
import { ThemedText } from "./themed-text";

type Props = {
    userId: string | null | undefined;
    imageUrl?: AvatarSource;
    displayName?: string | null;
    contactPhone?: string | null;
    style: any;
    iconColor?: string;
    backgroundColor?: string;
    textColor?: string;
    chatType: "single" | "group" | undefined;
};

export function ChatAvatar({
    userId,
    imageUrl,
    displayName,
    style,
    iconColor = "#999",
    backgroundColor = "#ccc",
    textColor = "#fff",
    chatType,
}: Props) {
    const [localUri, setLocalUri] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const schema = useColorScheme();
    const avatarSource = useMemo(
        () => resolveAvatarSource(imageUrl),
        [imageUrl]
    );

    const getHue = (userId: string | null | undefined): number => {
        if (!userId) {
            return 0;
        }
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            hash = (hash << 5) - hash + userId.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash) % 360;
    };

    const hue = getHue(userId);

    // Adjust saturation and lightness based on color scheme
    const isDarkMode = schema === 'dark';

    // For dark mode: darker background, brighter text/icon
    // For light mode: lighter background, darker text/icon
    const bgSaturation = isDarkMode ? 35 : 45;
    const bgLightness = isDarkMode ? 12 : 85;
    const fgSaturation = isDarkMode ? 75 : 70;
    const fgLightness = isDarkMode ? 70 : 35;

    // Load encrypted image if needed
    useEffect(() => {
        let mounted = true;

        const load = async () => {
            if (!avatarSource) {
                if (mounted) {
                    setLocalUri(null);
                    setFailed(false);
                }
                return;
            }

            setLocalUri(null);
            setFailed(false);

            const managedImage = parseManagedProfileImageUrl(avatarSource);

            if (!managedImage) {
                const managedMessageMedia = parseManagedMessageMediaUrl(avatarSource);

                if (!managedMessageMedia) {
                    if (mounted) setLocalUri(avatarSource || null);
                    return;
                }

                try {
                    const decryptedUri = await fetchAndDecryptMessageMedia({
                        source: avatarSource,
                        fallbackExtension: "jpg",
                    });
                    if (!mounted) return;

                    if (decryptedUri && isLocalMediaUri(decryptedUri)) {
                        setLocalUri(decryptedUri);
                    } else {
                        setFailed(true);
                    }
                } catch {
                    if (mounted) setFailed(true);
                }
                return;
            }

            try {
                const decryptedUri = await fetchAndDecryptProfileImage(
                    managedImage.objectKey
                );
                if (mounted) setLocalUri(decryptedUri);
            } catch {
                if (mounted) setFailed(true);
            }
        };

        load();

        return () => {
            mounted = false;
        };
    }, [avatarSource]);

    // Case 1: Show image avatar (priority)
    if (localUri && !failed) {
        return (
            <Image
                source={{ uri: localUri }}
                contentFit="cover"
                style={style}
                onError={() => setFailed(true)}
            />
        );
    }

    const fallbackBackgroundColor = userId
        ? `hsl(${hue}, ${bgSaturation}%, ${bgLightness}%)`
        : backgroundColor;
    const fallbackForegroundColor = userId
        ? `hsl(${hue}, ${fgSaturation}%, ${fgLightness}%)`
        : iconColor;

    if (chatType === "group") {
        return (
            <View
                style={[
                    style,
                    {
                        backgroundColor: fallbackBackgroundColor,
                        justifyContent: "center",
                        alignItems: "center",
                    },
                ]}
            >
                <MaterialIcons
                    name="groups"
                    size={style?.width ? style.width * 0.52 : 24}
                    color={fallbackForegroundColor}
                />
            </View>
        );
    }

    // Case 2: Show text avatar with first letter of display name
    if (displayName && displayName !== "Unknown") {
        const firstLetter = displayName[0]?.toUpperCase();
        return (
            <View
                style={[
                    style,
                    {
                        backgroundColor: fallbackBackgroundColor,
                        justifyContent: "center",
                        alignItems: "center",
                    },
                ]}
            >
                <ThemedText
                    style={{
                        color: userId
                            ? `hsl(${hue}, ${fgSaturation}%, ${fgLightness}%)`
                            : textColor,
                        fontSize: style?.width ? style.width * 0.4 : 16,
                        lineHeight: style?.width ? style.width * 0.4 : 16,
                        fontWeight: "bold",
                    }}
                >
                    {firstLetter}
                </ThemedText>
            </View>
        );
    }

    // Case 3: Fallback to person icon (for phone number only or unknown)
    return (
        <View
            style={[
                style,
                {
                    backgroundColor: fallbackBackgroundColor,
                    justifyContent: "center",
                    alignItems: "center",
                },
            ]}
        >
            <MaterialIcons
                name="person"
                size={style?.width ? style.width * 0.5 : 24}
                color={fallbackForegroundColor}
            />
        </View>
    );
}
