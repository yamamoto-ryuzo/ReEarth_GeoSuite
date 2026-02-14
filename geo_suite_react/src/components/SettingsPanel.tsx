import React, { useState } from 'react';

interface SettingsPanelProps {
  terrainEnabled: boolean;
  shadowEnabled: boolean;
  onToggleTerrain: (enabled: boolean) => void;
  onToggleShadow: (enabled: boolean) => void;
  onSetTime: (start?: string, stop?: string, current?: string) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  terrainEnabled,
  shadowEnabled,
  onToggleTerrain,
  onToggleShadow,
  onSetTime,
}) => {
  const [startTime, setStartTime] = useState('');
  const [stopTime, setStopTime] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [timeStatus, setTimeStatus] = useState('');

  const handleApplyTime = () => {
    const start = startTime || undefined;
    const stop = stopTime || undefined;
    let current = currentTime || undefined;
    
    // If current not specified, default it to start (or stop)
    if (!current && (start || stop)) {
      current = start || stop;
    }
    
    onSetTime(start, stop, current);
    setTimeStatus('Sent');
    setTimeout(() => setTimeStatus(''), 2000);
  };

  return (
    <div id="settings-panel">
      {/* Terrain Toggle */}
      <div className="primary-background terrain-row rounded-sm" style={{ marginBottom: '8px' }}>
        <div className="text-md">Terrain: {terrainEnabled ? 'ON' : 'OFF'}</div>
        <label className="toggle" aria-label="Terrain toggle">
          <input
            type="checkbox"
            checked={terrainEnabled}
            onChange={(e) => onToggleTerrain(e.target.checked)}
          />
          <span className="slider"></span>
        </label>
      </div>

      {/* Shadow Toggle */}
      <div className="primary-background terrain-row rounded-sm" style={{ marginBottom: '8px' }}>
        <div className="text-md">Shadow: {shadowEnabled ? 'ON' : 'OFF'}</div>
        <label className="toggle" aria-label="Shadow toggle">
          <input
            type="checkbox"
            checked={shadowEnabled}
            onChange={(e) => onToggleShadow(e.target.checked)}
          />
          <span className="slider"></span>
        </label>
      </div>

      {/* Time Row (shown only when Shadow is ON) */}
      {shadowEnabled && (
        <div
          className="primary-background terrain-row rounded-sm"
          style={{ marginBottom: '8px', gap: '6px', flexWrap: 'wrap' }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label className="text-sm" htmlFor="startTime">Start</label>
            <input
              type="datetime-local"
              id="startTime"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{ height: '28px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label className="text-sm" htmlFor="stopTime">Stop</label>
            <input
              type="datetime-local"
              id="stopTime"
              value={stopTime}
              onChange={(e) => setStopTime(e.target.value)}
              style={{ height: '28px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label className="text-sm" htmlFor="currentTime">Current</label>
            <input
              type="datetime-local"
              id="currentTime"
              value={currentTime}
              onChange={(e) => setCurrentTime(e.target.value)}
              style={{ height: '28px' }}
            />
          </div>
          <button
            className="btn-primary p-8"
            onClick={handleApplyTime}
            style={{ minHeight: '28px' }}
          >
            Apply
          </button>
          {timeStatus && (
            <div className="text-sm" style={{ marginLeft: '8px', color: '#333' }}>
              {timeStatus}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
