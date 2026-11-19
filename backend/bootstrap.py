"""Create the first measured baseline before opening the workspace."""

from time import sleep
from .store import Workspace


def main():
    ws = Workspace()
    if not ws.bundle:
        print("Training the five baseline models on the active dataset.", flush=True)
        ws.start("all", {})
        while ws.job["running"]:
            sleep(0.2)
        if ws.job["error"]:
            raise RuntimeError(ws.job["error"])
    state = ws.state()
    print(
        f"{state['dataset']['version']} | {len(state['results'])} trained | validation recommendation: {state['recommended']}",
        flush=True,
    )


if __name__ == "__main__":
    main()
