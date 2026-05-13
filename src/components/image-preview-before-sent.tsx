import { Colors } from '@/constants/theme';
import { useSendChatMessage } from '@/hooks/use-send-chat-message';
import { createUploadFileFromLocalUri } from '@/lib/local-upload-file';
import { useImagePreviewBeforeSentStore } from '@/store/image-preview-before-sent';
import {
    BasicAlertDialog,
    Column,
    Button as ComposeButton,
    Text as ComposeText,
    Host,
    Row,
    Spacer,
    Surface,
    TextButton,
} from '@expo/ui/jetpack-compose';
import {
    clip,
    fillMaxWidth,
    height,
    padding,
    Shapes,
    width,
    wrapContentHeight,
    wrapContentWidth,
} from '@expo/ui/jetpack-compose/modifiers';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    ActivityIndicator,
    Dimensions,
    Keyboard,
    KeyboardAvoidingView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useColorScheme,
    View
} from 'react-native';
import { Appbar, IconButton } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { G, Path, Svg } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import { ThemedView } from './themed-view';

// ─── types ────────────────────────────────────────────────────────────────────

type DrawPath = {
    d: string;
    color: string;
    strokeWidth: number;
};

type TextAnnotation = {
    id: string;
    text: string;
    x: number;
    y: number;
    color: string;
    fontSize: number;
    rotation: number; // degrees
};

type Mode = 'none' | 'draw' | 'text';

// ─── constants ────────────────────────────────────────────────────────────────

const COLORS = ['#FFFFFF', '#000000', '#EF4444', '#25D366', '#22C55E', '#FACC15', '#A855F7', '#F97316'];
const STROKE_WIDTHS = [3, 6, 10];
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TEXT_HIT_PADDING = 30;

// ─── helpers ──────────────────────────────────────────────────────────────────

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const distance = (x1: number, y1: number, x2: number, y2: number) =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

const angle = (x1: number, y1: number, x2: number, y2: number) =>
    (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;

// ─── component ────────────────────────────────────────────────────────────────

const ImagePreviewBeforeSent = () => {
    const scheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light';
    const colors = Colors[resolvedScheme];
    const { sendAttachment } = useSendChatMessage();
    const { messageContext, imageUri, setIsVisible, setMessageContext, setImageUri } =
        useImagePreviewBeforeSentStore();

    // ── dialog ──────────────────────────────────────────────────────────────
    const [dialogVisible, setDialogVisible] = useState(false);

    // ── mode ─────────────────────────────────────────────────────────────────
    const [mode, setMode] = useState<Mode>('none');

    // ── draw state ───────────────────────────────────────────────────────────
    const [paths, setPaths] = useState<DrawPath[]>([]);
    const [currentPath, setCurrentPath] = useState<string>('');
    const [selectedColor, setSelectedColor] = useState('#FFFFFF');
    const [selectedStroke, setSelectedStroke] = useState(3);

    // ── text state ───────────────────────────────────────────────────────────
    const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
    const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
    const [showTextInput, setShowTextInput] = useState(false);
    const [textInput, setTextInput] = useState('');
    const textInputRef = useRef<TextInput>(null);
    const [keyboardOffset, setKeyboardOffset] = useState(-30);

    // ── bottom message input ─────────────────────────────────────────────────
    const [messageInput, setMessageInput] = useState(messageContext ?? '');
    const [isSending, setIsSending] = useState(false);

    // ── layout ───────────────────────────────────────────────────────────────
    const viewShotRef = useRef<ViewShot>(null);
    const [layoutSize, setLayoutSize] = useState({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });

    // ── unified gesture state ─────────────────────────────────────────────────
    const draggingTextId = useRef<string | null>(null);
    const [, setDraggingTextIdState] = useState<string | null>(null);

    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const dragStartTouch = useRef<{ x: number; y: number } | null>(null);
    const dragInitialTextPos = useRef<{ x: number; y: number } | null>(null);

    // Two-finger state (shared for pinch + rotate)
    const twoFingerActive = useRef(false);
    const twoFingerInitialDist = useRef(0);
    const twoFingerInitialAngle = useRef(0);
    const twoFingerInitialFontSize = useRef(20);
    const twoFingerInitialRotation = useRef(0);

    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
            setKeyboardOffset(-30);
        });
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardOffset(-100);
        });

        return () => {
            keyboardDidShowListener.remove();
            keyboardDidHideListener.remove();
        };
    }, []);

    // ── actions ───────────────────────────────────────────────────────────────

    const handleDiscardChanges = () => {
        setImageUri('');
        setMessageContext('');
        setIsVisible(false);
    };

    const handleUndo = () => {
        if (textAnnotations.length > 0) {
            setTextAnnotations(prev => prev.slice(0, -1));
        } else if (paths.length > 0) {
            setPaths(prev => prev.slice(0, -1));
        }
    };

    const handleSave = async () => {
        try {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission required', 'Allow access to save to gallery.');
                return;
            }
            const uri = await viewShotRef.current?.capture?.();
            if (!uri) return;
            await MediaLibrary.saveToLibraryAsync(uri);
            Alert.alert('Saved', 'Image saved to your gallery.');
        } catch {
            Alert.alert('Error', 'Failed to save image.');
        }
    };

    const handleSendMessage = async () => {
        if (!imageUri || isSending) return;

        setIsSending(true);
        try {
            const sourceUri = hasAnnotations
                ? await viewShotRef.current?.capture?.()
                : imageUri;
            if (!sourceUri) return;

            const uploadFile = await createUploadFileFromLocalUri({
                uri: sourceUri,
                fallbackName: `photo-${Date.now()}.jpg`,
                mimeType: 'image/jpeg',
            });
            const sent = await sendAttachment({
                file: uploadFile,
                attachedMedia: 'photo',
                text: messageInput,
            });

            if (sent) {
                setMessageContext('');
                setImageUri('');
                setIsVisible(false);
            }
        } finally {
            setIsSending(false);
        }
    };

    // ── text helpers ──────────────────────────────────────────────────────────

    const openNewTextInput = () => {
        setEditingAnnotationId(null);
        setTextInput('');
        setShowTextInput(true);
        setTimeout(() => textInputRef.current?.focus(), 100);
    };

    const openEditTextInput = (id: string) => {
        const ann = textAnnotations.find(a => a.id === id);
        if (!ann) return;
        setEditingAnnotationId(id);
        setTextInput(ann.text);
        setShowTextInput(true);
        setTimeout(() => textInputRef.current?.focus(), 100);
    };

    const confirmText = () => {
        if (!textInput.trim()) {
            closeTextInput();
            return;
        }
        if (editingAnnotationId) {
            setTextAnnotations(prev =>
                prev.map(ann =>
                    ann.id === editingAnnotationId
                        ? { ...ann, text: textInput.trim(), color: selectedColor }
                        : ann
                )
            );
        } else {
            setTextAnnotations(prev => [
                ...prev,
                {
                    id: generateId(),
                    text: textInput.trim(),
                    x: layoutSize.width / 2,
                    y: layoutSize.height / 2,
                    color: selectedColor,
                    fontSize: 20,
                    rotation: 0,
                },
            ]);
        }
        closeTextInput();
        setMode('none');
    };

    const closeTextInput = () => {
        setShowTextInput(false);
        setEditingAnnotationId(null);
        setTextInput('');
        Keyboard.dismiss();
    };

    const toggleMode = (next: Mode) => {
        const entering = mode !== next ? next : 'none';
        setMode(entering);
        if (entering === 'text') {
            openNewTextInput();
        } else {
            closeTextInput();
        }
        cancelGesture();
    };

    // ── gesture helpers ───────────────────────────────────────────────────────

    const cancelGesture = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        draggingTextId.current = null;
        setDraggingTextIdState(null);
        dragStartTouch.current = null;
        dragInitialTextPos.current = null;
        twoFingerActive.current = false;
    };

    const clampTextPosition = (x: number, y: number) => {
        const margin = 20;
        return {
            x: Math.min(Math.max(margin, x), layoutSize.width - margin),
            y: Math.min(Math.max(margin, y), layoutSize.height - margin),
        };
    };

    const findTextAtPoint = (x: number, y: number): string | null => {
        for (let i = textAnnotations.length - 1; i >= 0; i--) {
            const ann = textAnnotations[i];
            const approxHalfW = (ann.text.length * ann.fontSize * 0.6) / 2 + TEXT_HIT_PADDING;
            const approxHalfH = ann.fontSize / 2 + TEXT_HIT_PADDING;
            if (
                x >= ann.x - approxHalfW &&
                x <= ann.x + approxHalfW &&
                y >= ann.y - approxHalfH &&
                y <= ann.y + approxHalfH
            ) {
                return ann.id;
            }
        }
        return null;
    };

    // ── draw handlers ─────────────────────────────────────────────────────────

    const onDrawStart = (evt: any) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath(`M${locationX.toFixed(1)},${locationY.toFixed(1)}`);
    };

    const onDrawMove = (evt: any) => {
        if (!currentPath) return;
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath(prev => `${prev} L${locationX.toFixed(1)},${locationY.toFixed(1)}`);
    };

    const onDrawEnd = () => {
        if (!currentPath) return;
        setPaths(prev => [...prev, { d: currentPath, color: selectedColor, strokeWidth: selectedStroke }]);
        setCurrentPath('');
    };

    // ── unified touch handlers ────────────────────────────────────────────────

    const handleTouchStart = (evt: any) => {
        cancelGesture();

        const touches = evt.nativeEvent.touches ?? [];
        const { locationX, locationY } = evt.nativeEvent;

        if (mode === 'draw') {
            onDrawStart(evt);
            return;
        }

        if (mode === 'text') return;

        // mode === 'none'
        if (touches.length === 1) {
            const hitId = findTextAtPoint(locationX, locationY);
            if (hitId) {
                const annotation = textAnnotations.find(a => a.id === hitId)!;
                dragStartTouch.current = { x: locationX, y: locationY };
                dragInitialTextPos.current = { x: annotation.x, y: annotation.y };

                longPressTimer.current = setTimeout(() => {
                    draggingTextId.current = hitId;
                    setDraggingTextIdState(hitId);
                    longPressTimer.current = null;
                }, 350);
            }
        }
    };

    const handleTouchMove = (evt: any) => {
        const touches = evt.nativeEvent.touches ?? [];
        const { locationX, locationY } = evt.nativeEvent;

        if (mode === 'draw') {
            onDrawMove(evt);
            return;
        }

        const activeId = draggingTextId.current;

        // ── 2-finger: pinch-to-scale + rotate ───────────────────────────────
        if (touches.length === 2 && activeId) {
            const [t1, t2] = touches;
            const dist = distance(t1.locationX, t1.locationY, t2.locationX, t2.locationY);
            const ang = angle(t1.locationX, t1.locationY, t2.locationX, t2.locationY);

            if (!twoFingerActive.current) {
                // Initialise two-finger gesture baseline
                twoFingerActive.current = true;
                twoFingerInitialDist.current = dist;
                twoFingerInitialAngle.current = ang;
                const ann = textAnnotations.find(a => a.id === activeId);
                twoFingerInitialFontSize.current = ann?.fontSize ?? 20;
                twoFingerInitialRotation.current = ann?.rotation ?? 0;
            } else {
                const scale = dist / (twoFingerInitialDist.current || 1);
                const newSize = Math.min(80, Math.max(10, twoFingerInitialFontSize.current * scale));
                const deltaAngle = ang - twoFingerInitialAngle.current;
                const newRotation = twoFingerInitialRotation.current + deltaAngle;

                setTextAnnotations(prev =>
                    prev.map(ann =>
                        ann.id === activeId
                            ? { ...ann, fontSize: newSize, rotation: newRotation }
                            : ann
                    )
                );
            }
            return;
        }

        // Reset two-finger state when fingers reduce to 1 (seamless handoff to drag)
        if (touches.length < 2) {
            if (twoFingerActive.current) {
                twoFingerActive.current = false;
                // Update drag baseline so single-finger drag continues smoothly
                if (activeId) {
                    const ann = textAnnotations.find(a => a.id === activeId);
                    if (ann) {
                        dragStartTouch.current = { x: locationX, y: locationY };
                        dragInitialTextPos.current = { x: ann.x, y: ann.y };
                    }
                }
            }
        }

        // ── single-finger drag ───────────────────────────────────────────────
        if (activeId && dragStartTouch.current && dragInitialTextPos.current && !twoFingerActive.current) {
            const deltaX = locationX - dragStartTouch.current.x;
            const deltaY = locationY - dragStartTouch.current.y;
            const newPos = clampTextPosition(
                dragInitialTextPos.current.x + deltaX,
                dragInitialTextPos.current.y + deltaY
            );
            setTextAnnotations(prev =>
                prev.map(ann => (ann.id === activeId ? { ...ann, ...newPos } : ann))
            );
            return;
        }

        // Cancel long-press if finger moved too far
        if (longPressTimer.current && dragStartTouch.current) {
            const dx = locationX - dragStartTouch.current.x;
            const dy = locationY - dragStartTouch.current.y;
            if (Math.hypot(dx, dy) > 8) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
        }
    };

    const handleTouchEnd = (evt: any) => {
        if (mode === 'draw') {
            onDrawEnd();
            return;
        }

        const wasDragging = !!draggingTextId.current;

        if (longPressTimer.current && !wasDragging) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;

            const { locationX, locationY } = evt.nativeEvent;
            const hitId = findTextAtPoint(locationX, locationY);
            if (hitId) {
                openEditTextInput(hitId);
            }
        }

        cancelGesture();
    };

    // ─── render ───────────────────────────────────────────────────────────────

    const hasAnnotations = paths.length > 0 || textAnnotations.length > 0;
    const showBottomInput = mode === 'none' && !showTextInput;

    return (
        <>
            {/* ── discard dialog ── */}
            <Host matchContents style={styles.discardDialog} colorScheme={resolvedScheme}>
                {dialogVisible && (
                    <BasicAlertDialog
                        onDismissRequest={() => setDialogVisible(false)}
                        properties={{
                            dismissOnBackPress: true,
                            dismissOnClickOutside: true,
                            usePlatformDefaultWidth: true,
                        }}
                    >
                        <Surface
                            color={colors.background}
                            contentColor={Colors.dark.text}
                            tonalElevation={6}
                            shadowElevation={8}
                            modifiers={[wrapContentWidth(), wrapContentHeight(), clip(Shapes.RoundedCorner(18))]}
                        >
                            <Column modifiers={[padding(22, 20, 22, 18)]}>
                                <ComposeText color={colors.text} style={{ typography: 'titleMedium', fontWeight: '700' }}>
                                    Discard changes?
                                </ComposeText>
                                <Spacer modifiers={[height(10)]} />
                                <ComposeText color={colors.textSecondary} style={{ typography: 'bodyMedium', lineHeight: 20 }}>
                                    Are you sure you want to discard changes you made?
                                </ComposeText>
                                <Spacer modifiers={[height(22)]} />
                                <Row horizontalArrangement="end" verticalAlignment="center" modifiers={[fillMaxWidth()]}>
                                    <TextButton onClick={() => setDialogVisible(false)}>
                                        <ComposeText color={colors.textSecondary}>Cancel</ComposeText>
                                    </TextButton>
                                    <Spacer modifiers={[width(8)]} />
                                    <ComposeButton
                                        onClick={() => {
                                            setDialogVisible(false);
                                            void handleDiscardChanges();
                                        }}
                                        colors={{ containerColor: '#D92D20', contentColor: '#FFFFFF' }}
                                    >
                                        <ComposeText color="#FFFFFF">Discard</ComposeText>
                                    </ComposeButton>
                                </Row>
                            </Column>
                        </Surface>
                    </BasicAlertDialog>
                )}
            </Host>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                keyboardVerticalOffset={keyboardOffset}
                behavior={'height'}
            >
                <ThemedView style={styles.main}>

                    {/* ── header ── */}
                    <ThemedView style={styles.header}>
                        <Appbar.Header style={{ backgroundColor: 'transparent' }}>
                            <Appbar.BackAction
                                mode="contained"
                                containerColor={Colors.dark.indicator}
                                iconColor={Colors.dark.text}
                                onPress={() => setDialogVisible(true)}
                            />
                            <Appbar.Content title="" />
                            <IconButton
                                icon="draw"
                                mode="contained"
                                containerColor={Colors.dark.indicator}
                                iconColor={mode === 'draw' ? '#25D366' : Colors.dark.text}
                                onPress={() => toggleMode('draw')}
                            />
                            <IconButton
                                icon="format-text-variant"
                                mode="contained"
                                containerColor={Colors.dark.indicator}
                                iconColor={mode === 'text' ? '#25D366' : Colors.dark.text}
                                onPress={() => toggleMode('text')}
                            />
                            <IconButton
                                icon="progress-download"
                                mode="contained"
                                containerColor={Colors.dark.indicator}
                                iconColor={Colors.dark.text}
                                onPress={handleSave}
                            />
                            {hasAnnotations && (
                                <IconButton
                                    icon="arrow-u-left-top"
                                    mode="contained"
                                    containerColor={Colors.dark.indicator}
                                    iconColor={Colors.dark.text}
                                    onPress={handleUndo}
                                />
                            )}
                        </Appbar.Header>
                    </ThemedView>

                    {/* ── canvas ── */}
                    <ViewShot ref={viewShotRef} style={{ flex: 1 }} options={{ format: 'jpg', quality: 0.95 }}>
                        <View
                            style={{ flex: 1 }}
                            onLayout={e =>
                                setLayoutSize({
                                    width: e.nativeEvent.layout.width,
                                    height: e.nativeEvent.layout.height,
                                })
                            }
                        >
                            <Image
                                source={{ uri: imageUri ?? '' }}
                                contentFit="contain"
                                style={StyleSheet.absoluteFill}
                            />

                            {/* SVG layer for drawing */}
                            <Svg
                                style={StyleSheet.absoluteFill}
                                width={layoutSize.width}
                                height={layoutSize.height}
                                onStartShouldSetResponder={() => true}
                                onResponderGrant={handleTouchStart}
                                onResponderMove={handleTouchMove}
                                onResponderRelease={handleTouchEnd}
                            >
                                <G>
                                    {paths.map((p, i) => (
                                        <Path
                                            key={i}
                                            d={p.d}
                                            stroke={p.color}
                                            strokeWidth={p.strokeWidth}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            fill="none"
                                        />
                                    ))}
                                    {currentPath ? (
                                        <Path
                                            d={currentPath}
                                            stroke={selectedColor}
                                            strokeWidth={selectedStroke}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            fill="none"
                                        />
                                    ) : null}
                                </G>
                            </Svg>

                            {/* Native text annotations with rotation */}
                            {textAnnotations.map(ann => (
                                <View
                                    key={ann.id}
                                    pointerEvents="none"
                                    style={[
                                        styles.textAnnotationContainer,
                                        {
                                            left: ann.x,
                                            top: ann.y,
                                            transform: [
                                                { translateX: -150 },
                                                { translateY: -(ann.fontSize / 2) },
                                                { rotate: `${ann.rotation}deg` },
                                            ],
                                        },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.textAnnotation,
                                            {
                                                color: ann.color,
                                                fontSize: ann.fontSize,
                                                writingDirection: 'rtl',
                                            },
                                        ]}
                                    >
                                        {ann.text}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </ViewShot>

                    {/* ── floating text input overlay ── */}
                    {showTextInput && (
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={confirmText}
                            style={styles.textInputOverlay}
                        >
                            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
                                <TextInput
                                    ref={textInputRef}
                                    value={textInput}
                                    onChangeText={setTextInput}
                                    placeholder={editingAnnotationId ? 'Edit text…' : 'Type text…'}
                                    placeholderTextColor="#cfcfcf"
                                    style={[styles.textInputField, { color: selectedColor }]}
                                    onSubmitEditing={confirmText}
                                    returnKeyType="done"
                                    autoFocus
                                    textAlign="center"
                                    dataDetectorTypes="none"
                                />
                            </TouchableOpacity>
                        </TouchableOpacity>
                    )}

                    {/* ── toolbar: color + stroke ── */}
                    {(mode === 'draw' || mode === 'text') && (
                        <View style={styles.toolbar}>
                            <View style={[styles.colorRow, { backgroundColor: Colors.dark.indicator }]}>
                                {COLORS.map(c => (
                                    <TouchableOpacity
                                        key={c}
                                        onPress={() => setSelectedColor(c)}
                                        style={[
                                            styles.colorDot,
                                            { backgroundColor: c },
                                            selectedColor === c && styles.colorDotSelected,
                                        ]}
                                    />
                                ))}
                            </View>
                            {mode === 'draw' && (
                                <View style={styles.strokeRow}>
                                    {STROKE_WIDTHS.map(sw => (
                                        <TouchableOpacity
                                            key={sw}
                                            onPress={() => setSelectedStroke(sw)}
                                            style={[
                                                styles.strokeBtn,
                                                selectedStroke === sw && { borderColor: '#25D366' },
                                                { backgroundColor: Colors.dark.indicator },
                                            ]}
                                        >
                                            <View
                                                style={{
                                                    width: sw,
                                                    height: sw,
                                                    borderRadius: sw,
                                                    backgroundColor:
                                                        selectedColor === '#FFFFFF' ? '#888' : selectedColor,
                                                }}
                                            />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>
                    )}

                    {/* ── hint ── */}
                    {mode === 'none' && textAnnotations.length > 0 && !showTextInput && (
                        <View style={styles.hintContainer} pointerEvents="none">
                            <Text style={styles.hintText}>
                                Hold text to drag • Pinch to scale • Twist to rotate • Tap to edit
                            </Text>
                        </View>
                    )}

                    {/* ── bottom message input ── */}
                    {showBottomInput && (
                        <View
                            style={[
                                styles.bottomInputContainer,
                                { paddingBottom: insets.bottom + 20, backgroundColor: Colors.dark.background },
                            ]}
                        >
                            <TextInput
                                value={messageInput}
                                onChangeText={(text) => setMessageInput(text)}
                                placeholder='Message'
                                style={[styles.input, { color: Colors.dark.text, backgroundColor: Colors.dark.card }]}
                                placeholderTextColor={Colors.dark.textSecondary}
                                enablesReturnKeyAutomatically={true}
                                selectionColor='#25D366'
                            />
                            <IconButton
                                icon={isSending ? () => <ActivityIndicator size="small" color={Colors.dark.background} /> : "send"}
                                iconColor={Colors.dark.background}
                                containerColor='#25D366'
                                size={24}
                                disabled={isSending}
                                onPress={handleSendMessage}
                            />
                        </View>
                    )}

                </ThemedView>
            </KeyboardAvoidingView>
        </>
    );
};

export default ImagePreviewBeforeSent;

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    main: { flex: 1, backgroundColor: 'black' },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: 'transparent',
        zIndex: 99,
        elevation: 10,
    },
    discardDialog: { position: 'absolute', zIndex: 20 },

    // ── text annotations ──
    textAnnotationContainer: {
        position: 'absolute',
        width: 300,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textAnnotation: {
        fontWeight: 'bold',
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 3,
    },

    // ── floating text input overlay ──
    textInputOverlay: {
        position: 'absolute',
        inset: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    textInputField: {
        paddingHorizontal: 20,
        paddingVertical: 14,
        fontSize: 24,
        textAlign: 'center',
        minWidth: 200,
        maxWidth: SCREEN_WIDTH - 40,
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
    },

    // ── toolbar ──
    toolbar: {
        position: 'absolute',
        top: 120,
        right: 10,
        zIndex: 99,
        elevation: 10,
        gap: 10,
        backgroundColor: 'transparent',
        minHeight: 120,
    },
    colorRow: {
        flexDirection: 'column',
        gap: 10,
        alignItems: 'center',
        flexWrap: 'wrap',
        paddingHorizontal: 6,
        paddingVertical: 6,
        borderRadius: 99,
    },
    colorDot: {
        width: 27,
        height: 27,
        borderRadius: 14,
    },
    colorDotSelected: {
        borderWidth: 3,
        transform: [{ scale: 1.2 }],
        borderColor: '#25D366',
    },
    strokeRow: {
        flexDirection: 'column',
        gap: 16,
        alignItems: 'center',
        marginTop: 40,
    },
    strokeBtn: {
        width: 35,
        height: 35,
        borderRadius: 99,
        borderWidth: 1.5,
        borderColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ── hint ──
    hintContainer: {
        position: 'absolute',
        bottom: 130, // lifted to sit above bottom input
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 99,
    },
    hintText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
    },

    // ── bottom message input ──
    bottomInputContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 10,
        paddingTop: 6,
        gap: 8,
    },
    input: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flex: 1,
        marginBottom: 4,
        borderRadius: 99
    },
    bottomTextInput: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        maxHeight: 120,
        fontSize: 15,
    },
    bottomTextInputOutline: {
        borderRadius: 24,
        borderColor: 'rgba(255,255,255,0.25)',
    },
    sendButton: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: '#25D366',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
});
