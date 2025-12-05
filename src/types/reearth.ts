// RE:EARTH Plugin Types
export interface ReearthPlugin {
    id: string;
    name: string;
    version: string;
    description?: string;
}

export interface PluginContext {
    reearth: ReearthAPI;
}

export interface ReearthAPI {
    ui: {
        show: (html: string) => void;
        postMessage: (message: any) => void;
        resize: (width: number, height: number) => void;
    };
    layers: {
        add: (layer: Layer) => void;
        select: (layerId: string) => void;
        hide: (layerId: string) => void;
        show: (layerId: string) => void;
        findById: (layerId: string) => Layer | undefined;
    };
    viewer: {
        camera: {
            flyTo: (position: CameraPosition) => void;
            lookAt: (position: CameraPosition) => void;
            get: () => CameraPosition;
        };
        property: {
            get: (key: string) => any;
            set: (key: string, value: any) => void;
        };
    };
    plugin: {
        property: {
            get: (key: string) => any;
            set: (key: string, value: any) => void;
        };
    };
}

export interface Layer {
    id: string;
    name: string;
    type: string;
    properties?: Record<string, any>;
}

export interface CameraPosition {
    lng: number;
    lat: number;
    height: number;
    heading?: number;
    pitch?: number;
    roll?: number;
}
