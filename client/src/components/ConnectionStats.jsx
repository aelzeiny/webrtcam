import React from 'react';

const ConnectionStats = ({ stats }) => {
  // Format bytes to human-readable format
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!stats) return null;

  return (
    <div className="stats-container card" style={{ marginTop: '1rem', padding: '0.75rem' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Connection Statistics</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
        <div className="stats">
          <p><strong>Resolution:</strong> {stats.resolution || 'Unknown'}</p>
          <p><strong>Framerate:</strong> {stats.frameRate ? `${Math.round(stats.frameRate)} fps` : 'Unknown'}</p>
          <p><strong>Packets Lost:</strong> {stats.packetsLost !== undefined ? stats.packetsLost : 'N/A'}</p>
        </div>
        
        <div className="stats">
          <p><strong>Data Received:</strong> {formatBytes(stats.totalBytesReceived || 0)}</p>
          <p><strong>Jitter:</strong> {stats.jitter !== undefined ? `${(stats.jitter * 1000).toFixed(2)} ms` : 'N/A'}</p>
          <p><strong>Frames Decoded:</strong> {stats.framesDecoded || 0}</p>
        </div>
      </div>
      
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
        <p>These statistics update every 2 seconds</p>
      </div>
    </div>
  );
};

export default ConnectionStats;