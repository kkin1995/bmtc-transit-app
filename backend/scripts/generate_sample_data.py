#!/usr/bin/env python3
"""Generate sample ride data for testing."""
import random
import time
import json


def generate_sample_rides(num_rides: int = 100):
    """Generate synthetic rides across 5 routes."""
    routes = [
        ("ROUTE_335E", ["STOP_KR_PURAM", "STOP_SILK_BOARD", "STOP_JAYANAGAR", "STOP_JP_NAGAR"]),
        ("ROUTE_500K", ["STOP_YESWANTHPUR", "STOP_MAJESTIC", "STOP_SHIVAJI_NAGAR"]),
        ("ROUTE_G4", ["STOP_BANASHANKARI", "STOP_JAYANAGAR", "STOP_SHIVAJI_NAGAR"]),
        ("ROUTE_201A", ["STOP_DOMLUR", "STOP_HAL", "STOP_INDIRANAGAR"]),
        ("ROUTE_600", ["STOP_WHITEFIELD", "STOP_MARATHAHALLI", "STOP_KORAMANGALA"])
    ]

    rides = []
    now = int(time.time())

    for i in range(num_rides):
        route_id, stops = random.choice(routes)
        direction_id = random.choice([0, 1])

        # Generate 2-4 segments per ride
        num_segments = random.randint(2, min(4, len(stops) - 1))
        start_idx = random.randint(0, len(stops) - num_segments - 1)

        segments = []
        base_time = now - random.randint(0, 7 * 24 * 3600)  # Within last 7 days

        for j in range(num_segments):
            from_stop = stops[start_idx + j]
            to_stop = stops[start_idx + j + 1]

            # Typical inter-stop time: 3-10 min
            duration_sec = random.uniform(180, 600)

            # Dwell time: 10-60 sec
            dwell_sec = random.uniform(10, 60)

            segments.append({
                "from_stop_id": from_stop,
                "to_stop_id": to_stop,
                "duration_sec": round(duration_sec, 1),
                "dwell_sec": round(dwell_sec, 1),
                "timestamp_utc": base_time + j * 300  # 5 min apart
            })

        ride = {
            "route_id": route_id,
            "direction_id": direction_id,
            "segments": segments
        }
        rides.append(ride)

    return rides


if __name__ == "__main__":
    rides = generate_sample_rides(100)
    output_path = "sample_rides.json"
    with open(output_path, "w") as f:
        json.dump(rides, f, indent=2)
    print(f"Generated {len(rides)} sample rides → {output_path}")
