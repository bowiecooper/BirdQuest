"""CUB-200-2011 dataset + dataloaders.

torchvision has no built-in CUB dataset, so we read the metadata files that ship
with the archive:

    images.txt              <image_id> <relative_path>
    image_class_labels.txt  <image_id> <class_id>   (1-indexed)
    train_test_split.txt    <image_id> <is_training> (1 = train, 0 = test)
    classes.txt             <class_id> <class_name>  (e.g. "001.Black_footed_Albatross")

Class ids in the files are 1-indexed; we expose 0-indexed labels for the model.
"""

from pathlib import Path

import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms

# ImageNet normalization — required because we use ImageNet-pretrained backbones.
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


def pretty_class_name(raw: str) -> str:
    """'001.Black_footed_Albatross' -> 'Black footed Albatross'."""
    name = raw.split(".", 1)[-1] if "." in raw else raw
    return name.replace("_", " ").strip()


class Cub200(Dataset):
    """CUB-200-2011 split. Set ``train=True`` for the training split, else test."""

    def __init__(self, root: str | Path, train: bool, transform=None):
        self.root = Path(root)
        if not (self.root / "images").exists():
            raise FileNotFoundError(
                f"CUB images not found under {self.root}. Run scripts/download_cub.py."
            )
        self.transform = transform

        paths = self._read_pairs("images.txt")
        labels = {i: int(c) - 1 for i, c in self._read_pairs("image_class_labels.txt").items()}
        is_train = {i: c == "1" for i, c in self._read_pairs("train_test_split.txt").items()}

        self.samples: list[tuple[Path, int]] = []
        for img_id, rel in paths.items():
            if is_train[img_id] == train:
                self.samples.append((self.root / "images" / rel, labels[img_id]))

        raw_classes = self._read_pairs("classes.txt")  # class_id -> raw name
        # class_id is 1-indexed; build a 0-indexed list ordered by class index.
        self.classes = [
            pretty_class_name(raw_classes[str(k + 1)]) for k in range(len(raw_classes))
        ]

    def _read_pairs(self, fname: str) -> dict[str, str]:
        out: dict[str, str] = {}
        with open(self.root / fname, encoding="utf-8") as f:
            for line in f:
                key, val = line.strip().split(" ", 1)
                out[key] = val
        return out

    @property
    def num_classes(self) -> int:
        return len(self.classes)

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")
        if self.transform is not None:
            img = self.transform(img)
        return img, label


def build_transforms(img_size: int = 224):
    """Train transforms include augmentation; eval transforms are deterministic."""
    train_tf = transforms.Compose(
        [
            transforms.RandomResizedCrop(img_size, scale=(0.5, 1.0)),
            transforms.RandomHorizontalFlip(),
            transforms.ColorJitter(0.2, 0.2, 0.2),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ]
    )
    eval_tf = transforms.Compose(
        [
            transforms.Resize(int(img_size * 1.15)),
            transforms.CenterCrop(img_size),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ]
    )
    return train_tf, eval_tf


def build_dataloaders(
    root: str | Path,
    img_size: int = 224,
    batch_size: int = 16,
    num_workers: int = 4,
):
    """Return (train_loader, test_loader, class_names)."""
    train_tf, eval_tf = build_transforms(img_size)
    train_ds = Cub200(root, train=True, transform=train_tf)
    test_ds = Cub200(root, train=False, transform=eval_tf)

    cuda = torch.cuda.is_available()
    train_loader = DataLoader(
        train_ds,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=cuda,
        drop_last=True,
        persistent_workers=num_workers > 0,
    )
    test_loader = DataLoader(
        test_ds,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=cuda,
        persistent_workers=num_workers > 0,
    )
    return train_loader, test_loader, train_ds.classes
