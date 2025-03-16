const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const mediasoup = require('mediasoup');
const config = require('./config');

// Global variables
let worker;
let router;
const rooms = new Map(); // roomId -> Room

// Data structures for Room and Participant
class Room {
  constructor(id) {
    this.id = id;
    this.router = null;
    this.participants = new Map(); // socketId -> Participant
  }
}

class Participant {
  constructor(id, socket) {
    this.id = id;
    this.socket = socket;
    this.producerTransports = new Map(); // transportId -> Transport
    this.consumerTransports = new Map(); // transportId -> Transport
    this.producers = new Map(); // producerId -> Producer
    this.consumers = new Map(); // consumerId -> Consumer
  }
}

// Create express app and server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Add a catch-all route to serve the client's index.html for all non-API routes
app.get('*', (req, res, next) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) {
    // Skip API and WebSocket requests
    return next();
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Express routes
app.get('/api/sessions', (req, res) => {
  const sessionList = [];
  rooms.forEach((room) => {
    sessionList.push({
      id: room.id,
      participants: room.participants.size
    });
  });
  res.json(sessionList);
});

// Start MediaSoup worker
async function startMediasoup() {
  worker = await mediasoup.createWorker({
    logLevel: config.worker.logLevel,
    logTags: config.worker.logTags,
    rtcMinPort: config.worker.rtcMinPort,
    rtcMaxPort: config.worker.rtcMaxPort,
  });

  console.log('MediaSoup worker created');

  worker.on('died', () => {
    console.error('MediaSoup worker died, exiting in 2 seconds...');
    setTimeout(() => process.exit(1), 2000);
  });

  // Create router
  router = await worker.createRouter({ mediaCodecs: config.router.mediaCodecs });
  console.log('MediaSoup router created');
}

// Socket.io connection handler
io.on('connection', async (socket) => {
  console.log('Client connected:', socket.id);

  let participant;

  // Handle join room
  socket.on('joinRoom', async ({ roomId }, callback) => {
    try {
      // Create or get room
      if (!rooms.has(roomId)) {
        const room = new Room(roomId);
        room.router = await worker.createRouter({ mediaCodecs: config.router.mediaCodecs });
        rooms.set(roomId, room);
        console.log(`Room created: ${roomId}`);
      }

      const room = rooms.get(roomId);
      
      // Create participant
      participant = new Participant(socket.id, socket);
      room.participants.set(socket.id, participant);

      // Join socket.io room
      socket.join(roomId);

      callback({
        status: 'success',
        roomId
      });
    } catch (error) {
      console.error('Error joining room:', error);
      callback({ status: 'error', message: error.message });
    }
  });

  // Handle getRouterRtpCapabilities
  socket.on('getRouterRtpCapabilities', (data, callback) => {
    try {
      const { roomId } = data;
      const room = rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }
      callback({ status: 'success', rtpCapabilities: room.router.rtpCapabilities });
    } catch (error) {
      console.error('Error getting RTP capabilities:', error);
      callback({ status: 'error', message: error.message });
    }
  });

  // Handle createProducerTransport
  socket.on('createProducerTransport', async (data, callback) => {
    try {
      const { roomId } = data;
      const room = rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }
      
      const participant = room.participants.get(socket.id);
      if (!participant) {
        throw new Error(`Participant ${socket.id} not found in room ${roomId}`);
      }

      const transport = await room.router.createWebRtcTransport(config.webRtcTransport);

      participant.producerTransports.set(transport.id, transport);

      // Handle transport closure
      transport.on('routerclose', () => {
        transport.close();
        participant.producerTransports.delete(transport.id);
      });

      callback({
        status: 'success',
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters
      });
    } catch (error) {
      console.error('Error creating producer transport:', error);
      callback({ status: 'error', message: error.message });
    }
  });

  // Handle connectProducerTransport
  socket.on('connectProducerTransport', async (data, callback) => {
    try {
      const { roomId, transportId, dtlsParameters } = data;
      const room = rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }
      
      const participant = room.participants.get(socket.id);
      if (!participant) {
        throw new Error(`Participant ${socket.id} not found in room ${roomId}`);
      }

      const transport = participant.producerTransports.get(transportId);
      if (!transport) {
        throw new Error(`Transport ${transportId} not found`);
      }

      await transport.connect({ dtlsParameters });
      
      callback({ status: 'success' });
    } catch (error) {
      console.error('Error connecting producer transport:', error);
      callback({ status: 'error', message: error.message });
    }
  });

  // Handle produce
  socket.on('produce', async (data, callback) => {
    try {
      const { roomId, transportId, kind, rtpParameters, appData } = data;
      const room = rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }
      
      const participant = room.participants.get(socket.id);
      if (!participant) {
        throw new Error(`Participant ${socket.id} not found in room ${roomId}`);
      }

      const transport = participant.producerTransports.get(transportId);
      if (!transport) {
        throw new Error(`Transport ${transportId} not found`);
      }

      const producer = await transport.produce({
        kind,
        rtpParameters,
        appData
      });
      
      participant.producers.set(producer.id, producer);

      // Notify other participants about new producer
      console.log(`Notifying room ${roomId} about new ${kind} producer: ${producer.id}`);
      socket.to(roomId).emit('newProducer', {
        producerId: producer.id,
        producerSocketId: socket.id,
        kind
      });

      producer.on('transportclose', () => {
        producer.close();
        participant.producers.delete(producer.id);
      });
      
      callback({ status: 'success', id: producer.id });
    } catch (error) {
      console.error('Error producing:', error);
      callback({ status: 'error', message: error.message });
    }
  });

  // Handle createConsumerTransport
  socket.on('createConsumerTransport', async (data, callback) => {
    try {
      const { roomId } = data;
      const room = rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }
      
      const participant = room.participants.get(socket.id);
      if (!participant) {
        throw new Error(`Participant ${socket.id} not found in room ${roomId}`);
      }

      const transport = await room.router.createWebRtcTransport(config.webRtcTransport);

      participant.consumerTransports.set(transport.id, transport);

      // Handle transport closure
      transport.on('routerclose', () => {
        transport.close();
        participant.consumerTransports.delete(transport.id);
      });

      callback({
        status: 'success',
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters
      });
    } catch (error) {
      console.error('Error creating consumer transport:', error);
      callback({ status: 'error', message: error.message });
    }
  });

  // Handle connectConsumerTransport
  socket.on('connectConsumerTransport', async (data, callback) => {
    try {
      const { roomId, transportId, dtlsParameters } = data;
      const room = rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }
      
      const participant = room.participants.get(socket.id);
      if (!participant) {
        throw new Error(`Participant ${socket.id} not found in room ${roomId}`);
      }

      const transport = participant.consumerTransports.get(transportId);
      if (!transport) {
        throw new Error(`Transport ${transportId} not found`);
      }

      await transport.connect({ dtlsParameters });
      
      callback({ status: 'success' });
    } catch (error) {
      console.error('Error connecting consumer transport:', error);
      callback({ status: 'error', message: error.message });
    }
  });

  // Handle consume
  socket.on('consume', async (data, callback) => {
    try {
      const { roomId, transportId, producerId, rtpCapabilities } = data;
      console.log(`Consume request for producer ${producerId} in room ${roomId}`);
      
      const room = rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }
      
      const participant = room.participants.get(socket.id);
      if (!participant) {
        throw new Error(`Participant ${socket.id} not found in room ${roomId}`);
      }

      // Find producer
      let producer = null;
      let producerParticipant = null;
      
      // Search for the producer in all participants
      for (const [participantId, p] of room.participants.entries()) {
        if (p.producers.has(producerId)) {
          producer = p.producers.get(producerId);
          producerParticipant = p;
          break;
        }
      }
      
      if (!producer) {
        throw new Error(`Producer ${producerId} not found in room`);
      }
      
      console.log(`Found producer ${producerId} from participant ${producerParticipant.id}`);
      
      // Make sure the router can consume this producer
      if (!room.router.canConsume({ producerId, rtpCapabilities })) {
        throw new Error(`Cannot consume producer ${producerId}`);
      }

      const transport = participant.consumerTransports.get(transportId);
      if (!transport) {
        throw new Error(`Transport ${transportId} not found`);
      }

      // Create consumer
      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true, // Start in paused state
      });
      
      participant.consumers.set(consumer.id, consumer);

      consumer.on('transportclose', () => {
        consumer.close();
        participant.consumers.delete(consumer.id);
      });

      consumer.on('producerclose', () => {
        consumer.close();
        participant.consumers.delete(consumer.id);
        socket.emit('consumerClosed', { consumerId: consumer.id });
      });
      
      callback({
        status: 'success',
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused
      });
    } catch (error) {
      console.error('Error consuming:', error);
      callback({ status: 'error', message: error.message });
    }
  });

  // Handle resumeConsumer
  socket.on('resumeConsumer', async (data, callback) => {
    try {
      const { roomId, consumerId } = data;
      const room = rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }
      
      const participant = room.participants.get(socket.id);
      if (!participant) {
        throw new Error(`Participant ${socket.id} not found in room ${roomId}`);
      }

      const consumer = participant.consumers.get(consumerId);
      if (!consumer) {
        throw new Error(`Consumer ${consumerId} not found`);
      }

      await consumer.resume();
      
      callback({ status: 'success' });
    } catch (error) {
      console.error('Error resuming consumer:', error);
      callback({ status: 'error', message: error.message });
    }
  });
  
  // Handle getProducers request
  socket.on('getProducers', async (data, callback) => {
    try {
      const { roomId } = data;
      const room = rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }
      
      // Collect all producers from all participants in the room
      const producers = [];
      
      for (const participant of room.participants.values()) {
        // Skip the requesting participant
        if (participant.id === socket.id) continue;
        
        for (const [producerId, producer] of participant.producers.entries()) {
          producers.push({
            id: producerId,
            kind: producer.kind,
            participantId: participant.id
          });
        }
      }
      
      console.log(`Found ${producers.length} producers in room ${roomId}`);
      callback({ status: 'success', producers });
    } catch (error) {
      console.error('Error getting producers:', error);
      callback({ status: 'error', message: error.message });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Clean up all rooms the participant was in
    rooms.forEach((room, roomId) => {
      if (room.participants.has(socket.id)) {
        const participant = room.participants.get(socket.id);
        
        // Close all transports
        participant.producerTransports.forEach(transport => transport.close());
        participant.consumerTransports.forEach(transport => transport.close());
        
        // Remove from room
        room.participants.delete(socket.id);
        
        // Notify others that this participant has left
        socket.to(roomId).emit('participantLeft', { participantId: socket.id });
        
        // If room is empty, remove it
        if (room.participants.size === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted because it's empty`);
        }
      }
    });
  });
});

// Start server
async function start() {
  await startMediasoup();
  
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});