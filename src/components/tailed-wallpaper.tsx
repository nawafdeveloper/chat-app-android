import { Image } from 'expo-image';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

export const TiledBackground = memo(function TiledBackground({ source, children, style }: { source: any, children: ReactNode, style?: any }) {
    return (
        <View style={[{ flex: 1, overflow: 'hidden' }, style]}>
            <Image
                source={source}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                cachePolicy="memory-disk"
            />
            {children}
        </View>
    )
})
