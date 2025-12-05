import type { ReearthAPI } from '../types/reearth';

/**
 * ログ出力ユーティリティ
 */
export const logger = {
    info: (message: string, ...args: any[]) => {
        console.log(`[INFO] ${message}`, ...args);
    },
    warn: (message: string, ...args: any[]) => {
        console.warn(`[WARN] ${message}`, ...args);
    },
    error: (message: string, ...args: any[]) => {
        console.error(`[ERROR] ${message}`, ...args);
    },
};

/**
 * プロパティの安全な取得
 */
export function getProperty<T>(
    reearth: ReearthAPI,
    key: string,
    defaultValue: T
): T {
    try {
        const value = reearth.plugin.property.get(key);
        return value !== undefined ? value : defaultValue;
    } catch (error) {
        logger.error(`Failed to get property: ${key}`, error);
        return defaultValue;
    }
}

/**
 * プロパティの安全な設定
 */
export function setProperty(
    reearth: ReearthAPI,
    key: string,
    value: any
): boolean {
    try {
        reearth.plugin.property.set(key, value);
        return true;
    } catch (error) {
        logger.error(`Failed to set property: ${key}`, error);
        return false;
    }
}
