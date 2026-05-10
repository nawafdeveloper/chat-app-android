import { Colors } from '@/constants/theme';
import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, useColorScheme, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { IconSource } from 'react-native-paper/lib/typescript/components/Icon';
import Animated, {
    Easing,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming
} from 'react-native-reanimated';
import { ThemedText } from './themed-text';

type Props = {
    visible: boolean;
}

type ItemButton = {
    key: string;
    label: string;
    icon: IconSource;
    iconColor: string;
    backgroundColor: string;
    onPress: () => void;
}

const AttachmentContainer = ({ visible }: Props) => {
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const isDark = scheme === 'dark';

    const maskScale = useSharedValue(0);
    const contentOpacity = useSharedValue(0);
    const pointerEventsValue = useSharedValue<'none' | 'auto'>('none');
    const elevationValue = useSharedValue(0);
    const borderRadiusValue = useSharedValue(500);

    const buttonScales = [
        useSharedValue(0),
        useSharedValue(0),
        useSharedValue(0),
        useSharedValue(0),
        useSharedValue(0),
        useSharedValue(0)
    ];

    const itemButtons: ItemButton[] = [
        {
            key: 'photos',
            label: 'Photos',
            icon: 'image-multiple',
            iconColor: '#3B82F6',
            backgroundColor: isDark ? '#172554' : '#EFF6FF',
            onPress: () => { }
        },
        {
            key: 'contact',
            label: 'Contact',
            icon: 'account-circle',
            iconColor: '#8B5CF6',
            backgroundColor: isDark ? '#3B0764' : '#F5F3FF',
            onPress: () => { }
        },
        {
            key: 'document',
            label: 'Document',
            icon: 'file-document',
            iconColor: '#EF4444',
            backgroundColor: isDark ? '#450A0A' : '#FEF2F2',
            onPress: () => { }
        }
    ];

    useEffect(() => {
        if (visible) {
            pointerEventsValue.value = 'auto';
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
            pointerEventsValue.value = 'none';
            elevationValue.value = withTiming(0, { duration: 400 });

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
    }, [visible]);

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

    const containerStyle = useAnimatedStyle(() => ({
        pointerEvents: pointerEventsValue.value,
        zIndex: interpolate(elevationValue.value, [0, 10], [0, 999]),
    }));

    const getButtonStyle = (index: number) => {
        return useAnimatedStyle(() => ({
            transform: [
                { scale: buttonScales[index].value },
            ],
        }));
    };

    return (
        <Animated.View
            style={[
                styles.attachmentContainer,
                containerStyle,
                { backgroundColor: 'transparent' }
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
                    {itemButtons.slice(0, 3).map((item, idx) => {
                        const ButtonAnim = getButtonStyle(idx);
                        return (
                            <Animated.View key={item.key} style={ButtonAnim}>
                                <TouchableOpacity style={styles.itemButtonContainer}>
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
                    })}
                </View>
                <View style={styles.rowContent}>
                    {itemButtons.slice(3, 6).map((item, idx) => {
                        const ButtonAnim = getButtonStyle(idx + 3);
                        return (
                            <Animated.View key={item.key} style={ButtonAnim}>
                                <TouchableOpacity style={styles.itemButtonContainer}>
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
                    })}
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