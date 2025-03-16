import React, { useState, useContext } from 'react';
import { RoomContext } from './contexts/RoomContext';
import RoomJoin from './components/RoomJoin';
import Publisher from './components/Publisher';
import Consumer from './components/Consumer';

function App() {
  const {
    roomId,
    isConnected,
    isProducing,
    isConsuming,
    error,
    leaveRoom
  } = useContext(RoomContext);
  
  const [role, setRole] = useState(null); // 'publisher' or 'consumer'

  // Handle role selection
  const selectRole = (selectedRole) => {
    setRole(selectedRole);
  };

  // Handle leaving the room
  const handleLeaveRoom = () => {
    leaveRoom();
    setRole(null);
  };

  return (
    <div className="container">
      <header className="text-center mb-4">
        <h1>WebRTCam</h1>
        <p>MediaSoup One-Way Video Streaming</p>
      </header>

      {error && (
        <div className="card" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--error-color)' }}>
          <p>{error}</p>
        </div>
      )}

      {!isConnected && (
        <RoomJoin />
      )}

      {isConnected && !role && (
        <div className="card">
          <h2 className="text-center mb-4">Select Your Role</h2>
          <div className="flex justify-center gap-4">
            <button 
              className="btn btn-primary"
              onClick={() => selectRole('publisher')}
            >
              Publish Video
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => selectRole('consumer')}
            >
              Watch Video
            </button>
          </div>
        </div>
      )}

      {isConnected && role === 'publisher' && (
        <Publisher onLeave={handleLeaveRoom} />
      )}

      {isConnected && role === 'consumer' && (
        <Consumer onLeave={handleLeaveRoom} />
      )}

      <footer className="text-center" style={{ marginTop: '2rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
        <p>Room ID: {roomId || 'Not connected'}</p>
        <p>
          Status: {isConnected ? 
            (isProducing ? 'Publishing' : (isConsuming ? 'Consuming' : 'Connected')) 
            : 'Disconnected'}
        </p>
      </footer>
    </div>
  );
}

export default App;