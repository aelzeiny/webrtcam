#!/usr/bin/env python3
"""
WebRTCam - USB Gadget
Manages the USB gadget configuration for UVC (video) and UAC (audio) devices
"""

import asyncio
import logging
import os
import subprocess
import time
import fcntl
import struct
import v4l2

logger = logging.getLogger(__name__)

class USBGadget:
    def __init__(self, config):
        self.config = config
        self.video_device = None
        self.audio_device = None
        self.running = False
        self.gadget_configured = False
        
    async def start(self):
        """Start the USB gadget device"""
        logger.info("Starting USB gadget")
        
        try:
            # Need root privileges for USB gadget setup
            if os.geteuid() != 0:
                logger.warning("USB gadget setup requires root privileges")
                logger.warning("Limited functionality - will attempt to use existing gadgets if available")
                self.running = await self._find_existing_gadgets()
                return self.running
            
            # Check if configfs is mounted
            if not os.path.exists("/sys/kernel/config"):
                logger.error("ConfigFS not mounted, cannot set up USB gadget")
                return False
            
            # Configure the gadget
            success = await self._configure_gadget()
            if not success:
                logger.error("Failed to configure USB gadget")
                return False
            
            # Enable the gadget
            success = await self._enable_gadget()
            if not success:
                logger.error("Failed to enable USB gadget")
                return False
            
            # Open the video and audio devices
            success = await self._open_devices()
            if not success:
                logger.error("Failed to open USB gadget devices")
                return False
            
            self.running = True
            logger.info("USB gadget started successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error starting USB gadget: {e}")
            return False
    
    async def stop(self):
        """Stop the USB gadget device"""
        logger.info("Stopping USB gadget")
        
        try:
            # Close the video and audio devices
            if self.video_device:
                self.video_device.close()
                self.video_device = None
                
            if self.audio_device:
                self.audio_device.close()
                self.audio_device = None
            
            # Disable the gadget if we configured it
            if self.gadget_configured and os.geteuid() == 0:
                await self._disable_gadget()
            
            self.running = False
            logger.info("USB gadget stopped")
            return True
            
        except Exception as e:
            logger.error(f"Error stopping USB gadget: {e}")
            return False
    
    async def _find_existing_gadgets(self):
        """Try to find and use existing gadget devices"""
        try:
            # Look for video device
            for i in range(10):  # Try a few device numbers
                video_path = f"/dev/video{i}"
                if os.path.exists(video_path):
                    try:
                        self.video_device = open(video_path, "wb")
                        logger.info(f"Found existing video device: {video_path}")
                        break
                    except Exception:
                        continue
            
            # Look for audio device (PCM)
            for i in range(10):  # Try a few device numbers
                audio_path = f"/dev/snd/pcmC{i}D0p"
                if os.path.exists(audio_path):
                    try:
                        self.audio_device = open(audio_path, "wb")
                        logger.info(f"Found existing audio device: {audio_path}")
                        break
                    except Exception:
                        continue
            
            return self.video_device is not None
            
        except Exception as e:
            logger.error(f"Error finding existing gadgets: {e}")
            return False
    
    async def _configure_gadget(self):
        """Configure the USB gadget using ConfigFS"""
        try:
            # Create the gadget directory
            gadget_path = self.config.USB_GADGET_PATH
            os.makedirs(gadget_path, exist_ok=True)
            
            # Set USB specification values
            with open(os.path.join(gadget_path, "idVendor"), "w") as f:
                f.write(self.config.USB_VENDOR_ID)
            with open(os.path.join(gadget_path, "idProduct"), "w") as f:
                f.write(self.config.USB_PRODUCT_ID)
            
            # Create English (0x409) strings
            strings_path = os.path.join(gadget_path, "strings", "0x409")
            os.makedirs(strings_path, exist_ok=True)
            
            with open(os.path.join(strings_path, "manufacturer"), "w") as f:
                f.write(self.config.USB_MANUFACTURER)
            with open(os.path.join(strings_path, "product"), "w") as f:
                f.write(self.config.USB_PRODUCT)
            with open(os.path.join(strings_path, "serialnumber"), "w") as f:
                f.write(self.config.USB_SERIAL)
            
            # Create configuration
            config_path = os.path.join(gadget_path, "configs", "c.1")
            os.makedirs(config_path, exist_ok=True)
            
            with open(os.path.join(config_path, "MaxPower"), "w") as f:
                f.write("500")  # 500mA
            
            # Create config strings
            config_strings_path = os.path.join(config_path, "strings", "0x409")
            os.makedirs(config_strings_path, exist_ok=True)
            
            with open(os.path.join(config_strings_path, "configuration"), "w") as f:
                f.write("WebRTCam Configuration")
            
            # Create UVC (Video) function
            uvc_path = os.path.join(gadget_path, "functions", self.config.UVC_FUNCTION_NAME)
            os.makedirs(uvc_path, exist_ok=True)
            
            # Configure UVC formats
            streaming_path = os.path.join(uvc_path, "streaming")
            os.makedirs(os.path.join(streaming_path, "header", "h"), exist_ok=True)
            os.makedirs(os.path.join(streaming_path, "uncompressed", "u"), exist_ok=True)
            os.makedirs(os.path.join(streaming_path, "mjpeg", "m"), exist_ok=True)
            
            # Add a H.264 format
            h264_path = os.path.join(streaming_path, "h264", "h")
            os.makedirs(h264_path, exist_ok=True)
            
            with open(os.path.join(h264_path, "bFramePeriod"), "w") as f:
                f.write("3333")  # 30 FPS = 1/30 = 0.033s = 33.3ms = 33300us
            with open(os.path.join(h264_path, "bmHints"), "w") as f:
                f.write("1")  # dwFrameInterval
            with open(os.path.join(h264_path, "bPictureType"), "w") as f:
                f.write("0")  # No B frames
            with open(os.path.join(h264_path, "wWidth"), "w") as f:
                f.write(str(self.config.VIDEO_WIDTH))
            with open(os.path.join(h264_path, "wHeight"), "w") as f:
                f.write(str(self.config.VIDEO_HEIGHT))
            with open(os.path.join(h264_path, "dwDefaultFrameInterval"), "w") as f:
                f.write("333333")  # 30 FPS = 1/30 = 0.033s = 33.3ms = 33300us
            with open(os.path.join(h264_path, "dwMaxBitRate"), "w") as f:
                f.write("10000000")  # 10 Mbps
            with open(os.path.join(h264_path, "dwMaxVideoFrameBufferSize"), "w") as f:
                buffer_size = self.config.VIDEO_WIDTH * self.config.VIDEO_HEIGHT * 3  # 3 bytes per pixel
                f.write(str(buffer_size))
            
            # Add frame descriptors
            frame_path = os.path.join(h264_path, "framei")
            os.makedirs(frame_path, exist_ok=True)
            
            with open(os.path.join(frame_path, "dwFrameInterval"), "w") as f:
                f.write("333333")  # 30 FPS
            
            # Create UAC (Audio) function if audio is enabled
            if self.config.AUDIO_ENABLED:
                uac_path = os.path.join(gadget_path, "functions", self.config.UAC_FUNCTION_NAME)
                os.makedirs(uac_path, exist_ok=True)
                
                # Configure audio format
                with open(os.path.join(uac_path, "c_chmask"), "w") as f:
                    f.write(str(1 << (self.config.AUDIO_CHANNELS - 1)))  # Channel mask (1 for mono, 3 for stereo)
                with open(os.path.join(uac_path, "c_srate"), "w") as f:
                    f.write(str(self.config.AUDIO_SAMPLE_RATE))
                with open(os.path.join(uac_path, "c_ssize"), "w") as f:
                    f.write("2")  # 16-bit
                
                # Link the audio function to the configuration
                os.symlink(uac_path, os.path.join(config_path, self.config.UAC_FUNCTION_NAME))
            
            # Link the video function to the configuration
            os.symlink(uvc_path, os.path.join(config_path, self.config.UVC_FUNCTION_NAME))
            
            self.gadget_configured = True
            logger.info("USB gadget configured successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error configuring USB gadget: {e}")
            return False
    
    async def _enable_gadget(self):
        """Enable the USB gadget by binding it to the UDC"""
        try:
            # Find the first available UDC (USB Device Controller)
            udc = None
            udc_dir = "/sys/class/udc"
            if os.path.exists(udc_dir):
                udcs = os.listdir(udc_dir)
                if udcs:
                    udc = udcs[0]
            
            if not udc:
                logger.error("No USB Device Controller found")
                return False
            
            # Bind the gadget to the UDC
            with open(os.path.join(self.config.USB_GADGET_PATH, "UDC"), "w") as f:
                f.write(udc)
            
            logger.info(f"USB gadget enabled on UDC: {udc}")
            return True
            
        except Exception as e:
            logger.error(f"Error enabling USB gadget: {e}")
            return False
    
    async def _disable_gadget(self):
        """Disable the USB gadget by unbinding it from the UDC"""
        try:
            # Unbind the gadget from the UDC
            with open(os.path.join(self.config.USB_GADGET_PATH, "UDC"), "w") as f:
                f.write("")
            
            logger.info("USB gadget disabled")
            return True
            
        except Exception as e:
            logger.error(f"Error disabling USB gadget: {e}")
            return False
    
    async def _open_devices(self):
        """Open the USB gadget devices for writing"""
        try:
            # Wait for the devices to be created
            max_retries = 10
            for retry in range(max_retries):
                # Check for video device
                video_found = False
                for i in range(10):  # Try a few device numbers
                    video_path = f"/dev/video{i}"
                    if os.path.exists(video_path):
                        try:
                            self.video_device = open(video_path, "wb")
                            # Try to get device info to confirm it's our UVC gadget
                            fd = self.video_device.fileno()
                            try:
                                cap = v4l2.v4l2_capability()
                                fcntl.ioctl(fd, v4l2.VIDIOC_QUERYCAP, cap)
                                if cap.card.decode().startswith(self.config.UVC_DEVICE_NAME):
                                    video_found = True
                                    logger.info(f"Opened USB video device: {video_path}")
                                    break
                            except:
                                # Not our device, try another
                                self.video_device.close()
                                self.video_device = None
                        except Exception:
                            continue
                
                # Check for audio device (PCM)
                audio_found = False
                if self.config.AUDIO_ENABLED:
                    for i in range(10):  # Try a few device numbers
                        audio_path = f"/dev/snd/pcmC{i}D0p"
                        if os.path.exists(audio_path):
                            try:
                                self.audio_device = open(audio_path, "wb")
                                audio_found = True
                                logger.info(f"Opened USB audio device: {audio_path}")
                                break
                            except Exception:
                                continue
                else:
                    # Audio not enabled, so mark it as found
                    audio_found = True
                
                if video_found and audio_found:
                    return True
                
                # Devices not found yet, wait and retry
                logger.info(f"Waiting for USB devices to be created (retry {retry+1}/{max_retries})")
                await asyncio.sleep(1)
            
            # Failed to find the devices after max retries
            logger.error("Failed to find USB devices after multiple retries")
            return False
            
        except Exception as e:
            logger.error(f"Error opening USB devices: {e}")
            return False
    
    async def write_video_frame(self, frame_data):
        """Write a video frame to the USB gadget device"""
        if not self.running or not self.video_device:
            return False
        
        try:
            self.video_device.write(frame_data)
            self.video_device.flush()
            return True
        except Exception as e:
            logger.error(f"Error writing video frame: {e}")
            return False
    
    async def write_audio_sample(self, audio_data):
        """Write audio data to the USB gadget device"""
        if not self.running or not self.audio_device or not self.config.AUDIO_ENABLED:
            return False
        
        try:
            self.audio_device.write(audio_data)
            self.audio_device.flush()
            return True
        except Exception as e:
            logger.error(f"Error writing audio sample: {e}")
            return False
    
    def get_status(self):
        """Get the status of the USB gadget"""
        return {
            "running": self.running,
            "video_device": self.video_device is not None,
            "audio_device": self.audio_device is not None,
            "gadget_configured": self.gadget_configured
        }