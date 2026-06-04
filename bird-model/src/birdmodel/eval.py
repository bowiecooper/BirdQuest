"""Evaluate a trained checkpoint: top-1/top-5, confusion matrix, hardest pairs.

    .venv/bin/python -m src.birdmodel.eval --ckpt checkpoints/best.pth --data data/CUB_200_2011
"""

import argparse
from pathlib import Path

import numpy as np
import torch
from torch.amp import autocast

from .data import Cub200, build_transforms
from .model import build_model


@torch.no_grad()
def collect_predictions(model, loader, device):
    model.eval()
    all_pred, all_true = [], []
    for images, targets in loader:
        images = images.to(device)
        with autocast(device_type=device.type, enabled=device.type == "cuda"):
            logits = model(images)
        all_pred.append(logits.argmax(1).cpu().numpy())
        all_true.append(targets.numpy())
    return np.concatenate(all_true), np.concatenate(all_pred)


def most_confused(cm, classes, top=15):
    """Return the most frequent (true -> predicted) off-diagonal mistakes."""
    pairs = []
    n = cm.shape[0]
    for i in range(n):
        for j in range(n):
            if i != j and cm[i, j] > 0:
                pairs.append((cm[i, j], classes[i], classes[j]))
    pairs.sort(reverse=True)
    return pairs[:top]


def main() -> int:
    from torch.utils.data import DataLoader
    from sklearn.metrics import confusion_matrix

    p = argparse.ArgumentParser(description="Evaluate CUB-200 checkpoint.")
    p.add_argument("--ckpt", default="checkpoints/best.pth")
    p.add_argument("--data", default="data/CUB_200_2011")
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--num-workers", type=int, default=4)
    p.add_argument("--out", default="checkpoints/metrics.md")
    args = p.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ckpt = torch.load(args.ckpt, map_location=device, weights_only=False)
    classes = ckpt["classes"]
    arch = ckpt["arch"]
    img_size = ckpt.get("img_size", 224)

    model = build_model(arch, num_classes=len(classes), pretrained=False).to(device)
    model.load_state_dict(ckpt["state_dict"])

    _, eval_tf = build_transforms(img_size)
    test_ds = Cub200(args.data, train=False, transform=eval_tf)
    loader = DataLoader(test_ds, batch_size=args.batch_size, num_workers=args.num_workers)

    y_true, y_pred = collect_predictions(model, loader, device)
    top1 = (y_true == y_pred).mean()
    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(classes))))
    confused = most_confused(cm, classes)

    lines = [
        f"# CUB-200 evaluation — {arch}",
        "",
        f"- Test images: {len(y_true)}",
        f"- **Top-1 accuracy: {top1*100:.2f}%**",
        f"- Saved top-1 (best checkpoint): {ckpt['metrics']['top1']*100:.2f}%",
        f"- Saved top-5 (best checkpoint): {ckpt['metrics']['top5']*100:.2f}%",
        "",
        "## Most-confused species pairs (true -> predicted)",
        "",
        "| count | true species | predicted as |",
        "|------:|--------------|--------------|",
    ]
    lines += [f"| {c} | {t} | {pr} |" for c, t, pr in confused]
    report = "\n".join(lines) + "\n"

    Path(args.out).write_text(report)
    print(report)
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
