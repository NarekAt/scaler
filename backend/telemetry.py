import asyncio

from docker.models.containers import Container

from config import LOCAL_SCALE_FACTOR


def parse_docker_stats(stats: dict) -> dict:
    """Extract cpu_percent and memory_mb from a Docker stats blob."""
    cpu_delta = (
        stats["cpu_stats"]["cpu_usage"]["total_usage"]
        - stats["precpu_stats"]["cpu_usage"]["total_usage"]
    )
    system_delta = (
        stats["cpu_stats"]["system_cpu_usage"]
        - stats["precpu_stats"]["system_cpu_usage"]
    )
    num_cpus = stats["cpu_stats"].get("online_cpus", 1)

    cpu_percent = (
        (cpu_delta / system_delta) * num_cpus * 100.0 if system_delta > 0 else 0.0
    )
    mem_usage = stats.get("memory_stats", {}).get("usage", 0)
    mem_mb = mem_usage / (1024 * 1024)

    return {"cpu_percent": round(cpu_percent, 2), "memory_mb": round(mem_mb, 1)}


async def poll_container_stats(container: Container) -> dict:
    """Get a single stats snapshot from a container (blocking call in executor)."""
    loop = asyncio.get_event_loop()
    stats = await loop.run_in_executor(
        None, lambda: container.stats(stream=False)
    )
    return parse_docker_stats(stats)


async def collect_session_metrics(containers: dict[str, Container]) -> dict:
    """Collect stats from all containers concurrently, return scaled metrics."""
    tasks = [poll_container_stats(c) for c in containers.values()]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    parsed = []
    per_container: dict[str, dict] = {}
    for nid, result in zip(containers.keys(), results):
        if isinstance(result, Exception):
            per_container[nid] = {"cpu_percent": 0, "memory_mb": 0}
        else:
            per_container[nid] = result
            parsed.append(result)

    all_cpu = [r["cpu_percent"] for r in parsed]
    avg_cpu = sum(all_cpu) / len(all_cpu) if all_cpu else 0

    return {
        "latency": round(avg_cpu * LOCAL_SCALE_FACTOR / 10, 1),
        "cpu": round(avg_cpu * LOCAL_SCALE_FACTOR / 100, 1),
        "per_container": per_container,
    }
