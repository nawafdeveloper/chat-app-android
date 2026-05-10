// audio-recorder-visualizer.tsx
import { Canvas, RoundedRect } from '@shopify/react-native-skia';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

const BAR_COUNT = 40;
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const BAR_MIN_HEIGHT = 3;
const BAR_MAX_HEIGHT = 36;
const BAR_RADIUS = 1.5;
const CONTAINER_HEIGHT = 40;
const BAR_COLOR_ACTIVE = '#25D366';
const BAR_COLOR_PAST = '#8f8f8f';

const IDLE_BARS = Array(BAR_COUNT).fill(BAR_MIN_HEIGHT);

function dbToBarHeight(db: number): number {
    const clamped = Math.max(-60, Math.min(0, db));
    const ratio = (clamped + 60) / 60;
    return BAR_MIN_HEIGHT + ratio * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT);
}

interface Props {
    metering: number | undefined | null;
}

const VoiceWaveform: React.FC<Props> = ({ metering }) => {
    const barsRef = useRef<number[]>([...IDLE_BARS]);
    const [bars, setBars] = useState<number[]>([...IDLE_BARS]);
    const containerWidth = BAR_COUNT * (BAR_WIDTH + BAR_GAP) - BAR_GAP;

    // reset when metering becomes null/undefined (recording stopped)
    useEffect(() => {
        if (metering === undefined || metering === null) {
            barsRef.current = [...IDLE_BARS];
            setBars([...IDLE_BARS]);
            return;
        }
        barsRef.current = [...barsRef.current.slice(1), dbToBarHeight(metering)];
        setBars([...barsRef.current]);
    }, [metering]);

    return (
        <View style={{ width: containerWidth, height: CONTAINER_HEIGHT }}>
            <Canvas style={{ width: containerWidth, height: CONTAINER_HEIGHT }}>
                {bars.map((barHeight, index) => {
                    const x = index * (BAR_WIDTH + BAR_GAP);
                    const y = (CONTAINER_HEIGHT - barHeight) / 2;
                    const isLatest = index === bars.length - 1;
                    return (
                        <RoundedRect
                            key={index}
                            x={x}
                            y={y}
                            width={BAR_WIDTH}
                            height={barHeight}
                            r={BAR_RADIUS}
                            color={isLatest ? BAR_COLOR_ACTIVE : BAR_COLOR_PAST}
                        />
                    );
                })}
            </Canvas>
        </View>
    );
};

export default VoiceWaveform;