#!/usr/bin/env python3
"""
WebRTCam - Logging Utilities
Configures logging for the application
"""

import logging
import os
import sys
from logging.handlers import RotatingFileHandler

def setup_logging(level=None, log_file=None, log_format=None):
    """
    Set up logging for the application
    
    Args:
        level: Log level as string (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_file: Path to the log file
        log_format: Format string for the log entries
        
    Returns:
        The configured logger
    """
    # Get configuration from the Config class if available
    try:
        from config import Config
        config = Config()
        level = level or config.LOG_LEVEL
        log_file = log_file or config.LOG_FILE
        log_format = log_format or config.LOG_FORMAT
    except (ImportError, AttributeError):
        # Default values if Config is not available
        level = level or "INFO"
        log_format = log_format or "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    # Map string log level to constants
    log_level = getattr(logging, level.upper() if isinstance(level, str) else "INFO")
    
    # Configure root logger
    logger = logging.getLogger()
    logger.setLevel(log_level)
    
    # Remove existing handlers
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Create console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_formatter = logging.Formatter(log_format)
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)
    
    # Create file handler if log file is specified
    if log_file:
        try:
            # Create the directory if it doesn't exist
            log_dir = os.path.dirname(log_file)
            if log_dir and not os.path.exists(log_dir):
                os.makedirs(log_dir, exist_ok=True)
                
            # Create a rotating file handler (10 MB max, keep 5 backups)
            file_handler = RotatingFileHandler(
                log_file, maxBytes=10*1024*1024, backupCount=5
            )
            file_handler.setLevel(log_level)
            file_formatter = logging.Formatter(log_format)
            file_handler.setFormatter(file_formatter)
            logger.addHandler(file_handler)
        except (IOError, PermissionError) as e:
            logger.warning(f"Could not set up log file at {log_file}: {e}")
            logger.warning("Continuing with console logging only")
    
    logger.info("Logging configured")
    return logger