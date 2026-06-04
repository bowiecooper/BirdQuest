"""Model factory: ImageNet-pretrained backbones with a CUB-200 classification head.

Defaults to EfficientNet-B0 — a strong accuracy/VRAM tradeoff that fits the 4GB
RTX 3050 comfortably at 224px. ResNet-50 is available as an alternative.
"""

import torch.nn as nn
from torchvision import models

SUPPORTED = ("efficientnet_b0", "resnet50")


def build_model(arch: str = "efficientnet_b0", num_classes: int = 200, pretrained: bool = True):
    """Build a backbone with its final layer replaced by a `num_classes` head."""
    if arch == "efficientnet_b0":
        weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
        model = models.efficientnet_b0(weights=weights)
        in_features = model.classifier[1].in_features
        model.classifier[1] = nn.Linear(in_features, num_classes)
    elif arch == "resnet50":
        weights = models.ResNet50_Weights.IMAGENET1K_V2 if pretrained else None
        model = models.resnet50(weights=weights)
        model.fc = nn.Linear(model.fc.in_features, num_classes)
    else:
        raise ValueError(f"Unsupported arch '{arch}'. Choose from {SUPPORTED}.")
    return model


def set_backbone_frozen(model, arch: str, frozen: bool) -> None:
    """Freeze/unfreeze the feature extractor, leaving the classification head trainable.

    Stage 1 trains only the head (fast, stable). Stage 2 unfreezes for fine-tuning.
    """
    requires_grad = not frozen
    if arch == "efficientnet_b0":
        for p in model.features.parameters():
            p.requires_grad = requires_grad
    elif arch == "resnet50":
        for name, p in model.named_parameters():
            if not name.startswith("fc."):
                p.requires_grad = requires_grad


def gradcam_target_layer(model, arch: str):
    """Return the last conv layer used as the Grad-CAM target."""
    if arch == "efficientnet_b0":
        return model.features[-1]
    if arch == "resnet50":
        return model.layer4[-1]
    raise ValueError(f"Unsupported arch '{arch}'.")
