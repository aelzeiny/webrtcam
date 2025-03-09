#!/usr/bin/env python3
"""
WebRTCam - Media Pipeline
Handles processing and conversion of WebRTC media streams for USB output
"""

import asyncio
import logging
import time
import av
import numpy as np
from collections import deque
from aiortc.mediastreams import MediaStreamTrack
from threading import Lock
from typing import Dict, Optional, List

logger = logging.getLogger(__name__)

class MediaPipeline:
    def __init__(self, config):
        self.config = config
        self.running = False
        self.usb_gadget = None
        
        # Video processing
        self.video_track = None
        self.video_track_lock = Lock()
        self.video_frame_queue = deque(maxlen=self.config.PIPELINE_BUFFER_SIZE)
        self.video_stats = {
            "frames_received": 0,
            "frames_dropped": 0,
            "last_frame_time": 0,
            "current_fps": 0,
        }
        
        # Audio processing
        self.audio_track = None
        self.audio_track_lock = Lock()
        self.audio_sample_queue = deque(maxlen=self.config.PIPELINE_BUFFER_SIZE * 10)  # Audio has more samples
        self.audio_stats = {
            "samples_received": 0,
            "samples_dropped": 0,
            "last_sample_time": 0,
        }
        
        # Video codec setup
        self.h264_codec = None
        self.video_encoder = None
        self.video_decoder = None
        
        # Audio codec setup
        self.opus_codec = None
        self.audio_encoder = None
        self.audio_decoder = None
        
        # Pipeline tasks
        self.video_task = None
        self.audio_task = None
    
    async def start(self):
        """Start the media pipeline"""
        logger.info("Starting media pipeline")
        
        try:
            # Set up video codec
            if self.config.VIDEO_CODEC == "H264":
                self.video_encoder = av.CodecContext.create("h264_omx", "w")  # Hardware encoding on Pi
            else:
                # Fallback to software encoding
                self.video_encoder = av.CodecContext.create("libx264", "w")
                
            self.video_encoder.width = self.config.VIDEO_WIDTH
            self.video_encoder.height = self.config.VIDEO_HEIGHT
            self.video_encoder.bit_rate = 2000000  # 2 Mbps
            self.video_encoder.pix_fmt = "yuv420p"
            self.video_encoder.framerate = self.config.VIDEO_FRAMERATE
            
            self.video_decoder = av.CodecContext.create("h264", "r")
            
            # Set up audio codec
            if self.config.AUDIO_ENABLED:
                self.audio_encoder = av.CodecContext.create("pcm_s16le", "w")
                self.audio_encoder.sample_rate = self.config.AUDIO_SAMPLE_RATE
                self.audio_encoder.channels = self.config.AUDIO_CHANNELS
                
                self.audio_decoder = av.CodecContext.create("opus", "r")
                self.audio_decoder.sample_rate = self.config.AUDIO_SAMPLE_RATE
                self.audio_decoder.channels = self.config.AUDIO_CHANNELS
            
            # Start the processing tasks
            self.video_task = asyncio.create_task(self._process_video())
            
            if self.config.AUDIO_ENABLED:
                self.audio_task = asyncio.create_task(self._process_audio())
            
            self.running = True
            logger.info("Media pipeline started successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error starting media pipeline: {e}")
            return False
    
    async def stop(self):
        """Stop the media pipeline"""
        logger.info("Stopping media pipeline")
        
        try:
            self.running = False
            
            # Cancel the processing tasks
            if self.video_task:
                self.video_task.cancel()
                try:
                    await self.video_task
                except asyncio.CancelledError:
                    pass
                
            if self.audio_task:
                self.audio_task.cancel()
                try:
                    await self.audio_task
                except asyncio.CancelledError:
                    pass
            
            # Clear queues
            self.video_frame_queue.clear()
            self.audio_sample_queue.clear()
            
            # Reset tracks
            with self.video_track_lock:
                self.video_track = None
            
            with self.audio_track_lock:
                self.audio_track = None
            
            logger.info("Media pipeline stopped")
            return True
            
        except Exception as e:
            logger.error(f"Error stopping media pipeline: {e}")
            return False
    
    def add_video_track(self, track):
        """Add a video track to the pipeline"""
        logger.info("Adding video track to pipeline")
        
        with self.video_track_lock:
            self.video_track = track
            
            # Set up a callback to receive frames
            @track.on("frame")
            def on_frame(frame):
                # Drop frames if queue is full
                if len(self.video_frame_queue) >= self.config.PIPELINE_BUFFER_SIZE:
                    self.video_stats["frames_dropped"] += 1
                    return
                
                # Add frame to queue for processing
                self.video_frame_queue.append(frame)
                
                # Update stats
                self.video_stats["frames_received"] += 1
                now = time.time()
                dt = now - self.video_stats["last_frame_time"] if self.video_stats["last_frame_time"] > 0 else 1
                self.video_stats["last_frame_time"] = now
                # Calculate rolling average FPS
                alpha = 0.1  # Smoothing factor
                new_fps = 1 / dt if dt > 0 else 0
                if self.video_stats["current_fps"] == 0:
                    self.video_stats["current_fps"] = new_fps
                else:
                    self.video_stats["current_fps"] = alpha * new_fps + (1 - alpha) * self.video_stats["current_fps"]
    
    def remove_video_track(self, track):
        """Remove a video track from the pipeline"""
        logger.info("Removing video track from pipeline")
        
        with self.video_track_lock:
            if self.video_track == track:
                self.video_track = None
    
    def add_audio_track(self, track):
        """Add an audio track to the pipeline"""
        if not self.config.AUDIO_ENABLED:
            return
            
        logger.info("Adding audio track to pipeline")
        
        with self.audio_track_lock:
            self.audio_track = track
            
            # Set up a callback to receive audio samples
            @track.on("frame")
            def on_frame(frame):
                # Drop samples if queue is full
                if len(self.audio_sample_queue) >= self.audio_sample_queue.maxlen:
                    self.audio_stats["samples_dropped"] += 1
                    return
                
                # Add audio frame to queue for processing
                self.audio_sample_queue.append(frame)
                
                # Update stats
                self.audio_stats["samples_received"] += 1
                self.audio_stats["last_sample_time"] = time.time()
    
    def remove_audio_track(self, track):
        """Remove an audio track from the pipeline"""
        if not self.config.AUDIO_ENABLED:
            return
            
        logger.info("Removing audio track from pipeline")
        
        with self.audio_track_lock:
            if self.audio_track == track:
                self.audio_track = None
    
    def set_usb_gadget(self, usb_gadget):
        """Set the USB gadget reference for output"""
        self.usb_gadget = usb_gadget
    
    async def _process_video(self):
        """Process video frames from WebRTC to USB gadget"""
        logger.info("Video processing task started")
        
        try:
            while self.running:
                # Check if we have frames to process
                if not self.video_frame_queue or not self.usb_gadget:
                    await asyncio.sleep(0.001)  # Short sleep to avoid busy wait
                    continue
                
                # Get a frame from the queue
                frame = self.video_frame_queue.popleft()
                
                try:
                    # Convert the frame to the right format for USB
                    # For UVC gadgets, we typically need YUV or H.264
                    
                    # Create an AVFrame
                    av_frame = av.VideoFrame.from_ndarray(
                        frame.to_ndarray(format="bgr24"),
                        format="bgr24"
                    )
                    
                    # Resize if necessary
                    if av_frame.width != self.config.VIDEO_WIDTH or av_frame.height != self.config.VIDEO_HEIGHT:
                        av_frame = av_frame.reformat(
                            width=self.config.VIDEO_WIDTH,
                            height=self.config.VIDEO_HEIGHT,
                            format="yuv420p"
                        )
                    elif av_frame.format.name != "yuv420p":
                        av_frame = av_frame.reformat(format="yuv420p")
                    
                    # Encode to H.264
                    packets = self.video_encoder.encode(av_frame)
                    
                    # Send the encoded data to the USB gadget
                    for packet in packets:
                        await self.usb_gadget.write_video_frame(packet.to_bytes())
                    
                except Exception as e:
                    logger.error(f"Error processing video frame: {e}")
                
                # Yield to other tasks
                await asyncio.sleep(0)
                
        except asyncio.CancelledError:
            logger.info("Video processing task cancelled")
            raise
        except Exception as e:
            logger.error(f"Video processing task error: {e}")
    
    async def _process_audio(self):
        """Process audio samples from WebRTC to USB gadget"""
        if not self.config.AUDIO_ENABLED:
            return
            
        logger.info("Audio processing task started")
        
        try:
            while self.running:
                # Check if we have audio samples to process
                if not self.audio_sample_queue or not self.usb_gadget:
                    await asyncio.sleep(0.001)  # Short sleep to avoid busy wait
                    continue
                
                # Get an audio frame from the queue
                frame = self.audio_sample_queue.popleft()
                
                try:
                    # Convert to PCM format required by USB Audio Class
                    # UAC typically wants PCM data in specific format
                    
                    # Convert to PCM
                    pcm_format = "s16"  # 16-bit signed PCM
                    
                    # Create a frame with the correct number of channels
                    av_frame = av.AudioFrame.from_ndarray(
                        frame.to_ndarray(),
                        format=pcm_format,
                        layout=f"mono" if self.config.AUDIO_CHANNELS == 1 else "stereo"
                    )
                    
                    # Resample if necessary
                    if av_frame.sample_rate != self.config.AUDIO_SAMPLE_RATE:
                        av_frame = av_frame.resample(self.config.AUDIO_SAMPLE_RATE)
                    
                    # Encode to PCM
                    packets = self.audio_encoder.encode(av_frame)
                    
                    # Send the encoded data to the USB gadget
                    for packet in packets:
                        await self.usb_gadget.write_audio_sample(packet.to_bytes())
                    
                except Exception as e:
                    logger.error(f"Error processing audio frame: {e}")
                
                # Yield to other tasks
                await asyncio.sleep(0)
                
        except asyncio.CancelledError:
            logger.info("Audio processing task cancelled")
            raise
        except Exception as e:
            logger.error(f"Audio processing task error: {e}")
    
    def get_status(self):
        """Get the status of the media pipeline"""
        return {
            "running": self.running,
            "video": {
                "track_active": self.video_track is not None,
                "frames_received": self.video_stats["frames_received"],
                "frames_dropped": self.video_stats["frames_dropped"],
                "fps": round(self.video_stats["current_fps"], 1),
                "queue_size": len(self.video_frame_queue),
            },
            "audio": {
                "enabled": self.config.AUDIO_ENABLED,
                "track_active": self.audio_track is not None if self.config.AUDIO_ENABLED else False,
                "samples_received": self.audio_stats["samples_received"] if self.config.AUDIO_ENABLED else 0,
                "samples_dropped": self.audio_stats["samples_dropped"] if self.config.AUDIO_ENABLED else 0,
                "queue_size": len(self.audio_sample_queue) if self.config.AUDIO_ENABLED else 0,
            }
        }