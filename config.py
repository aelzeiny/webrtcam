#!/usr/bin/env python3
"""
WebRTCam - Configuration
Configuration settings for the WebRTC to USB Webcam Bridge
"""

import os
import yaml
import logging

logger = logging.getLogger(__name__)

class Config:
    # Web server settings
    WEB_HOST = "0.0.0.0"  # Listen on all interfaces
    WEB_PORT = 8080
    
    # WebRTC settings
    ICE_SERVERS = [
        {"urls": ["stun:stun.l.google.com:19302"]}
    ]
    
    # Video settings
    VIDEO_WIDTH = 1280
    VIDEO_HEIGHT = 720
    VIDEO_FRAMERATE = 30
    VIDEO_CODEC = "H264"  # H264, VP8, VP9
    
    # Audio settings
    AUDIO_ENABLED = True
    AUDIO_CHANNELS = 1
    AUDIO_SAMPLE_RATE = 48000
    AUDIO_CODEC = "opus"
    
    # USB Gadget settings
    USB_GADGET_PATH = "/sys/kernel/config/usb_gadget/webrtcam"
    USB_VENDOR_ID = "0x1d6b"  # Linux Foundation
    USB_PRODUCT_ID = "0x0104"  # Multifunction Composite Gadget
    USB_MANUFACTURER = "WebRTCam Project"
    USB_PRODUCT = "WebRTC Virtual Camera"
    USB_SERIAL = "00000000"
    
    # UVC settings
    UVC_DEVICE_NAME = "WebRTCam Video"
    UVC_FUNCTION_NAME = "uvc.0"
    
    # UAC settings
    UAC_DEVICE_NAME = "WebRTCam Audio"
    UAC_FUNCTION_NAME = "uac1.0"
    
    # Media pipeline settings
    PIPELINE_BUFFER_SIZE = 5  # Number of frames to buffer
    PIPELINE_MAX_LATENCY_MS = 100  # Max acceptable latency
    
    # Logging settings
    LOG_LEVEL = "INFO"
    LOG_FILE = "/var/log/webrtcam.log"
    LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    def __init__(self):
        """Initialize with default values"""
        pass
        
    def load_from_file(self, config_file):
        """Load configuration from a YAML file"""
        try:
            if not os.path.exists(config_file):
                logger.warning(f"Config file not found: {config_file}")
                return
                
            with open(config_file, 'r') as f:
                config_data = yaml.safe_load(f)
                
            # Update attributes from config file
            for key, value in config_data.items():
                if hasattr(self, key):
                    setattr(self, key, value)
                else:
                    logger.warning(f"Unknown configuration key: {key}")
                    
            logger.info(f"Loaded configuration from {config_file}")
        except Exception as e:
            logger.error(f"Error loading config file: {e}")
            
    def to_dict(self):
        """Convert configuration to dictionary"""
        return {key: value for key, value in self.__dict__.items() 
                if not key.startswith('_') and not callable(value)}