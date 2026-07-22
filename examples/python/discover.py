#!/usr/bin/env python3
"""Find Sidecar ML iPhones on the local network via Bonjour/mDNS.

    python discover.py
    python discover.py --timeout 10
"""

from __future__ import annotations

import socket
import sys
import time

import typer
from loguru import logger
from zeroconf import ServiceBrowser, ServiceListener, Zeroconf

SERVICE_TYPE = "_sidecarml._tcp.local."

logger.remove()
logger.add(sys.stderr, format="<level>{level: <7}</level> {message}", level="INFO")


class SidecarListener(ServiceListener):
    def add_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        info = zc.get_service_info(type_, name)
        if not info:
            return
        addresses = [socket.inet_ntoa(addr) for addr in info.addresses]
        props = {
            key.decode(): value.decode() if isinstance(value, bytes) else value
            for key, value in (info.properties or {}).items()
        }
        for address in addresses:
            logger.success(f"found: {name.removesuffix('.' + SERVICE_TYPE)}")
            print(f"http://{address}:{info.port}  {props}")

    def update_service(self, zc: Zeroconf, type_: str, name: str) -> None: ...
    def remove_service(self, zc: Zeroconf, type_: str, name: str) -> None: ...


def main(
    timeout: float = typer.Option(5.0, help="Seconds to browse before giving up"),
) -> None:
    """Browse the LAN and print the base URL of every Sidecar ML phone found."""
    zeroconf = Zeroconf()
    ServiceBrowser(zeroconf, SERVICE_TYPE, SidecarListener())
    logger.info(f"browsing {SERVICE_TYPE} for {timeout:g} seconds…")
    try:
        time.sleep(timeout)
    finally:
        zeroconf.close()


if __name__ == "__main__":
    typer.run(main)
