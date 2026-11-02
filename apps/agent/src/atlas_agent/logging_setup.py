import json
import logging
from contextvars import ContextVar
from datetime import UTC, datetime

# The same names as the server's LOG_LEVEL, so one variable sets both
LOG_LEVELS: dict[ str, int ] = {
    "fatal": logging.CRITICAL,
    "error": logging.ERROR,
    "warn": logging.WARNING,
    "info": logging.INFO,
    "debug": logging.DEBUG,
    "trace": logging.DEBUG,
    "silent": logging.CRITICAL + 10
}

LOGGER_NAMES = [ "atlas_agent", "uvicorn", "uvicorn.access" ]

job_id_var: ContextVar[ str | None ] = ContextVar( "job_id", default = None )

RECORD_FIELDS = set( logging.makeLogRecord( {} ).__dict__ ) | { "message", "asctime" }

class JobIdFilter( logging.Filter ):
    def filter( self, record: logging.LogRecord ) -> bool:
        job_id = job_id_var.get()

        if job_id is not None:
            record.__dict__[ "job_id" ] = job_id

        return True

class JsonFormatter( logging.Formatter ):
    def format( self, record: logging.LogRecord ) -> str:
        line: dict[ str, object ] = {
            "time": datetime.fromtimestamp( record.created, UTC ).isoformat( timespec = "milliseconds" ),
            "level": record.levelname.lower(),
            "service": "agent",
            "msg": record.getMessage()
        }

        for key, value in record.__dict__.items():
            if key not in RECORD_FIELDS:
                line[ key ] = value

        if record.exc_info is not None:
            line[ "err" ] = self.formatException( record.exc_info )

        return json.dumps( line, default = str )

def configure_logging( level: str ) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter( JsonFormatter() )
    handler.addFilter( JobIdFilter() )

    for name in LOGGER_NAMES:
        logger = logging.getLogger( name )
        logger.handlers = [ handler ]
        logger.propagate = False
        logger.setLevel( LOG_LEVELS[ level ] )
