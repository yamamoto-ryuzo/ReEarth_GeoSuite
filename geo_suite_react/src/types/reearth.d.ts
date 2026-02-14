// Type definitions for Re:Earth Visualizer Plugin API
declare global {
  interface Window {
    reearth?: ReearthAPI;
  }
}

export interface ReearthAPI {
  ui: {
    show: (html: string) => void;
    postMessage: (message: any, targetOrigin?: string) => void;
  };
  layers: {
    layers?: Layer[];
    add?: (layer: any) => void;
    override?: (layerId: string, options: any) => void;
  };
  viewer: {
    property?: ViewerProperty;
    overrideProperty?: (props: any) => void;
    getViewerProperty?: () => ViewerProperty;
  };
  on?: (event: string, callback: (e: any) => void) => void;
}

export interface Layer {
  id: string;
  title: string;
  visible: boolean;
  type?: string;
}

export interface ViewerProperty {
  terrain?: {
    enabled: boolean;
  };
  globe?: {
    depthTestAgainstTerrain?: boolean;
    baseColor?: string;
  };
  scene?: {
    backgroundColor?: string;
    shadow?: {
      enabled: boolean;
    };
  };
}

export interface PluginMessage {
  action: string;
  type?: string;
  layerId?: string;
  url?: string;
  enabled?: boolean;
  camera?: any;
  start?: string;
  stop?: string;
  current?: string;
}
