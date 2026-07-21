#!/usr/bin/env python3
"""Find Sidecar ML iPhones on the local network via Bonjour/mDNS.

    pip install zeroconf
    python discover.py
"""

from __future__ import annotations

import socket
import time

from zeroconf import ServiceBrowser, ServiceListener, Zeroconf

SERVICE_TYPE = "_sidecarml._tcp.local."


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
            print(f"found: {name.removesuffix('.' + SERVICE_TYPE)}")
            print(f"  → http://{address}:{info.port}  {props}")

    def update_service(self, zc: Zeroconf, type_: str, name: str) -> None: ...
    def remove_service(self, zc: Zeroconf, type_: str, name: str) -> None: ...


def main() -> None:
    zeroconf = Zeroconf()
    ServiceBrowser(zeroconf, SERVICE_TYPE, SidecarListener())
    print(f"browsing {SERVICE_TYPE} for 5 seconds…")
    try:
        time.sleep(5)
    finally:
        zeroconf.close()


if __name__ == "__main__":
    main()
