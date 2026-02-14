import { useState, useEffect, useCallback } from 'react';
import { LayerList } from './components/LayerList';
import { InfoPanel } from './components/InfoPanel';
import { SettingsPanel } from './components/SettingsPanel';
import type { Layer, PluginMessage } from './types/reearth';
import './App.css';

type TabType = 'layers' | 'info' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('layers');
  const [isMinimized, setIsMinimized] = useState(false);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [pluginAddedLayerIds] = useState<Set<string>>(new Set());
  const [terrainEnabled, setTerrainEnabled] = useState(false);
  const [shadowEnabled, setShadowEnabled] = useState(false);
  const [infoUrl, setInfoUrl] = useState<string | null>(null);

  // Initialize layers from reearth API
  useEffect(() => {
    if (window.reearth?.layers?.layers) {
      setLayers(window.reearth.layers.layers);
    }
  }, []);

  // Listen for messages from parent (Re:Earth Visualizer)
  useEffect(() => {
    const handleMessage = (event: MessageEvent<PluginMessage>) => {
      const msg = event.data;
      if (!msg || !msg.action) return;

      switch (msg.action) {
        case 'loadInfoUrl':
          setInfoUrl(msg.url || null);
          break;
        case 'activateShadow':
          setShadowEnabled(true);
          break;
        case 'deactivateShadow':
          setShadowEnabled(false);
          break;
        case 'terrainState':
          setTerrainEnabled(msg.enabled || false);
          break;
        case 'shadowState':
          setShadowEnabled(msg.enabled || false);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleToggleVisibility = useCallback((layerId: string, visible: boolean) => {
    // Update local state
    setLayers(prev => 
      prev.map(layer => 
        layer.id === layerId ? { ...layer, visible } : layer
      )
    );

    // Send message to parent
    window.parent.postMessage({
      type: visible ? 'show' : 'hide',
      layerId,
    }, '*');
  }, []);

  const handleFlyTo = useCallback((layerId: string) => {
    window.parent.postMessage({
      type: 'flyTo',
      layerId,
    }, '*');
  }, []);

  const handleToggleTerrain = useCallback((enabled: boolean) => {
    setTerrainEnabled(enabled);
    window.parent.postMessage({
      action: enabled ? 'activateTerrain' : 'deactivateTerrain',
    }, '*');
  }, []);

  const handleToggleShadow = useCallback((enabled: boolean) => {
    setShadowEnabled(enabled);
    window.parent.postMessage({
      action: enabled ? 'activateShadow' : 'deactivateShadow',
    }, '*');
  }, []);

  const handleSetTime = useCallback((start?: string, stop?: string, current?: string) => {
    const msg: PluginMessage = { action: 'setTime' };
    if (start) msg.start = start;
    if (stop) msg.stop = stop;
    if (current) msg.current = current;
    
    window.parent.postMessage(msg, '*');
  }, []);

  return (
    <div className={`primary-background p-16 rounded-sm ${isMinimized ? 'minimized' : ''}`}>
      {/* Tab Bar */}
      <div className="tab-bar" role="tablist">
        <button
          className="tab minimize"
          onClick={() => setIsMinimized(!isMinimized)}
          aria-pressed={isMinimized}
          title={isMinimized ? 'Restore' : 'Minimize'}
        >
          {isMinimized ? '+' : '—'}
        </button>
        <button
          className={`tab ${activeTab === 'layers' ? 'active' : ''}`}
          onClick={() => setActiveTab('layers')}
          aria-selected={activeTab === 'layers'}
        >
          Layers
        </button>
        <button
          className={`tab ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
          aria-selected={activeTab === 'info'}
        >
          info
        </button>
        <button
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
          aria-selected={activeTab === 'settings'}
        >
          Set
        </button>
      </div>

      {/* Panel Content */}
      {!isMinimized && (
        <>
          {activeTab === 'layers' && (
            <LayerList
              layers={layers}
              pluginAddedLayerIds={pluginAddedLayerIds}
              onToggleVisibility={handleToggleVisibility}
              onFlyTo={handleFlyTo}
            />
          )}
          {activeTab === 'info' && <InfoPanel url={infoUrl} />}
          {activeTab === 'settings' && (
            <SettingsPanel
              terrainEnabled={terrainEnabled}
              shadowEnabled={shadowEnabled}
              onToggleTerrain={handleToggleTerrain}
              onToggleShadow={handleToggleShadow}
              onSetTime={handleSetTime}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
