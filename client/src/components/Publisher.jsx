import React, { useContext, useEffect, useRef, useState } from 'react';
import { RoomContext } from '../contexts/RoomContext';

const Publisher = ({ onLeave }) => {
  const {
    roomId,
    isProducing,
    localStream,
    startProducing,
    stopProducing,
    selectedVideoQuality,
    setSelectedVideoQuality
  } = useContext(RoomContext);

  const videoRef = useRef(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState('');

  // Connect local stream to video element when it's available
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const handleStartPublishing = async () => {
    setIsStarting(true);
    setError('');
    
    try {
      const success = await startProducing();
      if (!success) {
        setError('Failed to start publishing. Please check your camera and microphone access.');
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopPublishing = () => {
    stopProducing();
  };

  const handleQualityChange = (e) => {
    setSelectedVideoQuality(e.target.value);
  };

  return (
    <div className="card">
      <h2 className="text-center mb-4">Video Publisher</h2>
      <p className="text-center mb-4">Room ID: {roomId}</p>

      <div className="video-container" style={{ aspectRatio: '16/9' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {!localStream && (
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
            {isStarting ? 'Starting camera...' : 'Camera off'}
          </div>
        )}
      </div>

      {error && (
        <div style={{ color: 'var(--error-color)', margin: '0.5rem 0' }}>
          {error}
        </div>
      )}

      <div className="form-group" style={{ marginTop: '1rem' }}>
        <label htmlFor="videoQuality">Video Quality</label>
        <select
          id="videoQuality"
          className="form-control"
          value={selectedVideoQuality}
          onChange={handleQualityChange}
          disabled={isProducing}
        >
          <option value="low">Low (640x360, 15fps)</option>
          <option value="medium">Medium (1280x720, 30fps)</option>
          <option value="high">High (1920x1080, 30fps)</option>
        </select>
      </div>

      <div className="controls">
        {!isProducing ? (
          <button
            className="btn btn-primary"
            onClick={handleStartPublishing}
            disabled={isStarting}
          >
            {isStarting ? 'Starting...' : 'Start Publishing'}
          </button>
        ) : (
          <button
            className="btn btn-danger"
            onClick={handleStopPublishing}
          >
            Stop Publishing
          </button>
        )}
        <button
          className="btn btn-secondary"
          onClick={onLeave}
        >
          Leave Room
        </button>
      </div>

      <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <p>Publishing Status: {isProducing ? 'Active' : 'Inactive'}</p>
        {isProducing && (
          <>
            <p>Video: {localStream?.getVideoTracks()[0]?.label || 'Unknown'}</p>
            <p>Audio: {localStream?.getAudioTracks()[0]?.label || 'Unknown'}</p>
          </>
        )}
      </div>
    </div>
  );
};

export default Publisher;