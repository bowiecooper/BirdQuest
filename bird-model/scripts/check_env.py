"""Verify the training environment: PyTorch, CUDA visibility, and GPU memory.

Run this first. If CUDA is not available, training will fall back to CPU
(very slow), so we want to confirm the RTX 3050 is visible through WSL2.
"""

import sys


def main() -> int:
    try:
        import torch
    except ImportError:
        print("ERROR: torch is not installed. Activate the venv and install it.")
        return 1

    print(f"Python      : {sys.version.split()[0]}")
    print(f"torch       : {torch.__version__}")
    print(f"CUDA build  : {torch.version.cuda}")
    print(f"cuDNN       : {torch.backends.cudnn.version()}")
    print(f"CUDA avail  : {torch.cuda.is_available()}")

    if not torch.cuda.is_available():
        print(
            "\nWARNING: CUDA not available — torch will use CPU only.\n"
            "Check that the cu121 build of torch is installed and that\n"
            "the NVIDIA Windows driver supports WSL2 GPU passthrough."
        )
        return 2

    i = torch.cuda.current_device()
    props = torch.cuda.get_device_properties(i)
    total_gb = props.total_memory / 1024**3
    print(f"GPU         : {props.name}")
    print(f"VRAM total  : {total_gb:.2f} GiB")
    print(f"Compute cap : {props.major}.{props.minor}")

    # A tiny real allocation + matmul to confirm the GPU actually computes.
    x = torch.randn(1024, 1024, device="cuda")
    y = (x @ x).sum().item()
    used_mb = torch.cuda.max_memory_allocated() / 1024**2
    print(f"Smoke test  : matmul OK (peak {used_mb:.1f} MiB used, result={y:.1f})")
    print("\nEnvironment ready for training.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
