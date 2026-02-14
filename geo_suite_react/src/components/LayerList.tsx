import React from 'react';
import type { Layer } from '../types/reearth';

interface LayerListProps {
  layers: Layer[];
  pluginAddedLayerIds: Set<string>;
  onToggleVisibility: (layerId: string, visible: boolean) => void;
  onFlyTo: (layerId: string) => void;
}

export const LayerList: React.FC<LayerListProps> = ({
  layers,
  pluginAddedLayerIds,
  onToggleVisibility,
  onFlyTo,
}) => {
  const presetLayers = layers.filter(layer => !pluginAddedLayerIds.has(layer.id));
  const userLayers = layers.filter(layer => pluginAddedLayerIds.has(layer.id));

  const renderLayer = (layer: Layer, isPluginAdded: boolean) => (
    <li key={layer.id}>
      <span className="layer-name">{layer.title}</span>
      <div className="actions">
        <input
          type="checkbox"
          checked={layer.visible}
          onChange={(e) => onToggleVisibility(layer.id, e.target.checked)}
          data-layer-id={layer.id}
          data-is-plugin-added={isPluginAdded}
        />
        <button
          className="btn-primary p-8 move-btn"
          onClick={() => onFlyTo(layer.id)}
          aria-label="Move"
        >
          📍
        </button>
      </div>
    </li>
  );

  return (
    <div id="layers-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontWeight: 600 }}>Layers</div>
      </div>
      <ul className="layers-list">
        {presetLayers.map(layer => renderLayer(layer, false))}
      </ul>
      {userLayers.length > 0 && (
        <>
          <div style={{ fontWeight: 600, marginTop: '12px', marginBottom: '8px' }}>UserLayers</div>
          <ul className="layers-list">
            {userLayers.map(layer => renderLayer(layer, true))}
          </ul>
        </>
      )}
    </div>
  );
};
