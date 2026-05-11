import React from 'react';
import { Linking, StyleSheet, Text } from 'react-native';

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export const detectAndRenderLinks = (
    text: string,
    textStyle: any,
    linkColor: string = '#25D366'
) => {
    if (!text) return null;

    const parts = text.split(URL_REGEX);

    return parts.map((part, index) => {
        if (part.match(URL_REGEX)) {
            return (
                <Text
                    key={index}
                    style={[
                        textStyle,
                        styles.linkText,
                        { color: linkColor }
                    ]}
                    onPress={() => {
                        if (part.startsWith('http://') || part.startsWith('https://')) {
                            Linking.openURL(part);
                        } else {
                            Linking.openURL(`https://${part}`);
                        }
                    }}
                >
                    {part}
                </Text>
            );
        }
        return (
            <Text key={index} style={textStyle}>
                {part}
            </Text>
        );
    });
};

const styles = StyleSheet.create({
    linkText: {
        textDecorationLine: 'underline',
        fontWeight: '600'
    },
});