import logging

from pythonjsonlogger import jsonlogger


logger = logging.getLogger()

if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(jsonlogger.JsonFormatter())
    logger.addHandler(handler)

logger.setLevel(logging.INFO)
