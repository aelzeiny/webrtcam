# WebRTCam Installation Guide

This guide will walk you through the process of setting up WebRTCam on your Raspberry Pi.

## Requirements

- Raspberry Pi 4 (or newer) with Raspberry Pi OS (64-bit recommended)
- Internet connection for downloading packages
- USB-C cable for connecting to the host computer
- 16GB+ microSD card with Raspberry Pi OS installed

## Step 1: Install System Dependencies

Before installing WebRTCam, you'll need to install some system dependencies:

```bash
# Update system packages
sudo apt update
sudo apt upgrade -y

# Install required system packages
sudo apt install -y python3-pip python3-dev git libavdevice-dev libavfilter-dev \
libavformat-dev libavcodec-dev libswresample-dev libswscale-dev libavutil-dev \
libopus-dev libvpx-dev pkg-config libsrtp2-dev ffmpeg v4l-utils

# Install kernel modules for USB gadget functionality
sudo apt install -y linux-modules-extra-raspi
```

## Step 2: Clone the WebRTCam Repository

```bash
# Clone the repository
git clone https://github.com/yourusername/webrtcam.git /tmp/webrtcam

# Create installation directory
sudo mkdir -p /opt/webrtcam

# Copy files to installation directory
sudo cp -r /tmp/webrtcam/* /opt/webrtcam/
sudo chmod +x /opt/webrtcam/scripts/*.sh
```

## Step 3: Install Python Dependencies

```bash
# Install Python dependencies
cd /opt/webrtcam
sudo pip3 install -r requirements.txt

# Optional: Create a virtual environment
# sudo pip3 install virtualenv
# virtualenv venv
# source venv/bin/activate
# pip install -r requirements.txt
```

## Step 4: Configure USB Gadget Mode

The USB gadget mode is what allows your Raspberry Pi to appear as a USB webcam and microphone to the host computer.

```bash
# Run the USB gadget setup script
sudo /opt/webrtcam/scripts/setup_usb_gadget.sh
```

This script will:
1. Load necessary kernel modules
2. Configure the Raspberry Pi as a USB gadget
3. Set up the UVC (video) and UAC (audio) functions
4. Make the setup persistent across reboots

**Note:** The script will add the `dtoverlay=dwc2` line to `/boot/config.txt` and will add required modules to `/etc/modules`. A reboot is required for these changes to take effect.

## Step 5: Configure the Service

Set up WebRTCam to start automatically on boot:

```bash
# Install the systemd service
sudo cp /opt/webrtcam/scripts/webrtcam.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable webrtcam.service
```

## Step 6: Reboot and Test

Reboot your Raspberry Pi to apply all changes:

```bash
sudo reboot
```

After rebooting:

1. Connect your Raspberry Pi to your host computer using a USB-C cable
2. The host computer should recognize a new webcam and microphone
3. Access the WebRTC interface by visiting `http://raspberrypi.local:8080` from any device on the same network
4. Grant camera and microphone permissions in your browser
5. Start streaming - the video/audio should appear on the host computer as webcam input

## Troubleshooting

### USB Gadget Issues

If the host computer doesn't recognize the Raspberry Pi as a webcam:

1. Verify that the gadget is set up correctly:
   ```bash
   ls /sys/kernel/config/usb_gadget/
   ```

2. Check for USB device controller:
   ```bash
   ls /sys/class/udc
   ```

3. Verify the modules are loaded:
   ```bash
   lsmod | grep -E 'usb_f_uvc|usb_f_uac|libcomposite'
   ```

### WebRTC Connection Issues

If you can't connect to the WebRTC interface:

1. Check if the service is running:
   ```bash
   sudo systemctl status webrtcam
   ```

2. Check the logs for errors:
   ```bash
   sudo journalctl -u webrtcam -f
   ```

3. Verify network connectivity:
   ```bash
   ping raspberrypi.local
   ```

4. Check firewall settings:
   ```bash
   sudo iptables -L
   ```

## Advanced Configuration

You can customize the WebRTCam behavior by editing the configuration file:

```bash
sudo nano /opt/webrtcam/config.py
```

After making changes, restart the service:

```bash
sudo systemctl restart webrtcam
```

## Security Considerations

By default, WebRTCam does not include authentication. For production use, consider:

1. Enabling HTTPS with a self-signed certificate
2. Adding basic authentication to the web interface
3. Restricting access using a firewall

## Uninstallation

To remove WebRTCam:

```bash
# Stop and disable the service
sudo systemctl stop webrtcam
sudo systemctl disable webrtcam
sudo rm /etc/systemd/system/webrtcam.service

# Remove the installed files
sudo rm -rf /opt/webrtcam

# Revert USB gadget configuration
sudo sed -i '/dtoverlay=dwc2/d' /boot/config.txt
sudo sed -i '/libcomposite/d' /etc/modules
```