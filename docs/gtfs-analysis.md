# BMTC GTFS Data Analysis

**Dataset Version:** 20250902
**Publisher:** Vonter (Community GTFS)
**Source:** https://github.com/Vonter/bmtc-gtfs
**Valid Period:** 2025-09-02 to 2026-09-02
**Language:** English

---

## Dataset Overview

| Metric | Count | Notes |
|--------|-------|-------|
| **Routes** | 4,190 | Unique route_id combinations |
| **Route Variants** | 2,936 | Unique route short names (e.g., "335E") |
| **Trips** | 54,780 | Scheduled trips per day |
| **Stops** | 9,360 | Physical bus stops across Bengaluru |
| **Stop Times** | 1,462,417 | Individual stop visits across all trips |
| **Service Patterns** | 1 | Single service_id runs all 7 days |
| **Directions** | 2 | 0=outbound, 1=inbound |

---

## Key Statistics

### Trip Characteristics
- **Average stops per trip:** 26.7
- **Estimated avg segment time:** ~154 seconds (2.6 minutes)
- **Total segments:** ~1,407,637 (trip × stops - 1)

### Service Patterns
BMTC operates a **unified schedule** with one service_id covering:
- Monday through Sunday (7 days/week)
- No separate weekday/weekend services in GTFS
- Our system splits into 2 day-types (weekday=0, weekend=1) for learning

### Peak Operating Hours
Based on stop_times arrival distribution:

| Hour | Stop Events | % of Total |
|------|-------------|------------|
| 09:00 | 109,512 | 7.5% |
| 08:00 | 106,697 | 7.3% |
| 16:00 | 98,659 | 6.7% |
| 17:00 | 97,969 | 6.7% |
| 10:00 | 96,046 | 6.6% |
| 15:00 | 93,850 | 6.4% |
| 11:00 | 93,849 | 6.4% |
| 18:00 | 91,462 | 6.3% |

**Peak windows:**
- **Morning:** 07:00-11:00 (heavy commute)
- **Evening:** 15:00-18:00 (return commute)

---

## Route Naming Convention

Routes use descriptive long names:
```
<Origin> ⇔ <Destination>,<Short Name>,agency_id,route_type,route_id
```

Examples:
- `11th Block Anjanapura ⇔ Vidhana Soudha,215-NE,1,3,215-NE ANP11-KMT-VSD`
- `5th Phase Yelahanka New Town ⇔ KR Pura Govt Hospital,507-D,1,3,507-D`

### Route ID Structure
Route IDs often encode:
- Short name (e.g., `215-NE`)
- Stop abbreviations (e.g., `ANP11-KMT-VSD`)
- Variant suffix (e.g., `-A`, `-B`, `-MC`)

This creates **4,190 unique route_id** values from **2,936 base routes**.

---

## Stop Distribution

9,360 stops cover Bengaluru metro area. Sample stops:
- Major hubs: Kempegowda Bus Station, Majestic, Shivajinagara
- Tech corridors: Whitefield, Electronic City, Outer Ring Road
- Residential: Jayanagar, Koramangala, Indiranagar, Banashankari

Stop IDs are numeric (e.g., `20558`, `29374`).

---

## Data Quality Notes

### Strengths
✓ Comprehensive coverage of BMTC network
✓ Detailed stop sequences (26+ stops/trip avg)
✓ Realistic timing patterns
✓ Community-maintained and actively updated

### Limitations & Assumptions
- **Single service pattern:** All trips use service_id=1
  - Real BMTC likely has weekday/weekend/holiday variations
  - Our system infers day-type from actual ride timestamps
- **No realtime feed:** Static schedule only
- **Direction_id interpretation:** 0/1 may not strictly mean geographical direction
- **Stop locations:** Lat/lon present but not validated
- **Fare data:** Included but not used in this MVP

### Bootstrap Implications
When seeding `segment_stats` with schedule baselines:
- We duplicate each trip's segments for **both weekday and weekend** bins
- This provides fallback estimates even if schedule doesn't vary by day
- Real-world learning (from ride uploads) will override these baselines
- Blend weight w=n/(n+20) ensures schedule influence fades as n grows

---

## Estimated Database Footprint

After bootstrap with 192 time bins (96 × 2 day-types):

| Table | Est. Rows | Notes |
|-------|-----------|-------|
| `segments` | ~1.4M | Unique route×dir×from_stop×to_stop |
| `segment_stats` | ~270M | segments × 192 bins (sparse) |
| `time_bins` | 192 | Fixed |
| `rides` | 0 | Grows with user submissions |
| `ride_segments` | 0 | Grows with user submissions |

**Reality check:** Not all segment×bin combinations will have scheduled trips. Expect:
- **Actual segment_stats rows:** 5-20M (based on real trip coverage)
- **SQLite DB size:** 500MB-2GB post-bootstrap
- **WAL overhead:** +10-20% during writes

---

## Recommendations

### For Testing
Use popular routes with high trip frequency:
- Route 335E, G4, 500K (major corridors)
- Stops near Majestic, Silk Board, Marathahalli (high traffic)

### For Learning
Focus on:
- **Peak hours** (08:00-10:00, 16:00-18:00) for fastest convergence
- **Weekday vs weekend** split to capture behavioral differences
- **Outlier thresholds** tuned to Bengaluru traffic variability (±30-50% is common)

### For Production
- Monitor segment_stats growth rate
- Set retention policy for ride_segments (default: 90 days)
- Consider pruning bins with n=0 after initial bootstrap
- Add index on `(route_id, from_stop_id, to_stop_id)` for faster client queries

---

## References

- **GTFS Spec:** https://gtfs.org/schedule/reference/
- **BMTC Official:** https://mybmtc.karnataka.gov.in/
- **Data Source:** https://github.com/Vonter/bmtc-gtfs
- **Contact:** me@vonter.in
