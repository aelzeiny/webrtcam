# WebRTCam: MediaSoup + React One-Way Media Server

WebRTCam is a one-way video streaming application built with MediaSoup and React, allowing users to create rooms where some participants can publish their camera/microphone while others can consume these streams.

## Quick Start

### Running with Docker

The easiest way to run WebRTCam is with Docker:

```bash
# Clone the repository
git clone https://github.com/yourusername/webrtcam.git
cd webrtcam

# Build and start the containers
docker-compose up -d

# View logs
docker-compose logs -f
```

The application will be available at http://localhost:3000

**Important:** Before deploying to production, edit `docker-compose.yml` and set `MEDIASOUP_ANNOUNCED_IP` to your server's public IP address.

### Manual Installation

#### Requirements

- Node.js 16.x or higher
- npm or yarn

#### Installation and Setup

1. Clone the repository and install dependencies:

```bash
# Server setup
cd server
npm install

# Client setup
cd ../client
npm install
```

2. Build the client and copy it to the server:

```bash
# From the project root
./build.sh
```

3. Start the server:

```bash
cd server
npm start
```

4. Open your browser and navigate to `http://localhost:3000`

### Development Mode

To run in development mode with hot reloading:

1. Start the server:

```bash
cd server
npm run dev
```

2. In a separate terminal, start the client:

```bash
cd client
npm start
```

3. Open your browser and navigate to `http://localhost:5173`

## Features

- Create and join rooms with unique IDs
- Publish your camera/microphone to a room
- Watch other participants' streams in a room
- Select different video quality profiles (low, medium, high)
- View connection statistics and quality metrics
- Cross-browser compatibility

## Technology Stack

### Server Side
- **Node.js** - Runtime environment
- **Express** - Web server framework
- **MediaSoup** - WebRTC SFU (Selective Forwarding Unit)
- **Socket.IO** - WebSocket signaling

### Client Side
- **React** - UI library
- **mediasoup-client** - WebRTC client library
- **Socket.IO Client** - WebSocket client
- **Vite** - Build tool and development server

## Architecture

The application uses a client-server architecture with MediaSoup as the WebRTC media server. The server handles WebRTC signaling and media routing, while the client handles media capture, encoding, and playback.

### Server Components

The server is built with Node.js, Express, and MediaSoup, providing:
- WebSocket signaling via Socket.IO
- Room management
- WebRTC transport creation and management
- Media routing between publishers and consumers

### Client Components

The client is a React application using React Context for state management:
- RoomProvider - Manages WebRTC connections and room state
- Publisher - Captures and publishes media
- Consumer - Receives and displays media
- Connection stats and quality indicators

## System Requirements

### Production Server
- 2+ CPU cores (4+ recommended)
- 2GB RAM minimum (4GB recommended)
- 50Mbps+ network connection
- Low latency connection

### Client
- Modern browser with WebRTC support (Chrome 74+, Firefox 78+, Edge 79+, Safari 14.1+)
- Camera and microphone for publishing
- Stable internet connection

## Technical Implementation Details

For detailed technical implementation, see the original specification in `SPECIFICATION.md`.

## Development Setup

### Running in Development Mode

1. Start the server with hot reloading:
```bash
cd server
npm run dev
```

2. Start the client with hot reloading:
```bash
cd client
npm start
```

### Environment Variables

#### Server
- `PORT` - Server port (default: 3000)

#### Client
- None. Client uses proxy settings in `vite.config.js` to route API requests.

## Browser Compatibility

- **Full Support**: Chrome 74+, Firefox 78+, Edge 79+
- **Partial Support**: Safari 14.1+ (codec limitations)
- **Mobile Support**: Android Chrome, iOS Safari 14.5+

## Troubleshooting

### Common Issues

1. **Camera/Microphone Access**
   - Ensure your browser has permission to access your camera and microphone
   - Check that no other application is using your camera

2. **Connection Issues**
   - Ensure both server and client are running
   - Check for firewall or network restrictions blocking WebRTC traffic
   - If behind NAT, a TURN server may be required (not included in this setup)

3. **Media Quality Issues**
   - Try a lower quality setting if experiencing stuttering
   - Check your network bandwidth and latency
   - Close other applications using your network bandwidth

## License

MIT

# Original Technical Specification

The original technical specification is available in the `SPECIFICATION.md` file.