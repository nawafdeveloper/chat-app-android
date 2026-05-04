import type { ClientRealtimeEvent } from "@/types/realtime-events";
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

        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return false;
        }

        socket.send(JSON.stringify(event));
        return true;
    },
}));
