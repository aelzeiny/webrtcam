// WebRTCam - WebRTC Client Script
// Handles WebRTC connections to the server

// Global variables
let peerConnection = null;
let localStream = null;
let localVideo = null;
let intervalId = null;
let statsIntervalId = null;
let serverStatusIntervalId = null;

// HTML Elements
let startButton = null;
let stopButton = null;
let videoSource = null;
let audioSource = null;
let videoResolution = null;
let videoFrameRate = null;
let connectionStatus = null;
let statusText = null;

// Connection state elements
let connStatus = null;
let resolution = null;
let framerate = null;
let bitrate = null;
let audioStatus = null;
let serverStatus = null;

// Media constraints
const defaultConstraints = {
    video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
    },
    audio: true
};

// WebRTC configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
    // Get HTML elements
    localVideo = document.getElementById('localVideo');
    startButton = document.getElementById('startButton');
    stopButton = document.getElementById('stopButton');
    videoSource = document.getElementById('videoSource');
    audioSource = document.getElementById('audioSource');
    videoResolution = document.getElementById('videoResolution');
    videoFrameRate = document.getElementById('videoFrameRate');
    connectionStatus = document.getElementById('connectionStatus');
    statusText = document.getElementById('statusText');
    
    // Connection state elements
    connStatus = document.getElementById('connStatus');
    resolution = document.getElementById('resolution');
    framerate = document.getElementById('framerate');
    bitrate = document.getElementById('bitrate');
    audioStatus = document.getElementById('audioStatus');
    serverStatus = document.getElementById('serverStatus');
    
    // Add event listeners
    startButton.addEventListener('click', startStreaming);
    stopButton.addEventListener('click', stopStreaming);
    
    // Enumerate devices and populate dropdowns
    await enumerateDevices();
    
    // Add change event listeners for settings
    videoSource.addEventListener('change', updateMediaConstraints);
    audioSource.addEventListener('change', updateMediaConstraints);
    videoResolution.addEventListener('change', updateMediaConstraints);
    videoFrameRate.addEventListener('change', updateMediaConstraints);
    
    // Start server status check
    checkServerStatus();
    serverStatusIntervalId = setInterval(checkServerStatus, 5000);
    
    // Set initial UI state
    updateUIState('disconnected');
}

// Enumerate available media devices
async function enumerateDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // Clear existing options
        videoSource.innerHTML = '';
        audioSource.innerHTML = '';
        
        // Add video devices
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        videoDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Camera ${videoSource.length + 1}`;
            videoSource.appendChild(option);
        });
        
        // Add audio devices
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        audioDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Microphone ${audioSource.length + 1}`;
            audioSource.appendChild(option);
        });
        
        // If no devices found, ask for permissions to see labels
        if (videoDevices.length === 0 || audioDevices.length === 0) {
            await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            // Try enumerating again to get device labels
            await enumerateDevices();
        }
    } catch (error) {
        console.error('Error enumerating devices:', error);
    }
}

// Update media constraints based on selected settings
function getMediaConstraints() {
    // Parse resolution
    const [width, height] = videoResolution.value.split('x').map(Number);
    
    // Parse framerate
    const frameRate = Number(videoFrameRate.value);
    
    // Create constraints object
    const constraints = {
        video: {
            deviceId: videoSource.value ? { exact: videoSource.value } : undefined,
            width: { ideal: width },
            height: { ideal: height },
            frameRate: { ideal: frameRate }
        },
        audio: {
            deviceId: audioSource.value ? { exact: audioSource.value } : undefined
        }
    };
    
    return constraints;
}

// Update media stream with new constraints
async function updateMediaConstraints() {
    if (localStream) {
        // Stop current stream
        localStream.getTracks().forEach(track => track.stop());
        
        try {
            // Get new stream with updated constraints
            localStream = await navigator.mediaDevices.getUserMedia(getMediaConstraints());
            
            // Update video element
            localVideo.srcObject = localStream;
            
            // Update peer connection if active
            if (peerConnection) {
                const senders = peerConnection.getSenders();
                
                // Replace tracks in the peer connection
                localStream.getTracks().forEach(track => {
                    const sender = senders.find(s => s.track && s.track.kind === track.kind);
                    if (sender) {
                        sender.replaceTrack(track);
                    }
                });
            }
        } catch (error) {
            console.error('Error updating media constraints:', error);
        }
    }
}

// Start WebRTC streaming
async function startStreaming() {
    try {
        // Update UI state
        updateUIState('connecting');
        
        // Get media stream
        localStream = await navigator.mediaDevices.getUserMedia(getMediaConstraints());
        localVideo.srcObject = localStream;
        
        // Create peer connection
        peerConnection = new RTCPeerConnection(configuration);
        
        // Add event listeners
        peerConnection.addEventListener('iceconnectionstatechange', handleICEConnectionStateChange);
        peerConnection.addEventListener('connectionstatechange', handleConnectionStateChange);
        
        // Add local stream tracks to the peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Create offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Send offer to server
        const response = await fetch('/offer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sdp: peerConnection.localDescription.sdp
            })
        });
        
        // Handle response
        const jsonResponse = await response.json();
        
        if (response.ok) {
            // Set remote description from answer
            const remoteDesc = new RTCSessionDescription({
                type: 'answer',
                sdp: jsonResponse.sdp
            });
            
            await peerConnection.setRemoteDescription(remoteDesc);
            
            // Start stats interval
            startStatsInterval();
            
        } else {
            console.error('Error sending offer:', jsonResponse.error);
            updateUIState('disconnected');
            stopStreaming();
        }
    } catch (error) {
        console.error('Error starting streaming:', error);
        updateUIState('disconnected');
        stopStreaming();
    }
}

// Stop WebRTC streaming
function stopStreaming() {
    // Stop stats interval
    if (statsIntervalId) {
        clearInterval(statsIntervalId);
        statsIntervalId = null;
    }
    
    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Stop local stream
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Clear video
    if (localVideo.srcObject) {
        localVideo.srcObject = null;
    }
    
    // Update UI state
    updateUIState('disconnected');
}

// Handle ICE connection state changes
function handleICEConnectionStateChange() {
    if (!peerConnection) return;
    
    console.log('ICE connection state:', peerConnection.iceConnectionState);
    
    switch (peerConnection.iceConnectionState) {
        case 'connected':
        case 'completed':
            updateUIState('connected');
            break;
            
        case 'failed':
        case 'disconnected':
        case 'closed':
            updateUIState('disconnected');
            break;
            
        case 'checking':
            updateUIState('connecting');
            break;
    }
}

// Handle connection state changes
function handleConnectionStateChange() {
    if (!peerConnection) return;
    
    console.log('Connection state:', peerConnection.connectionState);
    
    switch (peerConnection.connectionState) {
        case 'connected':
            updateUIState('connected');
            break;
            
        case 'failed':
        case 'disconnected':
        case 'closed':
            updateUIState('disconnected');
            if (peerConnection.connectionState === 'failed') {
                stopStreaming();
            }
            break;
            
        case 'connecting':
            updateUIState('connecting');
            break;
    }
}

// Update UI based on connection state
function updateUIState(state) {
    switch (state) {
        case 'connected':
            startButton.disabled = true;
            stopButton.disabled = false;
            connectionStatus.className = 'status-indicator connected';
            statusText.textContent = 'Connected';
            connStatus.textContent = 'Connected';
            break;
            
        case 'connecting':
            startButton.disabled = true;
            stopButton.disabled = false;
            connectionStatus.className = 'status-indicator connecting';
            statusText.textContent = 'Connecting...';
            connStatus.textContent = 'Connecting...';
            break;
            
        case 'disconnected':
            startButton.disabled = false;
            stopButton.disabled = true;
            connectionStatus.className = 'status-indicator disconnected';
            statusText.textContent = 'Disconnected';
            connStatus.textContent = 'Disconnected';
            resolution.textContent = '-';
            framerate.textContent = '-';
            bitrate.textContent = '-';
            audioStatus.textContent = '-';
            break;
    }
}

// Start collecting and displaying WebRTC stats
function startStatsInterval() {
    if (statsIntervalId) {
        clearInterval(statsIntervalId);
    }
    
    let lastBytesSent = 0;
    let lastTimestamp = 0;
    
    statsIntervalId = setInterval(async () => {
        if (!peerConnection) return;
        
        try {
            const stats = await peerConnection.getStats();
            
            stats.forEach(report => {
                if (report.type === 'outbound-rtp' && report.kind === 'video') {
                    // Resolution
                    if (report.frameWidth && report.frameHeight) {
                        resolution.textContent = `${report.frameWidth}x${report.frameHeight}`;
                    }
                    
                    // Framerate
                    if (report.framesPerSecond) {
                        framerate.textContent = `${Math.round(report.framesPerSecond)} fps`;
                    }
                    
                    // Bitrate calculation
                    if (report.bytesSent && report.timestamp) {
                        if (lastBytesSent && lastTimestamp) {
                            const bytesSent = report.bytesSent - lastBytesSent;
                            const timeDiff = (report.timestamp - lastTimestamp) / 1000; // in seconds
                            
                            if (timeDiff > 0) {
                                const kbps = Math.round((bytesSent * 8) / timeDiff / 1000);
                                bitrate.textContent = `${kbps} kbps`;
                            }
                        }
                        
                        lastBytesSent = report.bytesSent;
                        lastTimestamp = report.timestamp;
                    }
                } else if (report.type === 'outbound-rtp' && report.kind === 'audio') {
                    audioStatus.textContent = 'Active';
                }
            });
        } catch (error) {
            console.error('Error getting stats:', error);
        }
    }, 1000);
}

// Check server status
async function checkServerStatus() {
    try {
        const response = await fetch('/status', { method: 'GET' });
        
        if (response.ok) {
            const status = await response.json();
            serverStatus.textContent = 'Online';
            
            // Additional server status info could be displayed here
        } else {
            serverStatus.textContent = 'Error';
        }
    } catch (error) {
        console.error('Error checking server status:', error);
        serverStatus.textContent = 'Offline';
    }
}