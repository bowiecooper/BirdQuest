"""FastAPI inference service for the BirdQuest classifier.

Loads the trained CUB-200 checkpoint and serves top-5 species predictions plus a
Grad-CAM overlay for the React app. Reuses the model code in ``src.birdmodel``;
no model logic is duplicated here.
"""
