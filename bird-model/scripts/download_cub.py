"""Download and extract the CUB-200-2011 dataset.

CUB-200-2011: 11,788 images across 200 bird species. It is the standard
fine-grained visual classification benchmark.

The Caltech mirror is the canonical source but is occasionally slow/down, so we
try a couple of known URLs. The archive is ~1.1 GB and extracts to data/CUB_200_2011/.
"""

import sys
import tarfile
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
ARCHIVE = DATA_DIR / "CUB_200_2011.tgz"
EXTRACTED = DATA_DIR / "CUB_200_2011"

# Tried in order. The Caltech DATA record is the current official host.
URLS = [
    "https://data.caltech.edu/records/65de6-vp158/files/CUB_200_2011.tgz?download=1",
    "https://s3.amazonaws.com/fast-ai-imageclas/CUB_200_2011.tgz",
]


def _progress(block_num: int, block_size: int, total_size: int) -> None:
    if total_size <= 0:
        return
    done = block_num * block_size
    pct = min(100.0, done * 100.0 / total_size)
    mb = done / 1024**2
    total_mb = total_size / 1024**2
    print(f"\r  {pct:5.1f}%  ({mb:7.1f} / {total_mb:7.1f} MiB)", end="", flush=True)


def download() -> bool:
    if ARCHIVE.exists():
        print(f"Archive already present: {ARCHIVE}")
        return True
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for url in URLS:
        print(f"Downloading from {url}")
        try:
            urllib.request.urlretrieve(url, ARCHIVE, _progress)
            print("\n  done.")
            return True
        except Exception as e:  # noqa: BLE001 - try the next mirror
            print(f"\n  failed: {e}")
            if ARCHIVE.exists():
                ARCHIVE.unlink()
    return False


def extract() -> bool:
    if EXTRACTED.exists():
        print(f"Already extracted: {EXTRACTED}")
        return True
    print(f"Extracting {ARCHIVE} ...")
    with tarfile.open(ARCHIVE, "r:gz") as tar:
        tar.extractall(DATA_DIR, filter="data")
    print("  done.")
    return EXTRACTED.exists()


def main() -> int:
    if not download():
        print(
            "\nCould not download CUB-200-2011 automatically.\n"
            "Download CUB_200_2011.tgz manually into bird-model/data/ and re-run."
        )
        return 1
    if not extract():
        print("Extraction failed.")
        return 1
    n = len(list((EXTRACTED / "images").glob("*/*.jpg")))
    print(f"\nCUB-200-2011 ready: {n} images at {EXTRACTED}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
