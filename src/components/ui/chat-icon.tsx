import React from "react";
import Svg, { Path } from "react-native-svg";

type ChatFillIconProps = {
    size?: number;
    color?: string;
};

export function ChatFillIcon({
    size = 24,
    color = "#000",
}: ChatFillIconProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M22.0022 6.66667C22.0022 5.19391 20.8082 4 19.3355 4H1.7921C1.01481 4 0.542166 4.86348 0.94208 5.53L3.00211 9V17.3333C3.00211 18.8061 4.19601 20 5.66877 20H19.3355C20.8082 20 22.0022 18.8061 22.0022 17.3333V6.66667ZM7.00211 10C7.00211 9.44772 7.44982 9 8.00211 9H17.0022C17.5544 9 18.0022 9.44772 18.0022 10C18.0022 10.5523 17.5544 11 17.0022 11H8.00211C7.44982 11 7.00211 10.5523 7.00211 10ZM8.00211 13C7.44982 13 7.00211 13.4477 7.00211 14C7.00211 14.5523 7.44982 15 8.00211 15H14.0022C14.5544 15 15.0022 14.5523 15.0022 14C15.0022 13.4477 14.5544 13 14.0022 13H8.00211Z"
                fill={color}
            />
        </Svg>
    );
}

export default ChatFillIcon;