"""Start one loopback service, then open the measured workspace in the default browser."""

import json
import socket
import sys
import threading
import time
import webbrowser
from urllib.error import URLError
from urllib.request import urlopen

URL = "http://127.0.0.1:8765"


def online():
    try:
        with urlopen(URL + "/api/health", timeout=1) as response:
            return json.load(response).get("service") == "Mise"
    except (URLError, TimeoutError, ValueError, OSError):
        return False


def open_when_ready():
    for _ in range(120):
        if online():
            webbrowser.open(URL)
            return
        time.sleep(0.5)


def main():
    if online():
        webbrowser.open(URL)
        return
    with socket.socket() as check:
        try:
            check.bind(("127.0.0.1", 8765))
        except OSError:
            sys.exit(
                "Port 8765 is already occupied. Close the application using it, then launch Mise again."
            )
    from backend.dataset import DATA

    if not (DATA / "active.json").exists():
        from backend.bootstrap import main as baseline

        baseline()
    import uvicorn

    print(
        f"Mise is starting at {URL}. Press Ctrl+C in this window to stop the server.",
        flush=True,
    )
    threading.Thread(target=open_when_ready, daemon=True).start()
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8765, workers=1)


if __name__ == "__main__":
    main()
