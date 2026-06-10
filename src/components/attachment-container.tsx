import { Colors } from '@/constants/theme';
import { useContactPreviewBeforeSentStore } from '@/store/contact-preview-before-sent';
import { useFilePreviewBeforeSentStore } from '@/store/file-preview-before-sent';
import { useImagePreviewBeforeSentStore } from '@/store/image-preview-before-sent';
import { useVideoPreviewBeforeSentStore } from '@/store/video-preview-before-sent';
import {
    BottomSheetModal,
    TouchableOpacity as BottomSheetTouchableOpacity,
    BottomSheetView,
} from '@gorhom/bottom-sheet';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { IconSource } from 'react-native-paper/lib/typescript/components/Icon';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming,
    type SharedValue
} from 'react-native-reanimated';
import { ThemedText } from './themed-text';

export const ATTACHMENT_SHEET_BASE_HEIGHT = 120;
const PRESENT_RETRY_LIMIT = 8;
const PRESENT_RETRY_DELAY_MS = 120;

type Props = {
    visible: boolean;
    openRequestKey: number;
    onRequestClose?: () => void;
    onSheetStateChange?: (isOpen: boolean) => void;
    sheetHeight: number;
    animatedIndex: SharedValue<number>;
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
    background,
    border,
    secondary
}: {
    item: ItemButton;
    scale: any;
    background: string;
    border: string;
    secondary: string;
}) => {
    const buttonStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: scale.value },
        ],
    }));

    return (
        <Animated.View style={buttonStyle}>
            <BottomSheetTouchableOpacity style={styles.itemButtonContainer} onPress={item.onPress}>
                <View style={[styles.iconContainer, { backgroundColor: background, borderColor: border }]}>
                    <Icon
                        source={item.icon}
                        color={item.iconColor}
                        size={18}
                    />
                </View>
                <ThemedText style={[styles.labelButton, { color: secondary }]}>{item.label}</ThemedText>
            </BottomSheetTouchableOpacity>
        </Animated.View>
    );
};

const AttachmentContainer = ({ visible, openRequestKey, onRequestClose, onSheetStateChange, sheetHeight, animatedIndex }: Props) => {
    const bottomSheetModalRef = useRef<React.ComponentRef<typeof BottomSheetModal>>(null);
    const presentFrameRef = useRef<number | null>(null);
    const presentRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const presentAttemptRef = useRef(0);
    const hasPresentedRef = useRef(false);
    const visibleRef = useRef(visible);
    const sheetOpenRef = useRef(false);
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const isDark = scheme === 'dark';
    const showImagePreview = useImagePreviewBeforeSentStore((state) => state.show);
    const showVideoPreview = useVideoPreviewBeforeSentStore((state) => state.show);
    const showFilePreview = useFilePreviewBeforeSentStore((state) => state.show);
    const showContactPreview = useContactPreviewBeforeSentStore((state) => state.show);

    const contentOpacity = useSharedValue(0);

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

    const snapPoints = useMemo(() => [sheetHeight], [sheetHeight]);

    const handleDismiss = useCallback(() => {
        hasPresentedRef.current = false;
        onRequestClose?.();
    }, [onRequestClose]);

    const clearPendingPresent = useCallback(() => {
        if (presentFrameRef.current !== null) {
            cancelAnimationFrame(presentFrameRef.current);
            presentFrameRef.current = null;
        }

        if (presentRetryTimeoutRef.current) {
            clearTimeout(presentRetryTimeoutRef.current);
            presentRetryTimeoutRef.current = null;
        }
    }, []);

    const startPresentAttempts = useCallback(() => {
        clearPendingPresent();
        presentAttemptRef.current = 0;

        const attemptPresent = () => {
            if (!visibleRef.current || sheetOpenRef.current) {
                return;
            }

            hasPresentedRef.current = true;
            bottomSheetModalRef.current?.present();

            presentFrameRef.current = requestAnimationFrame(() => {
                presentFrameRef.current = null;

                if (!visibleRef.current || sheetOpenRef.current) {
                    return;
                }

                bottomSheetModalRef.current?.snapToIndex(0);
            });

            presentAttemptRef.current += 1;

            if (presentAttemptRef.current < PRESENT_RETRY_LIMIT) {
                presentRetryTimeoutRef.current = setTimeout(() => {
                    presentRetryTimeoutRef.current = null;
                    attemptPresent();
                }, PRESENT_RETRY_DELAY_MS);
            }
        };

        attemptPresent();
    }, [clearPendingPresent]);

    const handleSheetChange = useCallback((index: number) => {
        const isOpen = index >= 0;
        sheetOpenRef.current = isOpen;
        onSheetStateChange?.(isOpen);

        if (isOpen) {
            clearPendingPresent();
        }
    }, [clearPendingPresent, onSheetStateChange]);

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
        visibleRef.current = visible;
        clearPendingPresent();

        if (visible) {
            startPresentAttempts();

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
            sheetOpenRef.current = false;
            onSheetStateChange?.(false);

            if (hasPresentedRef.current) {
                bottomSheetModalRef.current?.dismiss();
            }

            contentOpacity.value = withTiming(0, {
                duration: 200,
            });

            buttonScales.forEach((scale) => {
                scale.value = withTiming(0, { duration: 200 });
            });
        }

        return clearPendingPresent;
    }, [
        buttonScales,
        clearPendingPresent,
        contentOpacity,
        onSheetStateChange,
        openRequestKey,
        startPresentAttempts,
        visible,
    ]);

    const contentStyle = useAnimatedStyle(() => ({
        opacity: contentOpacity.value,
    }));

    return (
        <BottomSheetModal
            ref={bottomSheetModalRef}
            snapPoints={snapPoints}
            animatedIndex={animatedIndex}
            enableDynamicSizing={false}
            enablePanDownToClose
            enableOverDrag={false}
            keyboardBehavior="interactive"
            android_keyboardInputMode="adjustResize"
            backgroundStyle={[
                styles.background,
                { backgroundColor: colors.background }
            ]}
            handleIndicatorStyle={{ backgroundColor: colors.textSecondary + '66' }}
            handleStyle={styles.handle}
            onChange={handleSheetChange}
            onDismiss={handleDismiss}
        >
            <BottomSheetView style={styles.sheet}>
                <Animated.View style={[styles.content, contentStyle]}>
                    <View style={styles.rowContent}>
                        {itemButtons.slice(0, 3).map((item, idx) => (
                            <AttachmentButton
                                key={item.key}
                                item={item}
                                scale={buttonScales[idx]}
                                background={colors.background}
                                border={colors.indicator}
                                secondary={colors.textSecondary + '70'}
                            />
                        ))}
                    </View>
                    {itemButtons.length > 3 ? (
                        <View style={styles.rowContent}>
                            {itemButtons.slice(3, 6).map((item, idx) => (
                                <AttachmentButton
                                    key={item.key}
                                    item={item}
                                    scale={buttonScales[idx + 3]}
                                    background={colors.background}
                                    border={colors.indicator}
                                    secondary={colors.textSecondary + '70'}
                                />
                            ))}
                        </View>
                    ) : null}
                </Animated.View>
            </BottomSheetView>
        </BottomSheetModal>
    );
};

const styles = StyleSheet.create({
    background: {
        borderRadius: 0,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
    },
    handle: {
        paddingTop: 8,
        paddingBottom: 4,
    },
    sheet: {
        flex: 1,
    },
    content: {
        flex: 1,
        flexDirection: 'column',
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 18,
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
        paddingVertical: 8,
        paddingHorizontal: 32,
        borderRadius: 99,
        borderWidth: 1
    },
    labelButton: {
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 15
    }
});

export default AttachmentContainer;
