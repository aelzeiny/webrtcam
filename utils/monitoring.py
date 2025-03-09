#!/usr/bin/env python3
"""
WebRTCam - Monitoring Utilities
Provides system monitoring and status information
"""

import os
import psutil
import logging
import time
import socket
import threading
from typing import Dict, Any

logger = logging.getLogger(__name__)

class SystemMonitor:
    def __init__(self, update_interval=5):
        """
        Initialize the system monitor
        
        Args:
            update_interval: How often to update stats (in seconds)
        """
        self.update_interval = update_interval
        self.running = False
        self.thread = None
        self.stats = {
            "cpu": 0.0,
            "memory": 0.0,
            "disk": 0.0,
            "temperature": 0.0,
            "uptime": 0,
            "network": {
                "bytes_sent": 0,
                "bytes_recv": 0,
                "packets_sent": 0,
                "packets_recv": 0,
            },
            "start_time": time.time(),
            "last_update": 0,
        }
    
    def start(self):
        """Start the monitoring thread"""
        if self.running:
            return
            
        self.running = True
        self.thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.thread.start()
        logger.info("System monitoring started")
    
    def stop(self):
        """Stop the monitoring thread"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=1.0)
            self.thread = None
        logger.info("System monitoring stopped")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get the current system stats"""
        stats = self.stats.copy()
        stats["uptime"] = int(time.time() - stats["start_time"])
        return stats
    
    def get_hostname(self) -> str:
        """Get the system hostname"""
        return socket.gethostname()
    
    def _monitor_loop(self):
        """Background thread to update system stats"""
        last_net_io = psutil.net_io_counters()
        
        while self.running:
            try:
                # Update CPU usage
                self.stats["cpu"] = psutil.cpu_percent()
                
                # Update memory usage
                memory = psutil.virtual_memory()
                self.stats["memory"] = memory.percent
                
                # Update disk usage
                disk = psutil.disk_usage("/")
                self.stats["disk"] = disk.percent
                
                # Update temperature (only works on Raspberry Pi)
                try:
                    if os.path.exists("/sys/class/thermal/thermal_zone0/temp"):
                        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
                            temp = float(f.read().strip()) / 1000.0
                            self.stats["temperature"] = temp
                except Exception:
                    pass
                
                # Update network stats
                net_io = psutil.net_io_counters()
                self.stats["network"] = {
                    "bytes_sent": net_io.bytes_sent,
                    "bytes_recv": net_io.bytes_recv,
                    "packets_sent": net_io.packets_sent,
                    "packets_recv": net_io.packets_recv,
                    "bytes_sent_delta": net_io.bytes_sent - last_net_io.bytes_sent,
                    "bytes_recv_delta": net_io.bytes_recv - last_net_io.bytes_recv,
                }
                last_net_io = net_io
                
                # Update timestamp
                self.stats["last_update"] = time.time()
                
            except Exception as e:
                logger.error(f"Error updating system stats: {e}")
            
            # Sleep until next update
            time.sleep(self.update_interval)
    
    def get_raspberry_pi_model(self) -> str:
        """Get the Raspberry Pi model information"""
        try:
            if os.path.exists("/proc/device-tree/model"):
                with open("/proc/device-tree/model", "r") as f:
                    return f.read().strip()
            return "Unknown"
        except Exception:
            return "Unknown"