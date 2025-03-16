const { io } = require('socket.io-client');
const { Device } = require('mediasoup-client');
const fs = require('fs-extra');
const path = require('path');
const wrtc = require('wrtc');
const MediaRecorder = require('./recorder');

// Configuration
const config = {
  serverUrl: 'http://localhost:3000',
  roomId: process.argv[2] || Math.random().toString(36).substring(2, 8),
  outputDir: path.join(__dirname, 'recordings'),
  ffmpegPath: 'ffmpeg', // Make sure ffmpeg is installed and in PATH
  maxFileSizeMB: 1024, // 1GB
  segmentDuration: 60 * 10, // 10 minutes segments
};

// Create output directory if it doesn't exist
fs.ensureDirSync(config.outputDir);

// Global variables
let device;
let consumerTransport;
let consumers = new Map();
let recorder;

// Initialize socket connection
const socket = io(config.serverUrl, {
  path: '/socket.io',
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

console.log(`Starting WebRTCam Node.js client`);
console.log(`Will join room: ${config.roomId}`);
console.log(`Recordings will be saved to: ${config.outputDir}`);

// Initialize media recorder
recorder = new MediaRecorder({
  outputDir: config.outputDir,
  ffmpegPath: config.ffmpegPath,
  maxFileSizeMB: config.maxFileSizeMB,
  segmentDuration: config.segmentDuration
});

// Socket event listeners
socket.on('connect', () => {
  console.log('Connected to signaling server');
  joinRoom();
});

socket.on('disconnect', () => {
  console.log('Disconnected from signaling server');
  cleanup();
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
});

socket.on('newProducer', ({ producerId, producerSocketId, kind }) => {
  console.log(`New ${kind} producer available:`, producerId);
  consumeProducer(producerId, kind);
});

socket.on('consumerClosed', ({ consumerId }) => {
  console.log('Consumer closed:', consumerId);
  if (consumers.has(consumerId)) {
    const consumer = consumers.get(consumerId);
    consumer.close();
    consumers.delete(consumerId);
  }
});

// Main functions
async function joinRoom() {
  try {
    console.log(`Joining room ${config.roomId}...`);
    
    // Join the room
    const joinResponse = await new Promise((resolve, reject) => {
      socket.emit('joinRoom', { roomId: config.roomId }, (res) => {
        if (res.status === 'success') {
          resolve(res);
        } else {
          reject(new Error(res.message || 'Failed to join room'));
        }
      });
    });
    
    console.log('Successfully joined room');
    
    // Initialize device
    await initializeDevice();
    
    // Start consuming
    await startConsuming();
    
    // Check for existing producers
    checkExistingProducers();
  } catch (error) {
    console.error('Error joining room:', error.message);
    process.exit(1);
  }
}

async function initializeDevice() {
  try {
    console.log('Initializing MediaSoup device...');
    device = new Device({ Handler: wrtc.RTCPeerConnection });
    
    // Get router RTP capabilities
    const rtpCapabilitiesResponse = await new Promise((resolve, reject) => {
      socket.emit('getRouterRtpCapabilities', { roomId: config.roomId }, (res) => {
        if (res.status === 'success') {
          resolve(res.rtpCapabilities);
        } else {
          reject(new Error(res.message || 'Failed to get RTP capabilities'));
        }
      });
    });
    
    // Load the device with router's RTP capabilities
    await device.load({ routerRtpCapabilities: rtpCapabilitiesResponse });
    console.log('Device loaded successfully');
  } catch (error) {
    console.error('Error initializing device:', error.message);
    throw error;
  }
}

async function startConsuming() {
  try {
    console.log('Setting up consumer transport...');
    
    // Create a consumer transport
    const transportResponse = await new Promise((resolve, reject) => {
      socket.emit('createConsumerTransport', { roomId: config.roomId }, (res) => {
        if (res.status === 'success') {
          resolve(res);
        } else {
          reject(new Error(res.message || 'Failed to create consumer transport'));
        }
      });
    });
    
    consumerTransport = device.createRecvTransport({
      id: transportResponse.id,
      iceParameters: transportResponse.iceParameters,
      iceCandidates: transportResponse.iceCandidates,
      dtlsParameters: transportResponse.dtlsParameters,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
    });
    
    // Handle transport connection
    consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await new Promise((resolve, reject) => {
          socket.emit('connectConsumerTransport', {
            roomId: config.roomId,
            transportId: consumerTransport.id,
            dtlsParameters
          }, (res) => {
            if (res.status === 'success') {
              resolve();
            } else {
              reject(new Error(res.message || 'Failed to connect consumer transport'));
            }
          });
        });
        callback();
      } catch (error) {
        errback(error);
      }
    });
    
    console.log('Consumer transport ready');
  } catch (error) {
    console.error('Error starting consumer:', error.message);
    throw error;
  }
}

async function checkExistingProducers() {
  try {
    console.log('Checking for existing producers...');
    socket.emit('getProducers', { roomId: config.roomId }, async (response) => {
      if (response.status === 'success') {
        const { producers } = response;
        console.log(`Found ${producers.length} existing producers`);
        
        // Consume each existing producer
        for (const producer of producers) {
          await consumeProducer(producer.id, producer.kind);
        }
      } else {
        console.error('Failed to get producers:', response.message);
      }
    });
  } catch (error) {
    console.error('Error checking existing producers:', error.message);
  }
}

async function consumeProducer(producerId, kind) {
  try {
    console.log(`Consuming ${kind} producer: ${producerId}`);
    
    // Skip audio if needed - uncomment this if you only want video
    // if (kind === 'audio') return;
    
    // Consume the producer
    const { rtpCapabilities } = device;
    
    const consumerResponse = await new Promise((resolve, reject) => {
      socket.emit('consume', {
        roomId: config.roomId,
        transportId: consumerTransport.id,
        producerId,
        rtpCapabilities
      }, (res) => {
        if (res.status === 'success') {
          resolve(res);
        } else {
          reject(new Error(res.message || 'Failed to consume'));
        }
      });
    });
    
    // Create a consumer
    const consumer = await consumerTransport.consume({
      id: consumerResponse.id,
      producerId: consumerResponse.producerId,
      kind: consumerResponse.kind,
      rtpParameters: consumerResponse.rtpParameters
    });
    
    consumers.set(consumer.id, consumer);
    
    // Resume the consumer
    await new Promise((resolve, reject) => {
      socket.emit('resumeConsumer', {
        roomId: config.roomId,
        consumerId: consumer.id
      }, (res) => {
        if (res.status === 'success') {
          resolve();
        } else {
          reject(new Error(res.message || 'Failed to resume consumer'));
        }
      });
    });
    
    console.log(`Successfully consuming ${kind}`);
    
    // Start recording if this is a video consumer
    if (kind === 'video') {
      startRecording(consumer);
    }
  } catch (error) {
    console.error(`Error consuming ${kind}:`, error.message);
  }
}

function startRecording(consumer) {
  try {
    console.log('Starting recording...');
    
    if (!consumer || !consumer.track) {
      console.error('Invalid consumer or missing track');
      return;
    }
    
    if (!consumer.producerId) {
      console.error('Consumer does not have a producerId');
      return;
    }
    
    // Use the MediaRecorder class to handle recording
    const recordingId = recorder.startRecording(consumer, config.roomId, consumer.producerId);
    
    if (recordingId) {
      console.log(`Recording started with ID: ${recordingId}`);
    } else {
      console.error('Failed to start recording');
    }
  } catch (error) {
    console.error('Error starting recording:', error.message);
  }
}

function cleanup() {
  try {
    console.log('Cleaning up...');
    
    // Stop all recordings
    if (recorder) {
      recorder.stopAllRecordings();
    }
    
    // Close all consumers
    for (const consumer of consumers.values()) {
      consumer.close();
    }
    consumers.clear();
    
    // Close transport
    if (consumerTransport) {
      consumerTransport.close();
      consumerTransport = null;
    }
    
    console.log('Cleanup complete');
  } catch (error) {
    console.error('Error during cleanup:', error.message);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  cleanup();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});