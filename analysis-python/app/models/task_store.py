import asyncio
from typing import Any


task_store: dict[str, dict[str, Any]] = {}
running_tasks: set[asyncio.Task[Any]] = set()
