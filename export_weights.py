"""
Export PyTorch model weights to JSON for web use.

This script loads the trained NCA model and exports weights
in a format that can be loaded by the JavaScript implementation.
"""

import json
import torch
import numpy as np
from pathlib import Path

from lib.CAModel import CAModel


def export_weights(
    model_path: str = "models/remaster_1.pth",
    output_path: str = "web/weights.json",
    channel_n: int = 16,
    fire_rate: float = 0.5
) -> None:
    """
    Export PyTorch model weights to JSON format.
    
    Args:
        model_path: Path to the trained PyTorch model
        output_path: Path to save the JSON weights
        channel_n: Number of channels in the model
        fire_rate: Cell fire rate
    """
    # Load model
    device = torch.device("cpu")
    model = CAModel(channel_n, fire_rate, device)
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.eval()
    
    # Extract weights
    weights = {
        "fc0_weight": model.fc0.weight.detach().numpy().tolist(),
        "fc0_bias": model.fc0.bias.detach().numpy().tolist(),
        "fc1_weight": model.fc1.weight.detach().numpy().tolist(),
        "channel_n": channel_n,
        "fire_rate": fire_rate,
        "hidden_size": model.fc0.out_features
    }
    
    # Save to JSON
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_file, 'w') as f:
        json.dump(weights, f)
    
    # Calculate file size
    size_kb = output_file.stat().st_size / 1024
    
    print(f"[OK] Weights exported to: {output_path}")
    print(f"     File size: {size_kb:.2f} KB")
    print(f"     Channels: {channel_n}")
    print(f"     Hidden size: {weights['hidden_size']}")
    print(f"     FC0 shape: {len(weights['fc0_weight'])} x {len(weights['fc0_weight'][0])}")
    print(f"     FC1 shape: {len(weights['fc1_weight'])} x {len(weights['fc1_weight'][0])}")


if __name__ == "__main__":
    export_weights()
