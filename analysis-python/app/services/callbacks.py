from typing import Any

import httpx


async def notify_node_callback(callback_url: str, payload: dict[str, Any]) -> None:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(callback_url, json=payload)
        response.raise_for_status()
