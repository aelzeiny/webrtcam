#!/bin/bash
#
# WebRTCam - USB Gadget Setup Script for Raspberry Pi 4
# Sets up the Raspberry Pi as a USB gadget with UVC (video) and UAC (audio) functions
#

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
    echo "This script must be run as root" >&2
    exit 1
fi

# Check if we're on a Raspberry Pi 4
if ! grep -q "Raspberry Pi 4" /proc/device-tree/model 2>/dev/null; then
    echo "This script is designed for Raspberry Pi 4 only" >&2
    echo "Current device: $(cat /proc/device-tree/model 2>/dev/null || echo "Unknown")" >&2
    exit 1
fi

# Variables for USB gadget configuration
CONFIGFS="/sys/kernel/config"
GADGET="$CONFIGFS/usb_gadget/webrtcam"
VID="0x1d6b"      # Linux Foundation
PID="0x0104"      # Multifunction Composite Gadget
SERIAL="$(cat /proc/cpuinfo | grep Serial | cut -d ' ' -f 2 | tail -c 9)"
MANUF="WebRTCam Project"
PRODUCT="WebRTC Virtual Camera"
UDC=$(ls /sys/class/udc | head -n1) # Identifies the first UDC

# Function to check if a module is loaded
module_loaded() {
    lsmod | grep -q "^$1 "
    return $?
}

echo "WebRTCam - USB Gadget Setup for Raspberry Pi 4"
echo "=============================================="

# Load required kernel modules
echo "Loading required kernel modules..."
MODULES=("libcomposite" "usb_f_uvc" "usb_f_uac2")

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
if [ -d "$GADGET" ]; then
    echo "Removing existing gadget..."
    
    # Unbind first
    if [ -e "$GADGET/UDC" ]; then
        echo "" > "$GADGET/UDC" 2>/dev/null || true
    fi
    
    # Remove existing functions
    find "$GADGET/configs/c.1/" -type l -exec rm -f {} \; 2>/dev/null || true
    
    # Remove all directories in reversed order
    rmdir "$GADGET/configs/c.1/strings/0x409" 2>/dev/null || true
    rmdir "$GADGET/configs/c.1" 2>/dev/null || true
    rm -rf "$GADGET/functions/uvc.0" 2>/dev/null || true
    rm -rf "$GADGET/functions/uac2.0" 2>/dev/null || true
    rmdir "$GADGET/strings/0x409" 2>/dev/null || true
    rmdir "$GADGET" 2>/dev/null || true
fi

echo "Creating USB gadget..."

# Create gadget directory
mkdir -p "$GADGET"

# Set USB specifications
echo "$VID" > "$GADGET/idVendor"
echo "$PID" > "$GADGET/idProduct"
echo "0x0200" > "$GADGET/bcdUSB"      # USB 2.0
echo "0x0100" > "$GADGET/bcdDevice"   # v1.0.0

# Set device class, subclass, protocol (communications device)
echo "0xEF" > "$GADGET/bDeviceClass"
echo "0x02" > "$GADGET/bDeviceSubClass"
echo "0x01" > "$GADGET/bDeviceProtocol"

# Create English (US) strings
mkdir -p "$GADGET/strings/0x409"
echo "$SERIAL" > "$GADGET/strings/0x409/serialnumber"
echo "$MANUF" > "$GADGET/strings/0x409/manufacturer"
echo "$PRODUCT" > "$GADGET/strings/0x409/product"

# Create configuration
mkdir -p "$GADGET/configs/c.1"
echo "500" > "$GADGET/configs/c.1/MaxPower" # 500mA power
mkdir -p "$GADGET/configs/c.1/strings/0x409"
echo "WebRTCam Configuration" > "$GADGET/configs/c.1/strings/0x409/configuration"

# Create UVC function (Video)
echo "Setting up UVC function..."

# Create UVC video function directories
mkdir -p "$GADGET/functions/uvc.0/streaming/header/h"
mkdir -p "$GADGET/functions/uvc.0/streaming/uncompressed/u"
mkdir -p "$GADGET/functions/uvc.0/streaming/mjpeg/m"
mkdir -p "$GADGET/functions/uvc.0/streaming/class/fs"
mkdir -p "$GADGET/functions/uvc.0/streaming/class/hs"
mkdir -p "$GADGET/functions/uvc.0/streaming/class/ss"
mkdir -p "$GADGET/functions/uvc.0/control/header/h"
mkdir -p "$GADGET/functions/uvc.0/control/class/fs"
mkdir -p "$GADGET/functions/uvc.0/control/class/ss"

# Function to create frame descriptors for a specific format
create_frame() {
    # Parameters: <format_dir> <width> <height> <frame_intervals>
    FORMAT_DIR="$GADGET/$1"
    WIDTH=$2
    HEIGHT=$3
    INTERVALS=$4
    
    mkdir -p "$FORMAT_DIR/${HEIGHT}p"
    echo "$WIDTH" > "$FORMAT_DIR/${HEIGHT}p/wWidth"
    echo "$HEIGHT" > "$FORMAT_DIR/${HEIGHT}p/wHeight"
    echo $(( WIDTH * HEIGHT * 2 )) > "$FORMAT_DIR/${HEIGHT}p/dwMaxVideoFrameBufferSize"
    echo -e "$INTERVALS" > "$FORMAT_DIR/${HEIGHT}p/dwFrameInterval"
}

# Create uncompressed video format frames (YUY2)
# 640x480 @ various frame rates (333333 = 30fps, 666666 = 15fps, etc. in 100ns units)
create_frame "functions/uvc.0/streaming/uncompressed/u" 640 480 "333333\n500000\n666666\n1000000"

# 1280x720 @ various frame rates
create_frame "functions/uvc.0/streaming/uncompressed/u" 1280 720 "333333\n500000\n666666\n1000000"

# 1920x1080 @ lower frame rates
create_frame "functions/uvc.0/streaming/uncompressed/u" 1920 1080 "666666\n1000000\n2000000"

# Create MJPEG video format frames
create_frame "functions/uvc.0/streaming/mjpeg/m" 640 480 "333333\n500000\n666666\n1000000"
create_frame "functions/uvc.0/streaming/mjpeg/m" 1280 720 "333333\n500000\n666666\n1000000"
create_frame "functions/uvc.0/streaming/mjpeg/m" 1920 1080 "333333\n500000\n666666\n1000000"

# Link formats to headers
ln -sf "../../uncompressed/u" "$GADGET/functions/uvc.0/streaming/header/h/u" 2>/dev/null || true
ln -sf "../../mjpeg/m" "$GADGET/functions/uvc.0/streaming/header/h/m" 2>/dev/null || true

# Link headers to classes
ln -sf "../../header/h" "$GADGET/functions/uvc.0/streaming/class/fs/h" 2>/dev/null || true
ln -sf "../../header/h" "$GADGET/functions/uvc.0/streaming/class/hs/h" 2>/dev/null || true
ln -sf "../../header/h" "$GADGET/functions/uvc.0/streaming/class/ss/h" 2>/dev/null || true

# Set up control interface
ln -sf "header/h" "$GADGET/functions/uvc.0/control/class/fs/h" 2>/dev/null || true
ln -sf "header/h" "$GADGET/functions/uvc.0/control/class/ss/h" 2>/dev/null || true

# Set streaming parameters for better performance
echo "3072" > "$GADGET/functions/uvc.0/streaming_maxpacket"
echo "1" > "$GADGET/functions/uvc.0/streaming_interval"

# Create UAC2 function (Audio)
echo "Setting up UAC2 function..."
mkdir -p "$GADGET/functions/uac2.0"
# Set audio parameters (48kHz, 16-bit, stereo)
echo 48000 > "$GADGET/functions/uac2.0/c_srate"
echo 2 > "$GADGET/functions/uac2.0/c_ssize"
echo 2 > "$GADGET/functions/uac2.0/c_chmask"
echo 48000 > "$GADGET/functions/uac2.0/p_srate"
echo 2 > "$GADGET/functions/uac2.0/p_ssize"
echo 1 > "$GADGET/functions/uac2.0/p_chmask"

# Link functions to configuration
ln -sf "$GADGET/functions/uvc.0" "$GADGET/configs/c.1/uvc.0" 2>/dev/null || true
ln -sf "$GADGET/functions/uac2.0" "$GADGET/configs/c.1/uac2.0" 2>/dev/null || true

# Check if UDC is available
if [ -z "$UDC" ]; then
    echo "WARNING: No UDC found. This is expected if dwc2,dr_mode=otg has not been activated yet."
    echo "The USB gadget will be configured but not activated until after reboot."
    SKIP_UDC_BINDING=1
else
    echo "Using UDC: $UDC"
    SKIP_UDC_BINDING=0
    # Enable the gadget
    echo "$UDC" > "$GADGET/UDC"
fi

echo "USB gadget setup complete!"
echo "The Raspberry Pi 4 should now appear as a USB camera and microphone when connected to a host computer."
echo "Device Name: $PRODUCT"
echo "Supported Resolutions: 640x480, 1280x720, 1920x1080"
echo "Audio: 48 kHz, 16-bit, stereo"

if [ "$SKIP_UDC_BINDING" -eq 1 ]; then
    echo ""
    echo "NOTE: UDC device not found. The USB gadget will be activated after reboot."
fi

# Make USB gadget setup persistent across reboots
echo "Setting up boot persistence..."

# Add dwc2 overlay with OTG mode to config.txt if needed
if ! grep -q "^dtoverlay=dwc2,dr_mode=otg" /boot/config.txt; then
    echo "Adding dwc2 overlay with OTG mode to /boot/config.txt..."
    # First remove any existing dwc2 overlay without dr_mode
    sed -i '/^dtoverlay=dwc2$/d' /boot/config.txt
    # Add the correct overlay with OTG mode
    echo "dtoverlay=dwc2,dr_mode=otg" >> /boot/config.txt
    echo "Added dwc2 overlay with OTG mode to /boot/config.txt"
fi

# Add modules to /etc/modules if needed
if ! grep -q "^libcomposite" /etc/modules; then
    echo "Adding required modules to /etc/modules..."
    echo "libcomposite" >> /etc/modules
    echo "Added libcomposite to /etc/modules"
fi

# Create systemd service file for USB gadget
cat > /etc/systemd/system/usb-gadget.service << EOF
[Unit]
Description=WebRTCam USB Gadget Setup
After=local-fs.target
DefaultDependencies=no

[Service]
Type=oneshot
ExecStart=/bin/sh -c "modprobe libcomposite && $(readlink -f $0)"
RemainAfterExit=yes

[Install]
WantedBy=sysinit.target
EOF

# Enable the service
systemctl daemon-reload
systemctl enable usb-gadget.service
echo "Created and enabled usb-gadget.service for automatic setup on boot"

# Copy this script to a system location
SCRIPT_PATH="/usr/local/bin/setup_usb_gadget.sh"
cp "$(readlink -f $0)" "$SCRIPT_PATH"
chmod +x "$SCRIPT_PATH"
echo "Installed script to $SCRIPT_PATH"

echo ""
echo "NOTE: For these changes to fully take effect, please reboot your Raspberry Pi:"
echo "  sudo reboot"
echo ""
echo "After rebooting, connect your Raspberry Pi to a host computer using the USB-C port."
echo "The host should recognize the Pi as a webcam and microphone device."