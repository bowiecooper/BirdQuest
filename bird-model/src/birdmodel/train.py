"""Train the CUB-200 classifier with two-stage transfer learning.

Stage 1: freeze the pretrained backbone, train only the new head.
Stage 2: unfreeze and fine-tune the whole network at a lower LR.

Tuned for a 4GB GPU: mixed precision (AMP), modest batch size, optional gradient
accumulation. Saves the best checkpoint (by top-1) with class names + metadata so
the serving layer needs nothing else.

Run from the bird-model/ dir:
    .venv/bin/python -m src.birdmodel.train --data data/CUB_200_2011
"""

import argparse
import json
import time
from pathlib import Path

import torch
import torch.nn as nn
from torch.amp import GradScaler, autocast

from .data import build_dataloaders
from .model import build_model, set_backbone_frozen


def accuracy_topk(logits, targets, ks=(1, 5)):
    """Return a dict {k: num_correct_in_topk} for this batch."""
    maxk = max(ks)
    _, pred = logits.topk(maxk, dim=1)  # (B, maxk)
    correct = pred.eq(targets.view(-1, 1))
    return {k: correct[:, :k].any(dim=1).sum().item() for k in ks}


@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    total = 0
    hits = {1: 0, 5: 0}
    for images, targets in loader:
        images, targets = images.to(device), targets.to(device)
        with autocast(device_type=device.type, enabled=device.type == "cuda"):
            logits = model(images)
        batch = accuracy_topk(logits, targets)
        for k in hits:
            hits[k] += batch[k]
        total += targets.size(0)
    return {"top1": hits[1] / total, "top5": hits[5] / total}


def run_epoch(model, loader, device, criterion, optimizer, scaler, accum_steps, log_prefix):
    model.train()
    total, running_loss = 0, 0.0
    optimizer.zero_grad(set_to_none=True)
    t0 = time.time()
    for step, (images, targets) in enumerate(loader):
        images, targets = images.to(device), targets.to(device)
        with autocast(device_type=device.type, enabled=device.type == "cuda"):
            logits = model(images)
            loss = criterion(logits, targets) / accum_steps
        scaler.scale(loss).backward()
        if (step + 1) % accum_steps == 0:
            scaler.step(optimizer)
            scaler.update()
            optimizer.zero_grad(set_to_none=True)
        running_loss += loss.item() * accum_steps * targets.size(0)
        total += targets.size(0)
        if step % 50 == 0:
            print(f"  {log_prefix} step {step:4d}/{len(loader)}  loss {loss.item()*accum_steps:.3f}")
    return {"loss": running_loss / total, "secs": time.time() - t0}


def train_stage(model, arch, loaders, device, *, epochs, lr, freeze, accum_steps, scaler, best, ckpt_path, classes, img_size, stage_name):
    train_loader, test_loader = loaders
    set_backbone_frozen(model, arch, frozen=freeze)
    params = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(params, lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(epochs, 1))
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    for epoch in range(1, epochs + 1):
        tr = run_epoch(model, train_loader, device, criterion, optimizer, scaler, accum_steps, f"[{stage_name} e{epoch}]")
        metrics = evaluate(model, test_loader, device)
        scheduler.step()
        print(
            f"[{stage_name}] epoch {epoch}/{epochs}  loss {tr['loss']:.3f}  "
            f"top1 {metrics['top1']*100:.2f}%  top5 {metrics['top5']*100:.2f}%  ({tr['secs']:.0f}s)"
        )
        if metrics["top1"] > best["top1"]:
            best.update(metrics)
            torch.save(
                {
                    "arch": arch,
                    "state_dict": model.state_dict(),
                    "classes": classes,
                    "img_size": img_size,
                    "metrics": metrics,
                },
                ckpt_path,
            )
            print(f"  -> saved new best (top1 {metrics['top1']*100:.2f}%) to {ckpt_path}")
    return best


def main() -> int:
    p = argparse.ArgumentParser(description="Train CUB-200 bird classifier.")
    p.add_argument("--data", default="data/CUB_200_2011", help="path to CUB_200_2011 dir")
    p.add_argument("--arch", default="efficientnet_b0", choices=["efficientnet_b0", "resnet50"])
    p.add_argument("--img-size", type=int, default=224)
    p.add_argument("--batch-size", type=int, default=16)
    p.add_argument("--accum-steps", type=int, default=2, help="gradient accumulation (effective batch = batch_size * accum_steps)")
    p.add_argument("--num-workers", type=int, default=4)
    p.add_argument("--head-epochs", type=int, default=3, help="stage 1: frozen backbone")
    p.add_argument("--finetune-epochs", type=int, default=12, help="stage 2: full fine-tune")
    p.add_argument("--head-lr", type=float, default=1e-3)
    p.add_argument("--finetune-lr", type=float, default=1e-4)
    p.add_argument("--out", default="checkpoints/best.pth")
    args = p.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")
    if device.type == "cpu":
        print("WARNING: training on CPU will be very slow.")

    train_loader, test_loader, classes = build_dataloaders(
        args.data, args.img_size, args.batch_size, args.num_workers
    )
    print(f"Classes: {len(classes)}  train batches: {len(train_loader)}  test batches: {len(test_loader)}")

    model = build_model(args.arch, num_classes=len(classes), pretrained=True).to(device)
    scaler = GradScaler(enabled=device.type == "cuda")
    ckpt_path = Path(args.out)
    ckpt_path.parent.mkdir(parents=True, exist_ok=True)
    best = {"top1": 0.0, "top5": 0.0}
    loaders = (train_loader, test_loader)

    print("\n=== Stage 1: train head (backbone frozen) ===")
    best = train_stage(
        model, args.arch, loaders, device, epochs=args.head_epochs, lr=args.head_lr,
        freeze=True, accum_steps=args.accum_steps, scaler=scaler, best=best,
        ckpt_path=ckpt_path, classes=classes, img_size=args.img_size, stage_name="head",
    )

    print("\n=== Stage 2: fine-tune full network ===")
    best = train_stage(
        model, args.arch, loaders, device, epochs=args.finetune_epochs, lr=args.finetune_lr,
        freeze=False, accum_steps=args.accum_steps, scaler=scaler, best=best,
        ckpt_path=ckpt_path, classes=classes, img_size=args.img_size, stage_name="finetune",
    )

    print(f"\nBest top1 {best['top1']*100:.2f}%  top5 {best['top5']*100:.2f}%")
    (ckpt_path.parent / "best_metrics.json").write_text(json.dumps(best, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
