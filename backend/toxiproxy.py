from __future__ import annotations

import asyncio

import httpx

from config import TOXIPROXY_API_PORT, PROXY_LISTEN_PORTS

MAX_RETRIES = 5
RETRY_DELAY_SECONDS = 1.0


async def register_proxy(
    toxiproxy_host: str,
    proxy_name: str,
    upstream_host: str,
    technology: str,
) -> dict:
    """Register an upstream with a Toxiproxy sidecar. Retries until the sidecar is ready."""
    listen_port = PROXY_LISTEN_PORTS.get(technology, 8080)
    url = f"http://{toxiproxy_host}:{TOXIPROXY_API_PORT}/proxies"
    payload = {
        "name": proxy_name,
        "listen": f"0.0.0.0:{listen_port}",
        "upstream": f"{upstream_host}:{listen_port}",
        "enabled": True,
    }

    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                return resp.json()
        except (httpx.ConnectError, httpx.HTTPStatusError):
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAY_SECONDS)
            else:
                raise

    return {}
