import React, {
    createContext,
    ReactNode,
    useContext,
    useEffect,
    useState,
} from "react";
import { Dimensions } from "react-native";

type TabletContextType = {
    isTablet: boolean;
};

const TabletContext = createContext<TabletContextType>({
    isTablet: false,
});

const getIsTablet = () => {
    const { width, height } = Dimensions.get("window");
    return Math.min(width, height) >= 768;
};

export const TabletProvider = ({ children }: { children: ReactNode }) => {
    const [isTablet, setIsTablet] = useState(getIsTablet());

    useEffect(() => {
        const onChange = ({ window }: { window: any }) => {
            const newIsTablet = Math.min(window.width, window.height) >= 768;
            setIsTablet(newIsTablet);
        };

        const subscription = Dimensions.addEventListener("change", onChange);

        return () => {
            subscription.remove();
        };
    }, []);

    return (
        <TabletContext.Provider value={{ isTablet }}>
            {children}
        </TabletContext.Provider>
    );
};

export const useIsTablet = () => {
    return useContext(TabletContext).isTablet;
};