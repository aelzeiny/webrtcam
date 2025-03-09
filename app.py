#!/usr/bin/env python3
"""
WebRTCam - Main Application
Handles web server, WebRTC connections, and media pipeline.
"""

import asyncio
import logging
import os
import argparse
from aiohttp import web
import json

from modules.webrtc import WebRTCServer
from modules.usb_gadget import USBGadget
from modules.media_pipeline import MediaPipeline
from utils.logging import setup_logging
from config import Config

# Set up logging
logger = setup_logging()

class WebRTCamApp:
    def __init__(self, config):
        self.config = config
        self.usb_gadget = USBGadget(config)
        self.media_pipeline = MediaPipeline(config)
        self.webrtc_server = WebRTCServer(config, self.media_pipeline)
        self.app = web.Application()
        self._setup_routes()

    def _setup_routes(self):
        # Static files
        self.app.router.add_static('/static', os.path.join(os.path.dirname(__file__), 'static'))
        # Main page
        self.app.router.add_get('/', self._handle_index)
        # WebRTC signaling
        self.app.router.add_post('/offer', self._handle_offer)
        # Status endpoint
        self.app.router.add_get('/status', self._handle_status)

    async def _handle_index(self, request):
        """Serve the main page"""
        with open(os.path.join(os.path.dirname(__file__), 'static', 'index.html'), 'r') as f:
            content = f.read()
        return web.Response(text=content, content_type='text/html')

    async def _handle_offer(self, request):
        """Handle WebRTC offer from client"""
        try:
            params = await request.json()
            offer = params.get("sdp")
            
            if not offer:
                return web.Response(
                    status=400,
                    text=json.dumps({"error": "SDP offer is required"}),
                    content_type='application/json'
                )
                
            answer = await self.webrtc_server.handle_offer(offer)
            
            return web.Response(
                text=json.dumps({"sdp": answer}),
                content_type='application/json'
            )
        except Exception as e:
            logger.error(f"Error handling offer: {e}")
            return web.Response(
                status=500,
                text=json.dumps({"error": str(e)}),
                content_type='application/json'
            )

    async def _handle_status(self, request):
        """Return system status"""
        status = {
            "webrtc": self.webrtc_server.get_status(),
            "usb_gadget": self.usb_gadget.get_status(),
            "media_pipeline": self.media_pipeline.get_status(),
        }
        return web.Response(
            text=json.dumps(status),
            content_type='application/json'
        )

    async def start(self):
        """Start all components and web server"""
        await self.usb_gadget.start()
        await self.media_pipeline.start()
        await self.webrtc_server.start()
        
        runner = web.AppRunner(self.app)
        await runner.setup()
        site = web.TCPSite(runner, self.config.WEB_HOST, self.config.WEB_PORT)
        await site.start()
        
        logger.info(f"WebRTCam server running at http://{self.config.WEB_HOST}:{self.config.WEB_PORT}")
        
        # Keep the server running
        while True:
            await asyncio.sleep(3600)  # Sleep for an hour, but will be interrupted on shutdown

    async def stop(self):
        """Stop all components gracefully"""
        await self.webrtc_server.stop()
        await self.media_pipeline.stop()
        await self.usb_gadget.stop()


def parse_args():
    parser = argparse.ArgumentParser(description="WebRTCam - WebRTC to USB Webcam Bridge")
    parser.add_argument("--config", type=str, help="Path to configuration file")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    return parser.parse_args()


async def main():
    args = parse_args()
    config = Config()
    
    if args.config:
        config.load_from_file(args.config)
    
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    app = WebRTCamApp(config)
    
    try:
        await app.start()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        await app.stop()


if __name__ == "__main__":
    asyncio.run(main())