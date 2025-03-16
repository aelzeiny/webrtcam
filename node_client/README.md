# WebRTCam Node.js Client

A headless Node.js client for WebRTCam that consumes video streams and saves them to disk.

## Features

- Connects to WebRTCam server as a consumer
- Automatically joins a room and consumes available video streams
- Records received video to disk using ffmpeg
- Handles reconnection and cleanup

## Requirements

- Node.js 16 or higher
- ffmpeg installed and available in your PATH
- A running WebRTCam server

## Installation

```bash
# Clone the WebRTCam repository if you haven't already
git clone https://github.com/yourusername/webrtcam.git
cd webrtcam

# Install node_client dependencies
cd node_client
npm install
```

## Usage

```bash
# Join a specific room (replace "roomid123" with the actual room ID)
node index.js roomid123

# Or let the client generate a random room ID
node index.js
```

The client will:
1. Connect to the WebRTCam server
2. Join the specified room (or create a random one)
3. Find and consume any video streams in the room
4. Save the streams to the `recordings` directory

## Configuration

Edit the configuration in `index.js` to customize:

```javascript
const config = {
  serverUrl: 'http://localhost:3000', // WebRTCam server URL
  roomId: process.argv[2] || Math.random().toString(36).substring(2, 8),
  outputDir: path.join(__dirname, 'recordings'),
  ffmpegPath: 'ffmpeg',
};
```

## Known Limitations

- The current ffmpeg implementation is a simplified demonstration
- For production use, you would need to implement a proper RTP/WebRTC to ffmpeg pipeline
- The wrtc package has some limitations and may not work with all WebRTC features

## Troubleshooting

- Make sure the WebRTCam server is running
- Check that ffmpeg is properly installed
- Ensure your system has enough disk space for recordings
- Check network connectivity to the server