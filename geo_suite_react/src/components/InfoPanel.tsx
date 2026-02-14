import React from 'react';

interface InfoPanelProps {
  url: string | null;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({ url }) => {
  return (
    <div id="info-panel">
      {url ? (
        <iframe
          id="info-content"
          src={url}
          style={{
            width: '100%',
            border: '1px solid #ccc',
            background: '#fff',
            overflow: 'auto',
            height: '600px',
          }}
          title="Info Content"
        />
      ) : (
        <div style={{ padding: '16px', color: '#666' }}>
          No URL configured
        </div>
      )}
    </div>
  );
};
