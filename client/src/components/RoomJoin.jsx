import React, { useState, useContext, useEffect } from 'react';
import { RoomContext } from '../contexts/RoomContext';

const RoomJoin = () => {
  const { joinRoom, fetchSessions, availableSessions } = useContext(RoomContext);
  const [roomIdInput, setRoomIdInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  // Refresh sessions when component mounts
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRoomIdChange = (e) => {
    setRoomIdInput(e.target.value);
    setError('');
  };

  const handleCreateRoom = () => {
    // Generate a random room ID
    const randomRoomId = Math.random().toString(36).substring(2, 8);
    setRoomIdInput(randomRoomId);
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    
    if (!roomIdInput.trim()) {
      setError('Please enter a room ID');
      return;
    }

    setIsJoining(true);
    const success = await joinRoom(roomIdInput.trim());
    setIsJoining(false);

    if (!success) {
      setError('Failed to join room. Please try again.');
    }
  };

  const handleJoinExistingRoom = (roomId) => {
    setRoomIdInput(roomId);
  };

  return (
    <div className="card">
      <h2 className="text-center mb-4">Join a Room</h2>
      
      <form onSubmit={handleJoinRoom}>
        <div className="form-group">
          <label htmlFor="roomId">Room ID</label>
          <input
            type="text"
            id="roomId"
            className="form-control"
            value={roomIdInput}
            onChange={handleRoomIdChange}
            placeholder="Enter room ID or create a new one"
          />
          {error && <p style={{ color: 'var(--error-color)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</p>}
        </div>
        
        <div className="flex gap-4">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCreateRoom}
            disabled={isJoining}
          >
            Create New Room
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isJoining || !roomIdInput.trim()}
          >
            {isJoining ? 'Joining...' : 'Join Room'}
          </button>
        </div>
      </form>

      {availableSessions.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3 className="mb-4">Available Sessions</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {availableSessions.map(session => (
              <li 
                key={session.id}
                style={{ 
                  padding: '0.5rem',
                  borderBottom: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onClick={() => handleJoinExistingRoom(session.id)}
              >
                <span>Room: {session.id}</span>
                <span className="badge badge-success">{session.participants} participants</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default RoomJoin;