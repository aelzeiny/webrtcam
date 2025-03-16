import React, {
  createContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { io } from "socket.io-client";
import { Device } from "mediasoup-client";

export const RoomContext = createContext();

export const RoomProvider = ({ children }) => {
  const [roomId, setRoomId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isProducing, setIsProducing] = useState(false);
  const [isConsuming, setIsConsuming] = useState(false);
  const [error, setError] = useState(null);
  const [availableSessions, setAvailableSessions] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionStats, setConnectionStats] = useState(null);
  const [selectedVideoQuality, setSelectedVideoQuality] = useState("medium");

  // Refs
  const socketRef = useRef(null);
  const deviceRef = useRef(null);
  const producerTransportRef = useRef(null);
  const consumerTransportRef = useRef(null);
  const producersRef = useRef(new Map());
  const consumersRef = useRef(new Map());
  const statsIntervalRef = useRef(null);

  // Video quality presets
  const videoQualityProfiles = {
    low: {
      resolution: { width: 640, height: 360 },
      frameRate: 15,
      bitrate: 500000,
    },
    medium: {
      resolution: { width: 1280, height: 720 },
      frameRate: 30,
      bitrate: 1500000,
    },
    high: {
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
      bitrate: 2500000,
    },
  };

  // Initialize socket connection
  useEffect(() => {
    // Determine the socket.io URL based on environment
    const isDevelopment = import.meta.env.DEV;
    const socketURL = isDevelopment ? "/" : window.location.origin;

    socketRef.current = io(socketURL, {
      path: "/socket.io",
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    // Socket event listeners
    socketRef.current.on("connect", () => {
      console.log("Connected to signaling server");
    });

    socketRef.current.on("disconnect", () => {
      console.log("Disconnected from signaling server");
      setIsConnected(false);
      cleanup();
    });

    socketRef.current.on("connect_error", (err) => {
      console.error("Connection error:", err);
      setError(`Connection error: ${err.message}`);
    });

    socketRef.current.on("consumerClosed", ({ consumerId }) => {
      console.log("Consumer closed:", consumerId);
      if (consumersRef.current.has(consumerId)) {
        const consumer = consumersRef.current.get(consumerId);
        consumer.close();
        consumersRef.current.delete(consumerId);
      }
    });

    // Fetch available sessions
    fetchSessions();

    // Clean up on component unmount
    return () => {
      cleanup();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Set up the producer event listener separately so it can use the current isConsuming state
  useEffect(() => {
    if (!socketRef.current) return;

    // Clear previous listener
    socketRef.current.off("newProducer");

    // Add new listener with current isConsuming state
    socketRef.current.on(
      "newProducer",
      ({ producerId, producerSocketId, kind }) => {
        console.log(`New ${kind} producer available:`, producerId);
        console.log(`Current consuming state: ${isConsuming}`);

        if (isConsuming) {
          console.log(
            `Starting to consume producer: ${producerId}, kind: ${kind}`
          );
          // Automatically consume the new producer
          consumeProducer(producerId, kind);
        } else {
          console.log(
            "Not consuming this producer because isConsuming is false"
          );
        }
      }
    );

    // When we first start consuming, we need to check for any existing producers in the room
    if (isConsuming && roomId) {
      console.log("Started consuming - checking for existing producers");
      checkExistingProducers();
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.off("newProducer");
      }
    };
  }, [isConsuming, roomId]);

  // Check for existing producers in the room
  const checkExistingProducers = async () => {
    try {
      if (!socketRef.current || !roomId) return;

      console.log("Checking for existing producers in room:", roomId);
      socketRef.current.emit("getProducers", { roomId }, async (response) => {
        if (response.status === "success") {
          const { producers } = response;
          console.log("Existing producers found:", producers);

          // Consume each existing producer
          for (const producer of producers) {
            await consumeProducer(producer.id, producer.kind);
          }
        } else {
          console.error("Failed to get producers:", response.message);
        }
      });
    } catch (error) {
      console.error("Error checking existing producers:", error);
    }
  };

  // Fetch available sessions from the API
  const fetchSessions = useCallback(async () => {
    try {
      // Use the same origin in production, or the proxied path in development
      const apiPath = "/api/sessions";
      const response = await fetch(apiPath);
      const sessions = await response.json();
      setAvailableSessions(sessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      setError(`Error fetching sessions: ${error.message}`);
    }
  }, []);

  // Set up a periodic fetch of sessions every 5 seconds
  useEffect(() => {
    // Fetch immediately on component mount
    fetchSessions();
    
    // Set up the interval
    const intervalId = setInterval(() => {
      fetchSessions();
    }, 5000);
    
    // Clean up on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [fetchSessions]);

  // Create or join a room
  const joinRoom = async (roomIdToJoin) => {
    try {
      if (!roomIdToJoin) {
        throw new Error("Room ID is required");
      }

      if (!socketRef.current || !socketRef.current.connected) {
        throw new Error("Not connected to signaling server");
      }

      // Join the room via socket.io
      const response = await new Promise((resolve, reject) => {
        socketRef.current.emit("joinRoom", { roomId: roomIdToJoin }, (res) => {
          if (res.status === "success") {
            resolve(res);
          } else {
            reject(new Error(res.message || "Failed to join room"));
          }
        });
      });

      console.log("Joined room:", response);
      setRoomId(roomIdToJoin);
      setIsConnected(true);

      // Initialize the MediaSoup device
      await initializeDevice(roomIdToJoin);

      return true;
    } catch (error) {
      console.error("Error joining room:", error);
      setError(`Error joining room: ${error.message}`);
      return false;
    }
  };

  // Initialize the MediaSoup device
  const initializeDevice = async (roomId) => {
    try {
      // Create a new device
      const device = new Device();
      deviceRef.current = device;

      // Get router RTP capabilities
      const rtpCapabilitiesResponse = await new Promise((resolve, reject) => {
        socketRef.current.emit(
          "getRouterRtpCapabilities",
          { roomId },
          (res) => {
            if (res.status === "success") {
              resolve(res.rtpCapabilities);
            } else {
              reject(
                new Error(res.message || "Failed to get RTP capabilities")
              );
            }
          }
        );
      });

      // Load the device with router's RTP capabilities
      await device.load({ routerRtpCapabilities: rtpCapabilitiesResponse });
      console.log("Device loaded");

      return device;
    } catch (error) {
      console.error("Error initializing device:", error);
      setError(`Error initializing device: ${error.message}`);
      throw error;
    }
  };

  // Start producing media
  const startProducing = async () => {
    try {
      if (!isConnected || !deviceRef.current || !deviceRef.current.loaded) {
        throw new Error("Not connected to a room");
      }

      // Check if the device can produce the media types we need
      if (
        !deviceRef.current.canProduce("audio") ||
        !deviceRef.current.canProduce("video")
      ) {
        throw new Error("Device cannot produce media");
      }

      // Get user media based on selected quality
      const quality = videoQualityProfiles[selectedVideoQuality];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { ideal: quality.resolution.width },
          height: { ideal: quality.resolution.height },
          frameRate: { ideal: quality.frameRate },
        },
      });

      setLocalStream(stream);

      // Create a producer transport
      const transportResponse = await new Promise((resolve, reject) => {
        socketRef.current.emit("createProducerTransport", { roomId }, (res) => {
          if (res.status === "success") {
            resolve(res);
          } else {
            reject(
              new Error(res.message || "Failed to create producer transport")
            );
          }
        });
      });

      const transport = deviceRef.current.createSendTransport({
        id: transportResponse.id,
        iceParameters: transportResponse.iceParameters,
        iceCandidates: transportResponse.iceCandidates,
        dtlsParameters: transportResponse.dtlsParameters,
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
        ],
      });

      // Handle transport connection
      transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
        try {
          await new Promise((resolve, reject) => {
            socketRef.current.emit(
              "connectProducerTransport",
              {
                roomId,
                transportId: transport.id,
                dtlsParameters,
              },
              (res) => {
                if (res.status === "success") {
                  resolve();
                } else {
                  reject(
                    new Error(
                      res.message || "Failed to connect producer transport"
                    )
                  );
                }
              }
            );
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      // Handle produce event
      transport.on(
        "produce",
        async ({ kind, rtpParameters, appData }, callback, errback) => {
          try {
            const { id } = await new Promise((resolve, reject) => {
              socketRef.current.emit(
                "produce",
                {
                  roomId,
                  transportId: transport.id,
                  kind,
                  rtpParameters,
                  appData,
                },
                (res) => {
                  if (res.status === "success") {
                    resolve({ id: res.id });
                  } else {
                    reject(new Error(res.message || "Failed to produce"));
                  }
                }
              );
            });
            callback({ id });
          } catch (error) {
            errback(error);
          }
        }
      );

      producerTransportRef.current = transport;

      // Produce audio
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const audioProducer = await transport.produce({
          track: audioTrack,
          codecOptions: {
            opusStereo: true,
            opusDtx: true,
          },
          appData: { mediaType: "audio" },
        });
        producersRef.current.set("audio", audioProducer);
      }

      // Produce video
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const videoProducer = await transport.produce({
          track: videoTrack,
          encodings: [
            {
              maxBitrate: quality.bitrate,
              maxFramerate: quality.frameRate,
            },
          ],
          codecOptions: {
            videoGoogleStartBitrate: 1000,
          },
          appData: { mediaType: "video" },
        });
        producersRef.current.set("video", videoProducer);
      }

      setIsProducing(true);
      return true;
    } catch (error) {
      console.error("Error starting producer:", error);
      setError(`Error starting producer: ${error.message}`);
      return false;
    }
  };

  // Stop producing media
  const stopProducing = () => {
    try {
      // Close all producers
      for (const producer of producersRef.current.values()) {
        producer.close();
      }
      producersRef.current.clear();

      // Close producer transport
      if (producerTransportRef.current) {
        producerTransportRef.current.close();
        producerTransportRef.current = null;
      }

      // Stop local stream tracks
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        setLocalStream(null);
      }

      setIsProducing(false);
    } catch (error) {
      console.error("Error stopping producer:", error);
      setError(`Error stopping producer: ${error.message}`);
    }
  };

  // Start consuming media
  const startConsuming = async () => {
    try {
      if (!isConnected || !deviceRef.current || !deviceRef.current.loaded) {
        throw new Error("Not connected to a room");
      }

      // In mediasoup-client, a device can consume if it's loaded and has RTP capabilities
      // There's no specific canConsume method, so we just check if it's loaded

      // Create a consumer transport
      const transportResponse = await new Promise((resolve, reject) => {
        socketRef.current.emit("createConsumerTransport", { roomId }, (res) => {
          if (res.status === "success") {
            resolve(res);
          } else {
            reject(
              new Error(res.message || "Failed to create consumer transport")
            );
          }
        });
      });

      const transport = deviceRef.current.createRecvTransport({
        id: transportResponse.id,
        iceParameters: transportResponse.iceParameters,
        iceCandidates: transportResponse.iceCandidates,
        dtlsParameters: transportResponse.dtlsParameters,
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
        ],
      });

      // Handle transport connection
      transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
        try {
          await new Promise((resolve, reject) => {
            socketRef.current.emit(
              "connectConsumerTransport",
              {
                roomId,
                transportId: transport.id,
                dtlsParameters,
              },
              (res) => {
                if (res.status === "success") {
                  resolve();
                } else {
                  reject(
                    new Error(
                      res.message || "Failed to connect consumer transport"
                    )
                  );
                }
              }
            );
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      consumerTransportRef.current = transport;
      setIsConsuming(true);

      // Start stats interval
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
      statsIntervalRef.current = setInterval(getConsumerStats, 2000);

      return true;
    } catch (error) {
      console.error("Error starting consumer:", error);
      setError(`Error starting consumer: ${error.message}`);
      return false;
    }
  };

  // Consume a producer
  const consumeProducer = async (producerId, kind) => {
    try {
      if (!consumerTransportRef.current || !deviceRef.current) {
        throw new Error("Consumer transport not created");
      }

      console.log(
        `Attempting to consume producer ${producerId} of kind ${kind}`
      );

      // Consume the producer
      const { rtpCapabilities } = deviceRef.current;

      const consumerResponse = await new Promise((resolve, reject) => {
        socketRef.current.emit(
          "consume",
          {
            roomId,
            transportId: consumerTransportRef.current.id,
            producerId,
            rtpCapabilities,
          },
          (res) => {
            if (res.status === "success") {
              resolve(res);
            } else {
              reject(new Error(res.message || "Failed to consume"));
            }
          }
        );
      });

      // Create a consumer
      const consumer = await consumerTransportRef.current.consume({
        id: consumerResponse.id,
        producerId: consumerResponse.producerId,
        kind: consumerResponse.kind,
        rtpParameters: consumerResponse.rtpParameters,
      });

      consumersRef.current.set(consumer.id, consumer);

      // Resume the consumer
      await new Promise((resolve, reject) => {
        socketRef.current.emit(
          "resumeConsumer",
          {
            roomId,
            consumerId: consumer.id,
          },
          (res) => {
            if (res.status === "success") {
              resolve();
            } else {
              reject(new Error(res.message || "Failed to resume consumer"));
            }
          }
        );
      });

      // Create a new MediaStream
      const stream = new MediaStream([consumer.track]);

      if (kind === "video") {
        setRemoteStream((prev) => {
          // If there's an existing stream, add the track to it
          if (prev) {
            const audioTrack = prev.getAudioTracks()[0];
            if (audioTrack) {
              stream.addTrack(audioTrack);
            }
          }
          return stream;
        });
      } else if (kind === "audio") {
        setRemoteStream((prev) => {
          // If there's an existing stream, add the track to it
          if (prev) {
            const videoTrack = prev.getVideoTracks()[0];
            if (videoTrack) {
              stream.addTrack(videoTrack);
            }
            return stream;
          }
          return stream;
        });
      }
    } catch (error) {
      console.error(`Error consuming ${kind}:`, error);
      setError(`Error consuming ${kind}: ${error.message}`);
    }
  };

  // Stop consuming media
  const stopConsuming = () => {
    try {
      // Close all consumers
      for (const consumer of consumersRef.current.values()) {
        consumer.close();
      }
      consumersRef.current.clear();

      // Close consumer transport
      if (consumerTransportRef.current) {
        consumerTransportRef.current.close();
        consumerTransportRef.current = null;
      }

      // Clear remote stream
      setRemoteStream(null);
      setIsConsuming(false);

      // Clear stats interval
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = null;
      }
    } catch (error) {
      console.error("Error stopping consumer:", error);
      setError(`Error stopping consumer: ${error.message}`);
    }
  };

  // Get consumer stats
  const getConsumerStats = async () => {
    try {
      if (!consumerTransportRef.current || consumersRef.current.size === 0) {
        return;
      }

      const videoConsumer = Array.from(consumersRef.current.values()).find(
        (consumer) => consumer.kind === "video"
      );

      if (videoConsumer) {
        const stats = await videoConsumer.getStats();

        let totalBytesReceived = 0;
        let framesDecoded = 0;
        let packetsLost = 0;
        let jitter = 0;
        let frameWidth = 0;
        let frameHeight = 0;
        let frameRate = 0;

        for (const stat of stats.values()) {
          if (stat.type === "inbound-rtp") {
            totalBytesReceived = stat.bytesReceived;
            framesDecoded = stat.framesDecoded;
            packetsLost = stat.packetsLost;
            jitter = stat.jitter;
            frameWidth = stat.frameWidth;
            frameHeight = stat.frameHeight;
            if (stat.framesPerSecond) {
              frameRate = stat.framesPerSecond;
            }
          }
        }

        setConnectionStats({
          totalBytesReceived,
          framesDecoded,
          packetsLost,
          jitter,
          resolution: `${frameWidth}x${frameHeight}`,
          frameRate,
        });
      }
    } catch (error) {
      console.error("Error getting stats:", error);
    }
  };

  // Leave the room
  const leaveRoom = () => {
    // Stop producing and consuming
    stopProducing();
    stopConsuming();

    // Reset state
    setRoomId("");
    setIsConnected(false);
    setError(null);

    // Clear device
    deviceRef.current = null;
  };

  // Cleanup function
  const cleanup = () => {
    stopProducing();
    stopConsuming();

    // Clear all refs
    deviceRef.current = null;
    producerTransportRef.current = null;
    consumerTransportRef.current = null;
    producersRef.current.clear();
    consumersRef.current.clear();

    // Clear intervals
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
  };

  return (
    <RoomContext.Provider
      value={{
        roomId,
        isConnected,
        isProducing,
        isConsuming,
        error,
        availableSessions,
        localStream,
        remoteStream,
        connectionStats,
        selectedVideoQuality,
        setSelectedVideoQuality,
        joinRoom,
        leaveRoom,
        startProducing,
        stopProducing,
        startConsuming,
        stopConsuming,
        fetchSessions,
      }}
    >
      {children}
    </RoomContext.Provider>
  );
};
