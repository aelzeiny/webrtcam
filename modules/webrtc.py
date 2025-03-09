#!/usr/bin/env python3
"""
WebRTCam - WebRTC Server
Handles WebRTC signaling, ICE candidates, and media streams
"""

import asyncio
import logging
import time
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
from aiortc.contrib.media import MediaRelay

logger = logging.getLogger(__name__)

class WebRTCServer:
    def __init__(self, config, media_pipeline):
        self.config = config
        self.media_pipeline = media_pipeline
        self.peer_connections = set()
        self.relay = MediaRelay()
        self.connection_count = 0
        self.last_connection_time = 0
        self.running = False
        
    async def start(self):
        """Start the WebRTC server"""
        logger.info("Starting WebRTC server")
        self.running = True
        
    async def stop(self):
        """Stop the WebRTC server and close all connections"""
        logger.info("Stopping WebRTC server")
        
        # Close all peer connections
        coros = [pc.close() for pc in self.peer_connections]
        await asyncio.gather(*coros, return_exceptions=True)
        self.peer_connections.clear()
        
        self.running = False
        
    async def handle_offer(self, offer_sdp):
        """
        Handle a WebRTC offer from a client
        
        Args:
            offer_sdp: The SDP offer from the client
            
        Returns:
            The SDP answer to send back to the client
        """
        logger.info("Received WebRTC offer")
        
        # Create a new RTCPeerConnection
        pc = RTCPeerConnection(configuration={"iceServers": self.config.ICE_SERVERS})
        self.peer_connections.add(pc)
        
        # Set up event handlers
        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            logger.info(f"Connection state is {pc.connectionState}")
            if pc.connectionState == "failed":
                await pc.close()
                self.peer_connections.discard(pc)
                
        @pc.on("track")
        async def on_track(track):
            logger.info(f"Received {track.kind} track from client")
            
            if track.kind == "audio" and self.config.AUDIO_ENABLED:
                # Forward the audio track to the media pipeline
                self.media_pipeline.add_audio_track(self.relay.subscribe(track))
            
            elif track.kind == "video":
                # Forward the video track to the media pipeline
                self.media_pipeline.add_video_track(self.relay.subscribe(track))
            
            @track.on("ended")
            async def on_ended():
                logger.info(f"{track.kind} track ended")
                if track.kind == "audio":
                    self.media_pipeline.remove_audio_track(track)
                elif track.kind == "video":
                    self.media_pipeline.remove_video_track(track)
        
        # Set the remote description
        offer = RTCSessionDescription(sdp=offer_sdp, type="offer")
        await pc.setRemoteDescription(offer)
        
        # Create answer
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        
        # Set up a cleanup function to close the peer connection when it's done
        async def cleanup():
            try:
                await pc.wait_for_connection_state_change("disconnected", "failed", "closed")
            finally:
                logger.info("WebRTC connection closed")
                await pc.close()
                self.peer_connections.discard(pc)
        
        # Start the cleanup task
        asyncio.create_task(cleanup())
        
        # Update stats
        self.connection_count += 1
        self.last_connection_time = time.time()
        
        logger.info("WebRTC connection established")
        return pc.localDescription.sdp
    
    def get_status(self):
        """Get the status of the WebRTC server"""
        return {
            "active_connections": len(self.peer_connections),
            "total_connections": self.connection_count,
            "last_connection": self.last_connection_time,
            "running": self.running
        }