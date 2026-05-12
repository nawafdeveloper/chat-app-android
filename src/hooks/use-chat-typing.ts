"use client";

import { useRealtimeStore } from "@/store/use-realtime-store";
import { useEffect, useRef } from "react";

const TYPING_IDLE_TIMEOUT_MS = 2000;

export function useChatTyping(selectedChatId: string | null) {
    const sendEvent = useRealtimeStore((state) => state.sendEvent);
    const typingChatIdRef = useRef<string | null>(null);
    const idleTimeoutRef = useRef<number | null>(null);

    const clearIdleTimeout = () => {
        if (idleTimeoutRef.current !== null) {
            window.clearTimeout(idleTimeoutRef.current);
            idleTimeoutRef.current = null;
        }
    };

    const stopTyping = (conversationId?: string | null) => {
        const activeChatId = conversationId ?? typingChatIdRef.current;
        if (!activeChatId) {
            clearIdleTimeout();
            return;
        }

        sendEvent({
            type: "STOP_TYPING",
            conversationId: activeChatId,
        });
        if (typingChatIdRef.current === activeChatId) {
            typingChatIdRef.current = null;
        }
        clearIdleTimeout();
    };

    const scheduleIdleStop = (conversationId: string) => {
        clearIdleTimeout();
        idleTimeoutRef.current = window.setTimeout(() => {
            stopTyping(conversationId);
        }, TYPING_IDLE_TIMEOUT_MS);
    };

    const handleDraftChange = (nextDraftValue: string) => {
        if (!selectedChatId) {
            stopTyping();
            return;
        }

        if (typingChatIdRef.current && typingChatIdRef.current !== selectedChatId) {
            stopTyping(typingChatIdRef.current);
        }

        if (nextDraftValue.trim().length === 0) {
            stopTyping(selectedChatId);
            return;
        }

        if (typingChatIdRef.current !== selectedChatId) {
            const started = sendEvent({
                type: "START_TYPING",
                conversationId: selectedChatId,
            });

            if (started) {
                typingChatIdRef.current = selectedChatId;
            }
        }

        if (typingChatIdRef.current === selectedChatId) {
            scheduleIdleStop(selectedChatId);
        }
    };

    useEffect(() => {
        return () => {
            const activeChatId = typingChatIdRef.current;
            if (activeChatId) {
                sendEvent({
                    type: "STOP_TYPING",
                    conversationId: activeChatId,
                });
            }
            clearIdleTimeout();
        };
    }, [sendEvent]);

    useEffect(() => {
        const previousChatId = typingChatIdRef.current;

        if (previousChatId && previousChatId !== selectedChatId) {
            stopTyping(previousChatId);
        }
    }, [selectedChatId]);

    return {
        handleDraftChange,
        stopTyping,
    };
}
