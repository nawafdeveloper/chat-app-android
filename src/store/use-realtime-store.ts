import type { ClientRealtimeEvent } from "@/types/realtime-events";
import {
    enqueueRealtimeEvent,
    flushPendingRealtimeEvents,
    isDurableRealtimeEvent,
} from "@/lib/realtime-outbox";
import { create } from "zustand";

type RealtimeStatus = "idle" | "connecting" | "connected" | "error";

interface RealtimeState {
    socket: WebSocket | null;
    status: RealtimeStatus;
    setSocket: (socket: WebSocket | null) => void;
    setStatus: (status: RealtimeStatus) => void;
    sendEvent: (event: ClientRealtimeEvent) => boolean;
}

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
    socket: null,
    status: "idle",
    setSocket: (socket) => set({ socket }),
    setStatus: (status) => set({ status }),
    sendEvent: (event) => {
        const socket = get().socket;
        const isDurable = isDurableRealtimeEvent(event);

        if (isDurable) {
            void enqueueRealtimeEvent(event)
                .then(() => flushPendingRealtimeEvents(socket))
                .catch((error) => {
                    console.log("Failed to queue realtime event:", error);
                });
            return true;
        }

        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return false;
        }

        socket.send(JSON.stringify(event));
        return true;
    },
}));
