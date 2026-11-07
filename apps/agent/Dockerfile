# syntax=docker/dockerfile:1

FROM python:3.14-slim@sha256:af8a5aa14780025dbfbcfbc81bd8a91ebd87711dd5b0f48ed71090949dd7cb1d

COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /bin/uv

ENV UV_NO_CACHE=1 \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
RUN uv sync --frozen --no-dev

RUN useradd --system --uid 10001 --no-create-home agent
USER agent

EXPOSE 8100

CMD [ "uvicorn", "atlas_agent.main:app", "--host", "0.0.0.0", "--port", "8100" ]
