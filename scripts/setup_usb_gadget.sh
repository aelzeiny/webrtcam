#!/bin/bash
#
# WebRTCam - USB Gadget Setup Script
# Sets up the Raspberry Pi as a USB gadget with UVC (video) and UAC (audio) functions
#

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
    echo "This script must be run as root" >&2
    exit 1
fi

# Check if we're on a Raspberry Pi
if ! grep -q "Raspberry Pi" /proc/device-tree/model 2>/dev/null; then
    echo "This script is designed for Raspberry Pi" >&2
    echo "Current device: $(cat /proc/device-tree/model 2>/dev/null || echo "Unknown")" >&2
    exit 1
fi

# Location of ConfigFS USB gadget
GADGET_PATH="/sys/kernel/config/usb_gadget/webrtcam"

# Configuration values
VENDOR_ID="0x1d6b"     # Linux Foundation
PRODUCT_ID="0x0104"    # Multifunction Composite Gadget
MANUFACTURER="WebRTCam Project"
PRODUCT="WebRTC Virtual Camera"
SERIAL="00000000"

# Video settings
VIDEO_WIDTH=1280
VIDEO_HEIGHT=720
VIDEO_FPS=30
UVC_FUNCTION="uvc.0"
VIDEO_FORMAT="h264"  # h264, uncompressed, or mjpeg

# Audio settings
ENABLE_AUDIO=1
AUDIO_CHANNELS=1
AUDIO_SAMPLE_RATE=48000
AUDIO_BITS=16
UAC_FUNCTION="uac1.0"

# Function to check if a module is loaded
module_loaded() {
    lsmod | grep -q "^$1 "
    return $?
}

echo "WebRTCam - USB Gadget Setup"
echo "=========================="

# Check for required kernel modules
echo "Checking required kernel modules..."

# Load required modules if not already loaded
MODULES=("libcomposite" "usb_f_uvc" "usb_f_uac1")

for module in "${MODULES[@]}"; do
    if ! module_loaded "$module"; then
        echo "Loading module: $module"
        modprobe "$module" || { echo "Failed to load module: $module"; exit 1; }
    else
        echo "Module already loaded: $module"
    fi
done

# Mount ConfigFS if not already mounted
if ! mount | grep -q "^configfs on /sys/kernel/config"; then
    echo "Mounting ConfigFS..."
    mount -t configfs none /sys/kernel/config || { echo "Failed to mount ConfigFS"; exit 1; }
fi

# Remove existing gadget if present
if [ -d "$GADGET_PATH" ]; then
    echo "Removing existing gadget..."
    
    # Unbind first
    if [ -f "$GADGET_PATH/UDC" ]; then
        echo "" > "$GADGET_PATH/UDC"
    fi
    
    # Remove functions
    if [ -d "$GADGET_PATH/configs/c.1" ]; then
        if [ -L "$GADGET_PATH/configs/c.1/$UVC_FUNCTION" ]; then
            rm "$GADGET_PATH/configs/c.1/$UVC_FUNCTION"
        fi
        
        if [ -L "$GADGET_PATH/configs/c.1/$UAC_FUNCTION" ]; then
            rm "$GADGET_PATH/configs/c.1/$UAC_FUNCTION"
        fi
    fi
    
    # Remove gadget
    rmdir "$GADGET_PATH/configs/c.1/strings/0x409" 2>/dev/null
    rmdir "$GADGET_PATH/configs/c.1" 2>/dev/null
    rmdir "$GADGET_PATH/functions/$UVC_FUNCTION" 2>/dev/null
    rmdir "$GADGET_PATH/functions/$UAC_FUNCTION" 2>/dev/null
    rmdir "$GADGET_PATH/strings/0x409" 2>/dev/null
    rmdir "$GADGET_PATH" 2>/dev/null
fi

echo "Creating USB gadget..."

# Create gadget directory
mkdir -p "$GADGET_PATH"

# Set USB specification values
echo "$VENDOR_ID" > "$GADGET_PATH/idVendor"
echo "$PRODUCT_ID" > "$GADGET_PATH/idProduct"
echo "0x0100" > "$GADGET_PATH/bcdDevice" # v1.0.0
echo "0x0200" > "$GADGET_PATH/bcdUSB"    # USB 2.0

# Create English (0x409) strings
mkdir -p "$GADGET_PATH/strings/0x409"
echo "$MANUFACTURER" > "$GADGET_PATH/strings/0x409/manufacturer"
echo "$PRODUCT" > "$GADGET_PATH/strings/0x409/product"
echo "$SERIAL" > "$GADGET_PATH/strings/0x409/serialnumber"

# Create configuration
mkdir -p "$GADGET_PATH/configs/c.1"
echo "500" > "$GADGET_PATH/configs/c.1/MaxPower" # 500mA

# Create config strings
mkdir -p "$GADGET_PATH/configs/c.1/strings/0x409"
echo "WebRTCam Configuration" > "$GADGET_PATH/configs/c.1/strings/0x409/configuration"

# Create UVC (Video) function
echo "Setting up UVC function..."
mkdir -p "$GADGET_PATH/functions/$UVC_FUNCTION"

# Set up UVC formats
mkdir -p "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/header/h"
mkdir -p "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/uncompressed/u"
mkdir -p "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/mjpeg/m"
mkdir -p "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/h264/h"

if [ "$VIDEO_FORMAT" = "h264" ]; then
    # Set up H.264 format
    echo "Setting up H.264 video format..."
    
    frame_interval=$(( 10000000 / VIDEO_FPS )) # 100ns units
    
    echo "3333" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/h264/h/bFramePeriod"
    echo "1" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/h264/h/bmHints"
    echo "0" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/h264/h/bPictureType"
    echo "$VIDEO_WIDTH" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/h264/h/wWidth"
    echo "$VIDEO_HEIGHT" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/h264/h/wHeight"
    echo "$frame_interval" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/h264/h/dwDefaultFrameInterval"
    echo "10000000" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/h264/h/dwMaxBitRate"
    buffer_size=$(( VIDEO_WIDTH * VIDEO_HEIGHT * 3 )) # 3 bytes per pixel
    echo "$buffer_size" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/h264/h/dwMaxVideoFrameBufferSize"
    
    # Add frame descriptors
    mkdir -p "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/h264/h/framei"
    echo "$frame_interval" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/h264/h/framei/dwFrameInterval"
    
elif [ "$VIDEO_FORMAT" = "mjpeg" ]; then
    # Set up MJPEG format
    echo "Setting up MJPEG video format..."
    
    frame_interval=$(( 10000000 / VIDEO_FPS )) # 100ns units
    
    echo "3333" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/mjpeg/m/bFramePeriod"
    echo "1" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/mjpeg/m/bmHints"
    echo "$VIDEO_WIDTH" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/mjpeg/m/wWidth"
    echo "$VIDEO_HEIGHT" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/mjpeg/m/wHeight"
    echo "$frame_interval" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/mjpeg/m/dwDefaultFrameInterval"
    echo "50000000" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/mjpeg/m/dwMaxBitRate"
    buffer_size=$(( VIDEO_WIDTH * VIDEO_HEIGHT * 3 )) # 3 bytes per pixel
    echo "$buffer_size" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/mjpeg/m/dwMaxVideoFrameBufferSize"
    
    # Add frame descriptors
    mkdir -p "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/mjpeg/m/framei"
    echo "$frame_interval" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/mjpeg/m/framei/dwFrameInterval"
    
else
    # Set up uncompressed format (YUY2)
    echo "Setting up uncompressed video format (YUY2)..."
    
    frame_interval=$(( 10000000 / VIDEO_FPS )) # 100ns units
    
    echo "3333" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/uncompressed/u/bFramePeriod"
    echo "1" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/uncompressed/u/bmHints"
    echo "$VIDEO_WIDTH" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/uncompressed/u/wWidth"
    echo "$VIDEO_HEIGHT" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/uncompressed/u/wHeight"
    echo "YUYV" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/uncompressed/u/guidFormat"
    echo "16" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/uncompressed/u/bBitsPerPixel"
    echo "$frame_interval" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/uncompressed/u/dwDefaultFrameInterval"
    echo "10000000" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/uncompressed/u/dwMaxVideoFrameRate"
    echo "50000000" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/uncompressed/u/dwMaxBitRate"
    buffer_size=$(( VIDEO_WIDTH * VIDEO_HEIGHT * 2 )) # 2 bytes per pixel for YUY2
    echo "$buffer_size" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/uncompressed/u/dwMaxVideoFrameBufferSize"
    
    # Add frame descriptors
    mkdir -p "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/uncompressed/u/framei"
    echo "$frame_interval" > "$GADGET_PATH/functions/$UVC_FUNCTION/streaming/uncompressed/u/framei/dwFrameInterval"
fi

# Create UAC (Audio) function if enabled
if [ "$ENABLE_AUDIO" -eq 1 ]; then
    echo "Setting up UAC function..."
    mkdir -p "$GADGET_PATH/functions/$UAC_FUNCTION"
    
    # Set up audio format
    channel_mask=$(( 1 << (AUDIO_CHANNELS - 1) )) # 1 for mono, 3 for stereo
    echo "$channel_mask" > "$GADGET_PATH/functions/$UAC_FUNCTION/c_chmask"
    echo "$AUDIO_SAMPLE_RATE" > "$GADGET_PATH/functions/$UAC_FUNCTION/c_srate"
    
    # Set sample size based on bits
    if [ "$AUDIO_BITS" -eq 16 ]; then
        echo "2" > "$GADGET_PATH/functions/$UAC_FUNCTION/c_ssize"
    elif [ "$AUDIO_BITS" -eq 24 ]; then
        echo "3" > "$GADGET_PATH/functions/$UAC_FUNCTION/c_ssize"
    else
        echo "2" > "$GADGET_PATH/functions/$UAC_FUNCTION/c_ssize" # Default to 16-bit
    fi
    
    # Link the audio function to the configuration
    ln -s "$GADGET_PATH/functions/$UAC_FUNCTION" "$GADGET_PATH/configs/c.1/$UAC_FUNCTION"
fi

# Link the video function to the configuration
ln -s "$GADGET_PATH/functions/$UVC_FUNCTION" "$GADGET_PATH/configs/c.1/$UVC_FUNCTION"

# Find available UDC (USB Device Controller)
UDC=$(ls /sys/class/udc | head -n1)
if [ -z "$UDC" ]; then
    echo "No USB Device Controller found" >&2
    exit 1
fi

echo "Using UDC: $UDC"

# Enable the gadget
echo "$UDC" > "$GADGET_PATH/UDC"

echo "USB gadget setup complete!"
echo "The Raspberry Pi should now appear as a USB camera and microphone when connected to a host computer."
echo "Device Name: $PRODUCT"
echo "Resolution: ${VIDEO_WIDTH}x${VIDEO_HEIGHT} @ $VIDEO_FPS fps"
if [ "$ENABLE_AUDIO" -eq 1 ]; then
    echo "Audio: $AUDIO_CHANNELS channels @ $AUDIO_SAMPLE_RATE Hz ($AUDIO_BITS-bit)"
else
    echo "Audio: Disabled"
fi

# Add the USB gadget setup to rc.local for auto-start on boot
if ! grep -q "setup_usb_gadget.sh" /etc/rc.local; then
    echo "Adding USB gadget setup to /etc/rc.local for auto-start on boot..."
    
    # Backup the original rc.local
    cp /etc/rc.local /etc/rc.local.bak
    
    # Insert the script call before the 'exit 0' line
    sed -i '/^exit 0/i \
# Setup WebRTCam USB gadget\
/usr/local/bin/setup_usb_gadget.sh\
' /etc/rc.local
    
    # Copy the script to /usr/local/bin
    cp "$0" /usr/local/bin/setup_usb_gadget.sh
    chmod +x /usr/local/bin/setup_usb_gadget.sh
    
    echo "Setup script installed to /usr/local/bin/setup_usb_gadget.sh"
    echo "USB gadget will be automatically configured on boot"
fi

# Add dtoverlay to /boot/config.txt if needed (for Raspberry Pi Zero, 3A+, 4, etc.)
if ! grep -q "^dtoverlay=dwc2" /boot/config.txt; then
    echo "Adding dwc2 overlay to /boot/config.txt..."
    echo "dtoverlay=dwc2" >> /boot/config.txt
    echo "Overlay added. A reboot is required for changes to take effect."
fi

# Add required modules to /etc/modules if needed
if ! grep -q "^libcomposite" /etc/modules; then
    echo "Adding required modules to /etc/modules..."
    echo "libcomposite" >> /etc/modules
    echo "Modules added. A reboot is required for changes to take effect."
fi

echo ""
echo "NOTE: For these changes to fully take effect, please reboot your Raspberry Pi:"
echo "  sudo reboot"
echo ""
echo "After rebooting, connect your Raspberry Pi to a host computer using the USB port."
echo "The host should recognize the Pi as a webcam and microphone device."