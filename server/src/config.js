/**
 * MediaSoup configuration
 */
module.exports = {
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
      // Use environment variable for announcedIp or fall back to default
      { 
        ip: '0.0.0.0', 
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1' 
      }
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000,
    minimumAvailableOutgoingBitrate: 600000,
    maxSctpMessageSize: 262144
  }
};