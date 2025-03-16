# MediaSoup + React One-Way Media Server Technical Specification

## 1. System Architecture

### 1.1 Server Components

#### 1.1.1 MediaSoup Server
- **Version**: Latest stable (3.11.x)
- **Core Dependencies**:
  - Node.js (16.x+)
  - mediasoup node package
  - Express/Koa for HTTP API
  - Socket.IO or WebSocket for signaling
- **Server Role**: 
  - Signaling for WebRTC connection establishment
  - Facilitating one-way media transmission
  - Managing room/session state

#### 1.1.2 Server Specifications
- **CPU**: 2+ cores (4+ recommended)
- **RAM**: 2GB minimum, 4GB recommended
- **Network**: 50Mbps+ upstream, low latency connection
- **Storage**: Minimal requirements (logging only)

### 1.2 Client Components

#### 1.2.1 React Application Architecture
- **Framework**: React 18+ with functional components
- **State Management**: React hooks
- **WebRTC Integration**: mediasoup-client library
- **Build System**: Webpack 5 or Vite

#### 1.2.2 Sender Client
- **Media Capture**: WebRTC getUserMedia API
- **Transport**: mediasoup-client WebRTC transport
- **Stream Control**: Producer controls for starting/stopping transmissions

#### 1.2.3 Receiver Client
- **Media Reception**: Consumer endpoint for receiving WebRTC streams
- **Playback**: Media element rendering and controls
- **Statistics**: Network and quality metrics display

## 2. Technical Implementation Details

### 2.1 MediaSoup Configuration

```javascript
{
  // Worker settings
  worker: {
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
    logLevel: 'warn',
    logTags: ['rtp', 'srtp', 'rtcp'],
  },
  
  // Router settings
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000
      },
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1
        }
      }
    ]
  },
  
  // WebRTC transport settings
  webRtcTransport: {
    listenIps: [
      { ip: '0.0.0.0', announcedIp: null }
    ],
    initialAvailableOutgoingBitrate: 1000000,
    minimumAvailableOutgoingBitrate: 600000,
    maxSctpMessageSize: 262144
  }
}
```

### 2.2 WebRTC Configuration

- **ICE Servers**:
  - STUN: stun:stun.l.google.com:19302
  - TURN (recommended for production): Optional for NAT traversal
- **Media Parameters**:
  - Video Codecs: VP8 (preferred), H.264 (fallback)
  - Audio Codec: Opus
  - Video Resolution: 320x240 to 1920x1080 (configurable)
  - Framerate: 15fps to 30fps
- **Bandwidth Control**: mediasoup's dynamic bitrate allocation

### 2.3 API Endpoints

#### 2.3.1 Signaling API (WebSocket)
- **Connect**: `/signaling` WebSocket endpoint
- **Message Types**:
  - `getRouterRtpCapabilities`: Get server codec capabilities
  - `createProducerTransport`: Create sender transport
  - `connectProducerTransport`: Connect sender transport
  - `produce`: Start media production
  - `createConsumerTransport`: Create receiver transport
  - `connectConsumerTransport`: Connect receiver transport
  - `consume`: Start media consumption
  - `producerClosed`: Notify stream ended

#### 2.3.2 HTTP API
- **Sessions**: `/api/sessions` - Create/list available sessions
- **Participants**: `/api/participants` - Join/leave sessions
- **Statistics**: `/api/stats` - Retrieve connection statistics

### 2.4 React Component Structure

```
App
├── RoomProvider (Context)
│   ├── MediasoupConnection
│   └── DeviceCapabilities
├── Publisher
│   ├── MediaDeviceSelector
│   ├── VideoPreview
│   └── StreamControls
└── Consumer
    ├── RemoteStream
    ├── QualityIndicator
    └── ConnectionStats
```

## 3. Media Flow

### 3.1 One-Way Media Flow
1. Publisher captures local media via getUserMedia()
2. MediaSoup Producer Transport established
3. Media routed through MediaSoup server
4. Consumer Transport delivers media to receiver
5. Receiver client renders the stream

### 3.2 Quality Tiers

| Profile | Resolution | Framerate | Video Bitrate | Audio Bitrate |
|---------|------------|-----------|---------------|---------------|
| Low     | 640x360    | 15fps     | 500kbps       | 64kbps        |
| Medium  | 1280x720   | 30fps     | 1500kbps      | 128kbps       |
| High    | 1920x1080  | 30fps     | 2500kbps      | 128kbps       |

### 3.3 Stream Management

```javascript
async function createSendTransport(device) {
  // Get transport parameters from server
  const { id, iceParameters, iceCandidates, dtlsParameters } =
    await request('createProducerTransport');
    
  // Create the local transport
  const transport = device.createSendTransport({
    id,
    iceParameters,
    iceCandidates,
    dtlsParameters,
    propertyScreensharing: false,
    additionalSettings: { encodedInsertableStreams: false }
  });
  
  // Connect transport
  transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
    try {
      await request('connectProducerTransport', { transportId: transport.id, dtlsParameters });
      callback();
    } catch (error) {
      errback(error);
    }
  });
  
  // Handle new streams
  transport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
    try {
      const { id } = await request('produce', {
        transportId: transport.id,
        kind,
        rtpParameters,
        appData
      });
      callback({ id });
    } catch (error) {
      errback(error);
    }
  });
  
  return transport;
}
```

## 4. Implementation Considerations

### 4.1 Browser Compatibility
- **Full Support**: Chrome 74+, Firefox 78+, Edge 79+
- **Partial Support**: Safari 14.1+ (codec limitations)
- **Mobile Support**: Android Chrome, iOS Safari 14.5+

### 4.2 Network Resilience
- **Variable Bandwidth**: Adaptively adjust resolution/bitrate
- **Network Interruptions**: Implement reconnection logic
- **Connection Monitoring**: Track and display connection quality metrics

### 4.3 Client Resources
- **Memory Management**: Optimize media processing
- **CPU Usage**: Monitor and limit video processing demands
- **Battery Impact**: Reduce processing on mobile devices

## 5. Technical Challenges

### 5.1 NAT Traversal
- ICE negotiation may fail in restrictive networks
- TURN server recommended for production deployments
- Implement connection state monitoring

### 5.2 Media Synchronization
- Maintain audio/video sync across varying network conditions
- Handle clock drift between sender and receiver
- Implement jitter buffer management

### 5.3 Cross-Browser Issues
- Safari has limited VP8 support (use H.264 as fallback)
- MediaStream constraints vary by browser
- Implement codec detection and fallback mechanisms

## 6. Development and Testing Tools

### 6.1 Development Tools
- **WebRTC Analysis**: chrome://webrtc-internals
- **MediaSoup Debugging**: mediasoup-demo as reference
- **Network Testing**: WebRTC Internals stats monitoring

### 6.2 Testing Scenarios
- **Network Conditions**: Simulate bandwidth limitations
- **Long Duration**: Test extended streaming sessions (1+ hours)
- **Multi-device**: Test across desktop/mobile platforms

## 7. Implementation Phases

| Phase | Component | Technical Focus |
|-------|-----------|-----------------|
| 1     | MediaSoup Server | Basic server setup, signaling |
| 2     | React Publisher | Media capture, device selection |
| 3     | React Consumer | Stream reception, basic UI |
| 4     | Quality Management | Adaptive bitrate, resolution control |
| 5     | Resilience | Connection handling, error recovery |
| 6     | Optimization | Performance tuning, browser testing |

## 8. Performance Metrics

- **Latency Target**: <500ms end-to-end
- **CPU Usage**: <30% on mid-range devices
- **Memory Footprint**: <200MB for client applications
- **Connection Time**: <3 seconds from room join to media flow