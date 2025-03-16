const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const wrtc = require('wrtc');

class MediaRecorder {
  constructor(options = {}) {
    this.options = {
      outputDir: path.join(__dirname, 'recordings'),
      ffmpegPath: 'ffmpeg',
      maxFileSizeMB: 1024, // 1GB
      segmentDuration: 60 * 10, // 10 minutes segments
      ...options
    };
    
    this.activeRecordings = new Map();
    fs.ensureDirSync(this.options.outputDir);
    
    console.log(`Media recorder initialized with output dir: ${this.options.outputDir}`);
  }
  
  /**
   * Start recording a consumer
   * @param {object} consumer - MediaSoup consumer
   * @param {string} roomId - Room ID for the recording
   * @param {string} producerId - Producer ID related to this consumer
   * @returns {string} - Recording ID
   */
  startRecording(consumer, roomId, producerId) {
    try {
      if (!consumer || !consumer.track) {
        throw new Error('Invalid consumer or missing track');
      }
      
      const recordingId = `${roomId}-${producerId}-${Date.now()}`;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputFile = path.join(this.options.outputDir, `recording-${timestamp}.webm`);
      
      console.log(`Starting recording ${recordingId} to ${outputFile}`);
      
      // Create a MediaStream with the track
      const mediaStream = new wrtc.MediaStream();
      mediaStream.addTrack(consumer.track);
      
      // This is where we'd normally connect the MediaStream to ffmpeg
      // In a complete implementation, you would:
      // 1. Set up a peer connection with RTCPeerConnection
      // 2. Add the track from the consumer to it
      // 3. Create a data channel or use RTP to get the raw media data
      // 4. Pipe that to ffmpeg
      
      // For now, we'll simulate the recording with ffmpeg
      const ffmpegArgs = [
        '-y', // Overwrite output files without asking
        '-f', 'lavfi', // Use libavfilter virtual input
        '-i', 'anullsrc=r=48000:cl=stereo', // Null audio source
        '-f', 'lavfi',
        '-i', 'testsrc=size=1280x720:rate=30', // Test video source since we can't directly pipe the WebRTC stream
        '-c:v', 'libvpx',
        '-c:a', 'libopus',
        '-b:v', '1M',
        '-t', `${this.options.segmentDuration}`,
        outputFile
      ];
      
      const ffmpegProcess = spawn(this.options.ffmpegPath, ffmpegArgs);
      
      ffmpegProcess.stdout.on('data', (data) => {
        console.log(`[Recording ${recordingId}] ffmpeg: ${data}`);
      });
      
      ffmpegProcess.stderr.on('data', (data) => {
        console.error(`[Recording ${recordingId}] ffmpeg error: ${data}`);
      });
      
      ffmpegProcess.on('close', (code) => {
        console.log(`[Recording ${recordingId}] ffmpeg process exited with code ${code}`);
        this.activeRecordings.delete(recordingId);
      });
      
      const recordingInfo = {
        id: recordingId,
        consumer,
        roomId,
        producerId,
        outputFile,
        process: ffmpegProcess,
        startTime: Date.now(),
        mediaStream
      };
      
      this.activeRecordings.set(recordingId, recordingInfo);
      
      // Set up a timer to check file size
      const checkSizeInterval = setInterval(() => {
        if (!this.activeRecordings.has(recordingId)) {
          clearInterval(checkSizeInterval);
          return;
        }
        
        try {
          const stats = fs.statSync(outputFile);
          const fileSizeMB = stats.size / (1024 * 1024);
          
          if (fileSizeMB >= this.options.maxFileSizeMB) {
            console.log(`[Recording ${recordingId}] File size limit reached (${fileSizeMB.toFixed(2)}MB). Rotating file.`);
            this.rotateRecording(recordingId);
          }
        } catch (error) {
          // File might not exist yet
          console.log(`[Recording ${recordingId}] Error checking file size: ${error.message}`);
        }
      }, 10000); // Check every 10 seconds
      
      return recordingId;
    } catch (error) {
      console.error('Error starting recording:', error);
      return null;
    }
  }
  
  /**
   * Rotate a recording (stop current file and start a new one)
   * @param {string} recordingId - ID of the recording to rotate
   * @returns {boolean} - Success status
   */
  rotateRecording(recordingId) {
    try {
      if (!this.activeRecordings.has(recordingId)) {
        console.log(`Recording ${recordingId} not found for rotation`);
        return false;
      }
      
      const recording = this.activeRecordings.get(recordingId);
      
      // Stop current process
      if (recording.process) {
        recording.process.kill('SIGTERM');
      }
      
      // Start a new recording with the same consumer
      this.startRecording(recording.consumer, recording.roomId, recording.producerId);
      
      return true;
    } catch (error) {
      console.error(`Error rotating recording ${recordingId}:`, error);
      return false;
    }
  }
  
  /**
   * Stop a specific recording
   * @param {string} recordingId - ID of the recording to stop
   * @returns {boolean} - Success status
   */
  stopRecording(recordingId) {
    try {
      if (!this.activeRecordings.has(recordingId)) {
        console.log(`Recording ${recordingId} not found`);
        return false;
      }
      
      const recording = this.activeRecordings.get(recordingId);
      
      if (recording.process) {
        recording.process.kill('SIGTERM');
      }
      
      this.activeRecordings.delete(recordingId);
      console.log(`Recording ${recordingId} stopped`);
      
      return true;
    } catch (error) {
      console.error(`Error stopping recording ${recordingId}:`, error);
      return false;
    }
  }
  
  /**
   * Stop all active recordings
   */
  stopAllRecordings() {
    for (const recordingId of this.activeRecordings.keys()) {
      this.stopRecording(recordingId);
    }
    console.log('All recordings stopped');
  }
  
  /**
   * Get information about active recordings
   * @returns {Array} - List of active recordings info
   */
  getActiveRecordings() {
    const recordings = [];
    
    for (const [id, recording] of this.activeRecordings.entries()) {
      recordings.push({
        id,
        roomId: recording.roomId,
        producerId: recording.producerId,
        outputFile: recording.outputFile,
        startTime: recording.startTime,
        durationSeconds: Math.floor((Date.now() - recording.startTime) / 1000)
      });
    }
    
    return recordings;
  }
}

module.exports = MediaRecorder;