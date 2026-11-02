import hmac
import logging
import os
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from atlas_agent.claude import AnthropicClaude, ClaudeClient
from atlas_agent.config import Settings, load_settings
from atlas_agent.contract.link import (
    InstructionsResponse,
    LinkOutcome,
    LinkRequest,
    LinkResponse,
    LinkUsage
)
from atlas_agent.linker.instructions import build_instructions
from atlas_agent.linker.loop import run_linker
from atlas_agent.logging_setup import configure_logging, job_id_var
from atlas_agent.vault.paths import UnknownVaultError

logger = logging.getLogger( "atlas_agent" )

def create_secret_check( settings: Settings ) -> Callable[ [ str | None ], Awaitable[ None ] ]:
    expected = f"Bearer {settings.agent_secret}".encode()

    async def check_secret( authorization: Annotated[ str | None, Header() ] = None ) -> None:
        if authorization is None or not hmac.compare_digest( authorization.encode(), expected ):
            raise HTTPException( status_code = 401, detail = "unauthorized" )

    return check_secret

def read_job_id( value: str | None ) -> str | None:
    if value is None:
        return None

    try:
        return str( uuid.UUID( value ) )
    except ValueError:
        return None

def create_app( settings: Settings, claude: ClaudeClient ) -> FastAPI:
    app = FastAPI( docs_url = None, redoc_url = None, openapi_url = None )
    app.state.claude = claude

    @app.middleware( "http" )
    async def log_request( request: Request, call_next: Callable[ [ Request ], Awaitable[ Response ] ] ) -> Response:
        started = time.perf_counter()
        token = job_id_var.set( read_job_id( request.headers.get( "X-Job-Id" ) ) )

        try:
            response = await call_next( request )
            duration = ( time.perf_counter() - started ) * 1000
            line = f"{request.method} {request.url.path} {response.status_code} {duration:.0f}ms"
            fields: dict[ str, object ] = {
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round( duration )
            }
            link_response: LinkResponse | None = getattr( request.state, "link_response", None )

            if link_response is not None:
                usage = link_response.usage
                line = (
                    f"{line} outcome={link_response.outcome.value} tool_calls={usage.tool_calls} "
                    f"input_tokens={usage.input_tokens} output_tokens={usage.output_tokens}"
                )
                fields.update(
                    outcome = link_response.outcome.value,
                    tool_calls = usage.tool_calls,
                    input_tokens = usage.input_tokens,
                    output_tokens = usage.output_tokens
                )

            logger.info( line, extra = fields )

            return response
        finally:
            job_id_var.reset( token )

    @app.get( "/health" )
    def read_health() -> JSONResponse:
        try:
            next( settings.vaults_root.iterdir(), None )
        except OSError:
            return JSONResponse( status_code = 503, content = { "status": "error", "vault": "unreadable" } )

        return JSONResponse( content = { "status": "ok", "vault": "readable" } )

    v1 = APIRouter( prefix = "/v1", dependencies = [ Depends( create_secret_check( settings ) ) ] )

    @v1.get( "/link/instructions" )
    def read_instructions() -> InstructionsResponse:
        return InstructionsResponse( instructions = build_instructions( settings.max_suggestions ) )

    @v1.post( "/link", response_model = LinkResponse )
    async def create_links( link_request: LinkRequest, request: Request ) -> LinkResponse | JSONResponse:
        try:
            link_response = await run_linker( link_request, settings, claude )
        except UnknownVaultError:
            return JSONResponse( status_code = 422, content = { "error": "unknown_vault" } )

        request.state.link_response = link_response

        return link_response

    app.include_router( v1 )

    @app.exception_handler( RequestValidationError )
    async def reject_invalid_request( request: Request, exception: RequestValidationError ) -> JSONResponse:
        errors = exception.errors()
        first = errors[ 0 ]

        if first[ "type" ] == "json_invalid":
            reason = "Invalid request: body is not valid JSON"
        else:
            location = ".".join( str( part ) for part in first[ "loc" ][ 1 : ] ) or "body"
            plural = "" if len( errors ) == 1 else "s"
            reason = f"Invalid request: {len( errors )} error{plural}, first at {location}"

        link_response = LinkResponse(
            outcome = LinkOutcome.FAILED,
            reason = reason,
            suggestions = [],
            usage = LinkUsage(
                input_tokens = 0,
                output_tokens = 0,
                cache_read_input_tokens = 0,
                cache_creation_input_tokens = 0,
                tool_calls = 0,
                turns = 0
            )
        )
        request.state.link_response = link_response

        return JSONResponse( content = link_response.model_dump( mode = "json" ) )

    return app

def __getattr__( name: str ) -> FastAPI:
    if name != "app":
        raise AttributeError( f"module {__name__!r} has no attribute {name!r}" )

    settings = load_settings( os.environ )
    configure_logging( settings.log_level )

    return create_app( settings, AnthropicClaude( settings.anthropic_api_key ) )
