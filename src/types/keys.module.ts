let globalRefreshKeys: (() => void) | null = null

export const setRefreshKeysHandler = (fn: () => void) => {
    globalRefreshKeys = fn
}

export const triggerRefreshKeys = () => {
    globalRefreshKeys?.()
}