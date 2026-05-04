import { fetchAndDecryptProfileImage } from "@/lib/profile-image";
import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

type Props = {
    imageUrl?: string | null;
    style: any;
    iconColor?: string;
    backgroundColor?: string;
};

export function ChatAvatarImage({
    imageUrl,
    style,
    iconColor = "#999",
    backgroundColor = "#ccc",
}: Props) {
    const [localUri, setLocalUri] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let mounted = true;

        const load = async () => {
            setLocalUri(null);
            setFailed(false);

            const objectKey = imageUrl?.split("/api/profile-image/")[1];

            if (!objectKey) {
                if (mounted) setLocalUri(imageUrl || null);
                return;
            }

            try {
                const decryptedUri = await fetchAndDecryptProfileImage(objectKey);
                if (mounted) setLocalUri(decryptedUri);
            } catch {
                if (mounted) setFailed(true); // 🔥 important
            }
        };

        load();

        return () => {
            mounted = false;
        };
    }, [imageUrl]);

    // ✅ success
    if (localUri && !failed) {
        return (
            <Image
                source={{ uri: localUri }}
                contentFit="cover"
                style={style}
            />
        );
    }

    // ❌ fallback (not contact / decrypt failed)
    return (
        <View
            style={[
                style,
                {
                    backgroundColor,
                    justifyContent: "center",
                    alignItems: "center",
                },
            ]}
        >
            <MaterialIcons name="person" size={24} color={iconColor} />
        </View>
    );
}