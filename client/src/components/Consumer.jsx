import React, { useContext, useEffect, useRef, useState } from 'react';
import { RoomContext } from '../contexts/RoomContext';
import QualityIndicator from './QualityIndicator';
import ConnectionStats from './ConnectionStats';

const Consumer = ({ onLeave }) => {
  const {
    roomId,
    isConsuming,
    remoteStream,
    connectionStats,
    startConsuming,
    stopConsuming
  } = useContext(RoomContext);

  const videoRef = useRef(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState('');
  const [showStats, setShowStats] = useState(false);

  // Connect remote stream to video element when it's available
  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const handleStartConsuming = async () => {
    setIsStarting(true);
    setError('');
    
    try {
      const success = await startConsuming();
      if (!success) {
        setError('Failed to start consuming. No available streams or connection error.');
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopConsuming = () => {
    stopConsuming();
  };

  const toggleStats = () => {
    setShowStats(prev => !prev);
  };

  // Calculate connection quality based on stats
  const calculateQuality = () => {
    if (!connectionStats) return 'unknown';
    
    const { jitter, packetsLost } = connectionStats;
    
    if (jitter < 0.01 && packetsLost < 5) return 'excellent';
    if (jitter < 0.05 && packetsLost < 20) return 'good';
    if (jitter < 0.1 && packetsLost < 50) return 'fair';
    return 'poor';
  };

  const quality = calculateQuality();

  return (
    <div className="card">
      <h2 className="text-center mb-4">Video Consumer</h2>
      <p className="text-center mb-4">Room ID: {roomId}</p>

      <div className="video-container" style={{ aspectRatio: '16/9' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          controls
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        {!remoteStream && (
          <div 
            style={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              width: '100%', 
              height: '100%', 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: 'white'
            }}
          >
            {isStarting ? 'Connecting...' : 'No stream available'}
          </div>
        )}
        {remoteStream && <QualityIndicator quality={quality} />}
      </div>

      {error && (
        <div style={{ color: 'var(--error-color)', margin: '0.5rem 0' }}>
          {error}
        </div>
      )}

      <div className="controls">
        {!isConsuming ? (
          <button
            className="btn btn-primary"
            onClick={handleStartConsuming}
            disabled={isStarting}
          >
            {isStarting ? 'Connecting...' : 'Start Watching'}
          </button>
        ) : (
          <button
            className="btn btn-danger"
            onClick={handleStopConsuming}
          >
            Stop Watching
          </button>
        )}
        <button
          className="btn btn-secondary"
          onClick={onLeave}
        >
          Leave Room
        </button>
        {isConsuming && (
          <button
            className="btn"
            style={{ backgroundColor: 'var(--background-color)' }}
            onClick={toggleStats}
          >
            {showStats ? 'Hide Stats' : 'Show Stats'}
          </button>
        )}
      </div>

      {showStats && connectionStats && (
        <ConnectionStats stats={connectionStats} />
      )}

      <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <p>Consuming Status: {isConsuming ? 'Active' : 'Inactive'}</p>
        {isConsuming && !remoteStream && <p>Waiting for publisher...</p>}
        {isConsuming && remoteStream && (
          <>
            <p>Video: {remoteStream?.getVideoTracks().length > 0 ? 'Receiving' : 'Not available'}</p>
            <p>Audio: {remoteStream?.getAudioTracks().length > 0 ? 'Receiving' : 'Not available'}</p>
          </>
        )}
      </div>
    </div>
  );
};

export default Consumer;