import {
    fetchAndDecryptProfileImage,
    parseManagedProfileImageUrl,
} from "@/lib/profile-image";
import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import { Text, useColorScheme, View } from "react-native";

type Props = {
    userId: string | null | undefined;
    imageUrl?: string | null;
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
    contactPhone,
    style,
    iconColor = "#999",
    backgroundColor = "#ccc",
    textColor = "#fff",
}: Props) {
    const [localUri, setLocalUri] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const schema = useColorScheme();

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
            if (!imageUrl) {
                if (mounted) setLocalUri(null);
                return;
            }

            setLocalUri(null);
            setFailed(false);

            const managedImage = parseManagedProfileImageUrl(imageUrl);

            if (!managedImage) {
                if (mounted) setLocalUri(imageUrl || null);
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
    }, [imageUrl]);

    // Case 1: Show image avatar (priority)
    if (localUri && !failed) {
        return (
            <Image
                source={{ uri: localUri }}
                contentFit="cover"
                style={style}
            />
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
                        backgroundColor: userId
                            ? `hsl(${hue}, ${bgSaturation}%, ${bgLightness}%)`
                            : backgroundColor,
                        justifyContent: "center",
                        alignItems: "center",
                    },
                ]}
            >
                <Text
                    style={{
                        color: userId
                            ? `hsl(${hue}, ${fgSaturation}%, ${fgLightness}%)`
                            : textColor,
                        fontSize: style?.width ? style.width * 0.4 : 16,
                        fontWeight: "bold",
                    }}
                >
                    {firstLetter}
                </Text>
            </View>
        );
    }

    // Case 3: Fallback to person icon (for phone number only or unknown)
    return (
        <View
            style={[
                style,
                {
                    backgroundColor: userId
                        ? `hsl(${hue}, ${bgSaturation}%, ${bgLightness}%)`
                        : backgroundColor,
                    justifyContent: "center",
                    alignItems: "center",
                },
            ]}
        >
            <MaterialIcons
                name="person"
                size={style?.width ? style.width * 0.5 : 24}
                color={userId
                    ? `hsl(${hue}, ${fgSaturation}%, ${fgLightness}%)`
                    : iconColor}
            />
        </View>
    );
}
