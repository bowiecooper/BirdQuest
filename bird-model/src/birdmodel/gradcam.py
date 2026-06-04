"""Minimal Grad-CAM implemented from scratch (no extra dependency).

Grad-CAM highlights which image regions drove the predicted class, by weighting
the last conv feature maps by the gradient of the class score flowing into them.
This produces the heatmap overlay shown in the app — both a demo centerpiece and
a model-interpretability talking point.

    .venv/bin/python -m src.birdmodel.gradcam --ckpt checkpoints/best.pth --image path/to/bird.jpg
"""

import argparse
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from .data import IMAGENET_MEAN, IMAGENET_STD, build_transforms
from .model import build_model, gradcam_target_layer


class GradCAM:
    """Grad-CAM via forward/backward hooks on a target conv layer."""

    def __init__(self, model, target_layer):
        self.model = model.eval()
        self.activations = None
        self.gradients = None
        target_layer.register_forward_hook(self._save_activation)
        target_layer.register_full_backward_hook(self._save_gradient)

    def _save_activation(self, module, inp, out):
        self.activations = out.detach()

    def _save_gradient(self, module, grad_in, grad_out):
        self.gradients = grad_out[0].detach()

    def __call__(self, input_tensor, class_idx=None):
        logits = self.model(input_tensor)  # (1, C)
        if class_idx is None:
            class_idx = int(logits.argmax(1).item())
        self.model.zero_grad(set_to_none=True)
        logits[0, class_idx].backward()

        # Global-average-pool gradients -> per-channel weights, then weighted sum.
        weights = self.gradients.mean(dim=(2, 3), keepdim=True)  # (1, K, 1, 1)
        cam = F.relu((weights * self.activations).sum(dim=1, keepdim=True))  # (1,1,h,w)
        cam = F.interpolate(cam, size=input_tensor.shape[2:], mode="bilinear", align_corners=False)
        cam = cam[0, 0]
        cam = (cam - cam.min()) / (cam.max() - cam.min() + 1e-8)
        return class_idx, logits.softmax(1)[0], cam.cpu().numpy()


def _denormalize(tensor):
    mean = torch.tensor(IMAGENET_MEAN).view(3, 1, 1)
    std = torch.tensor(IMAGENET_STD).view(3, 1, 1)
    return (tensor.cpu() * std + mean).clamp(0, 1).permute(1, 2, 0).numpy()


def main() -> int:
    import matplotlib.cm as mpl_cm

    p = argparse.ArgumentParser(description="Grad-CAM for a single image.")
    p.add_argument("--ckpt", default="checkpoints/best.pth")
    p.add_argument("--image", required=True)
    p.add_argument("--out", default="checkpoints/gradcam.png")
    args = p.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ckpt = torch.load(args.ckpt, map_location=device, weights_only=False)
    classes, arch, img_size = ckpt["classes"], ckpt["arch"], ckpt.get("img_size", 224)

    model = build_model(arch, num_classes=len(classes), pretrained=False).to(device)
    model.load_state_dict(ckpt["state_dict"])

    _, eval_tf = build_transforms(img_size)
    img = Image.open(args.image).convert("RGB")
    x = eval_tf(img).unsqueeze(0).to(device)

    cam = GradCAM(model, gradcam_target_layer(model, arch))
    class_idx, probs, heatmap = cam(x)

    top5 = torch.topk(probs, 5)
    print("Top-5 predictions:")
    for prob, idx in zip(top5.values.tolist(), top5.indices.tolist()):
        print(f"  {classes[idx]:35s} {prob*100:5.1f}%")

    # Overlay heatmap on the (denormalized) input.
    base = _denormalize(x[0])
    colored = mpl_cm.jet(heatmap)[..., :3]
    overlay = (0.5 * base + 0.5 * colored).clip(0, 1)
    Image.fromarray((overlay * 255).astype(np.uint8)).save(args.out)
    print(f"\nPredicted: {classes[class_idx]}  ->  overlay saved to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
