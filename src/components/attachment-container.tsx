import { Colors } from '@/constants/theme';
import { useContactPreviewBeforeSentStore } from '@/store/contact-preview-before-sent';
import { useFilePreviewBeforeSentStore } from '@/store/file-preview-before-sent';
import { useImagePreviewBeforeSentStore } from '@/store/image-preview-before-sent';
import { useVideoPreviewBeforeSentStore } from '@/store/video-preview-before-sent';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo } from 'react';
import { Alert, StyleSheet, TouchableOpacity, useColorScheme, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { IconSource } from 'react-native-paper/lib/typescript/components/Icon';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming
} from 'react-native-reanimated';
import { ThemedText } from './themed-text';

type Props = {
    visible: boolean;
    onRequestClose?: () => void;
}

type ItemButton = {
    key: string;
    label: string;
    icon: IconSource;
    iconColor: string;
    backgroundColor: string;
    onPress: () => void;
}

const AttachmentButton = ({
    item,
    scale,
}: {
    item: ItemButton;
    scale: any;
}) => {
    const buttonStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: scale.value },
        ],
    }));

    return (
        <Animated.View style={buttonStyle}>
            <TouchableOpacity style={styles.itemButtonContainer} onPress={item.onPress}>
                <View style={[styles.iconContainer, { backgroundColor: item.backgroundColor }]}>
                    <Icon
                        source={item.icon}
                        color={item.iconColor}
                        size={26}
                    />
                </View>
                <ThemedText style={styles.labelButton}>{item.label}</ThemedText>
            </TouchableOpacity>
        </Animated.View>
    );
};

const AttachmentContainer = ({ visible, onRequestClose }: Props) => {
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const isDark = scheme === 'dark';
    const showImagePreview = useImagePreviewBeforeSentStore((state) => state.show);
    const showVideoPreview = useVideoPreviewBeforeSentStore((state) => state.show);
    const showFilePreview = useFilePreviewBeforeSentStore((state) => state.show);
    const showContactPreview = useContactPreviewBeforeSentStore((state) => state.show);

    const maskScale = useSharedValue(0);
    const contentOpacity = useSharedValue(0);
    const borderRadiusValue = useSharedValue(500);

    const buttonScale0 = useSharedValue(0);
    const buttonScale1 = useSharedValue(0);
    const buttonScale2 = useSharedValue(0);
    const buttonScale3 = useSharedValue(0);
    const buttonScale4 = useSharedValue(0);
    const buttonScale5 = useSharedValue(0);
    const buttonScales = useMemo(
        () => [
            buttonScale0,
            buttonScale1,
            buttonScale2,
            buttonScale3,
            buttonScale4,
            buttonScale5,
        ],
        [
            buttonScale0,
            buttonScale1,
            buttonScale2,
            buttonScale3,
            buttonScale4,
            buttonScale5,
        ]
    );

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (status !== 'granted') {
            Alert.alert('Permission required', 'Please allow access to your photo library.')
            return
        }

        const picked = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            allowsEditing: false,
            allowsMultipleSelection: false,
            quality: 0.8,
        })

        if (picked.canceled) return

        const localUri = picked.assets[0].uri;
        const mediaType = picked.assets[0].type;
        onRequestClose?.();

        if (mediaType === 'image') {
            showImagePreview(localUri);
        } else if (mediaType === 'video' || mediaType === 'pairedVideo') {
            showVideoPreview(localUri);
        }
    };

    const pickDocument = async () => {
        const picked = await DocumentPicker.getDocumentAsync({
            copyToCacheDirectory: true,
            multiple: false,
        });

        if (picked.canceled || !picked.assets[0]) return;

        const file = picked.assets[0];
        onRequestClose?.();
        showFilePreview({
            uri: file.uri,
            name: file.name,
            mimeType: file.mimeType ?? null,
            size: file.size ?? null,
        });
    };

    const itemButtons: ItemButton[] = [
        {
            key: 'photos',
            label: 'Photos',
            icon: 'image-multiple',
            iconColor: '#3B82F6',
            backgroundColor: isDark ? '#172554' : '#EFF6FF',
            onPress: () => pickImage()
        },
        {
            key: 'contact',
            label: 'Contact',
            icon: 'account-circle',
            iconColor: '#8B5CF6',
            backgroundColor: isDark ? '#3B0764' : '#F5F3FF',
            onPress: () => {
                onRequestClose?.();
                showContactPreview();
            }
        },
        {
            key: 'document',
            label: 'Document',
            icon: 'file-document',
            iconColor: '#EF4444',
            backgroundColor: isDark ? '#450A0A' : '#FEF2F2',
            onPress: () => void pickDocument()
        }
    ];

    useEffect(() => {
        if (visible) {
            borderRadiusValue.value = withTiming(100, {
                duration: 500,
                easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            });

            maskScale.value = withTiming(1, {
                duration: 900,
                easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            });

            contentOpacity.value = withTiming(1, {
                duration: 500,
            });

            buttonScales.forEach((scale, index) => {
                const reversedIndex = buttonScales.length - 1 - index;

                scale.value = withDelay(
                    reversedIndex * 20,
                    withTiming(1, { duration: 200 })
                );
            });
        } else {
            borderRadiusValue.value = withTiming(500, {
                duration: 400,
                easing: Easing.bezier(0.4, 0, 0.2, 1),
            });

            maskScale.value = withTiming(0, {
                duration: 400,
                easing: Easing.bezier(0.4, 0, 0.2, 1),
            });

            contentOpacity.value = withTiming(0, {
                duration: 200,
            });

            buttonScales.forEach((scale) => {
                scale.value = withTiming(0, { duration: 200 });
            });
        }
    }, [
        borderRadiusValue,
        buttonScales,
        contentOpacity,
        maskScale,
        visible,
    ]);

    const circleMaskStyle = useAnimatedStyle(() => ({
        transform: [{ scale: maskScale.value }],
        borderTopLeftRadius: borderRadiusValue.value,
        borderTopRightRadius: borderRadiusValue.value,
        borderBottomLeftRadius: borderRadiusValue.value,
        borderBottomRightRadius: 0,
        bottom: 0,
        right: 0,
    }));

    const contentStyle = useAnimatedStyle(() => ({
        opacity: contentOpacity.value,
    }));

    return (
        <Animated.View
            pointerEvents={visible ? 'auto' : 'none'}
            style={[
                styles.attachmentContainer,
                {
                    backgroundColor: 'transparent',
                    opacity: visible ? 1 : 0,
                }
            ]}
        >
            <Animated.View
                style={[
                    styles.circleMask,
                    circleMaskStyle,
                    { backgroundColor: colors.background }
                ]}
            />
            <Animated.View style={[styles.content, contentStyle]}>
                <View style={styles.rowContent}>
                    {itemButtons.slice(0, 3).map((item, idx) => (
                        <AttachmentButton
                            key={item.key}
                            item={item}
                            scale={buttonScales[idx]}
                        />
                    ))}
                </View>
                <View style={styles.rowContent}>
                    {itemButtons.slice(3, 6).map((item, idx) => (
                        <AttachmentButton
                            key={item.key}
                            item={item}
                            scale={buttonScales[idx + 3]}
                        />
                    ))}
                </View>
            </Animated.View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    attachmentContainer: {
        position: 'absolute',
        left: 10,
        right: 10,
        top: -130,
        height: 120,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: 'transparent',
    },
    circleMask: {
        position: 'absolute',
        width: 1000,
        height: 1000,
        bottom: 0,
        right: 0,
        transformOrigin: 'bottom right',
    },
    content: {
        flex: 1,
        flexDirection: 'column',
        padding: 20,
        gap: 16,
    },
    rowContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    itemButtonContainer: {
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6
    },
    iconContainer: {
        paddingVertical: 16,
        paddingHorizontal: 28,
        borderRadius: 99
    },
    labelButton: {
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 15
    }
});

export default AttachmentContainer;
