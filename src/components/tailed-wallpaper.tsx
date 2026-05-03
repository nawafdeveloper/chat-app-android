import { Image } from 'expo-image';
import { PixelRatio, StyleSheet, useWindowDimensions, View } from 'react-native';

export const TiledBackground = ({ source, children, style }: { source: any, children: React.ReactNode, style?: any }) => {
    const { width, height } = useWindowDimensions()
    const ratio = PixelRatio.get()
    const tileSize = Math.ceil(100 * ratio) / ratio

    const tilesX = Math.ceil(width / tileSize) + 1
    const tilesY = Math.ceil(height / tileSize) + 1

    return (
        <View style={[{ flex: 1, overflow: 'hidden' }, style]}>
            <View style={[StyleSheet.absoluteFillObject, { overflow: 'hidden' }]}>
                {Array.from({ length: tilesY }).map((_, row) =>
                    <View
                        key={row}
                        style={{
                            flexDirection: 'row',
                            height: tileSize,
                        }}
                    >
                        {Array.from({ length: tilesX }).map((_, col) =>
                            <Image
                                key={col}
                                source={source}
                                style={{
                                    width: tileSize,
                                    height: tileSize,
                                }}
                                contentFit="fill"
                            />
                        )}
                    </View>
                )}
            </View>
            {children}
        </View>
    )
}