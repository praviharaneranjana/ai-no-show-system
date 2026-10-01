"""Build lk_locations.json from GeoNames LK.txt dump.

Filters for populated places (feature class P) in Sri Lanka.
Adds Colombo 1-15 postal zones with explicit aliases and coordinates.
Attribution: GeoNames (CC-BY 4.0).
"""
import io
import json
import os
import re
import urllib.request
import zipfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "lk_locations.json")

# GeoNames admin1 to province mapping for Sri Lanka
ADMIN1_PROVINCES = {
    "29": "Central Province",
    "30": "North Central Province",
    "31": "Northern Province",
    "32": "North Western Province",
    "33": "Sabaragamuwa Province",
    "34": "Southern Province",
    "35": "Uva Province",
    "36": "Western Province",
    "37": "Eastern Province",
}

# Admin2 to district mapping for Sri Lanka
ADMIN2_DISTRICTS = {
    "11": "Colombo", "12": "Gampaha", "13": "Kalutara",
    "21": "Kandy", "22": "Matale", "23": "Nuwara Eliya",
    "31": "Galle", "32": "Matara", "33": "Hambantota",
    "41": "Jaffna", "42": "Mannar", "43": "Vavuniya", "44": "Mullaitivu", "45": "Kilinochchi",
    "51": "Batticaloa", "52": "Ampara", "53": "Trincomalee",
    "61": "Kurunegala", "62": "Puttalam",
    "71": "Anuradhapura", "72": "Polonnaruwa",
    "81": "Badulla", "82": "Monaragala",
    "91": "Ratnapura", "92": "Kegalle",
}

COLOMBO_ZONES = [
    {"name": "Colombo 01", "aliases": ["Fort", "Colombo 1"], "lat": 6.9344, "lng": 79.8428, "district": "Colombo", "province": "Western Province", "kind": "city_district"},
    {"name": "Colombo 02", "aliases": ["Slave Island", "Kompanna Veediya", "Colombo 2"], "lat": 6.9198, "lng": 79.8486, "district": "Colombo", "province": "Western Province", "kind": "city_district"},
    {"name": "Colombo 03", "aliases": ["Kollupitiya", "Colpetty", "Colombo 3"], "lat": 6.9147, "lng": 79.8520, "district": "Colombo", "province": "Western Province", "kind": "city_district"},
    {"name": "Colombo 04", "aliases": ["Bambalapitiya", "Colombo 4"], "lat": 6.8939, "lng": 79.8546, "district": "Colombo", "province": "Western Province", "kind": "city_district"},
    {"name": "Colombo 05", "aliases": ["Havelock Town", "Kirulapone North", "Narahenpita", "Colombo 5"], "lat": 6.8866, "lng": 79.8691, "district": "Colombo", "province": "Western Province", "kind": "city_district"},
    {"name": "Colombo 06", "aliases": ["Wellawatte", "Pamankada", "Colombo 6"], "lat": 6.8721, "lng": 79.8603, "district": "Colombo", "province": "Western Province", "kind": "city_district"},
    {"name": "Colombo 07", "aliases": ["Cinnamon Gardens", "Colombo 7", "Kurunduwatta"], "lat": 6.9036, "lng": 79.8612, "district": "Colombo", "province": "Western Province", "kind": "city_district"},
    {"name": "Colombo 08", "aliases": ["Borella", "Colombo 8"], "lat": 6.9173, "lng": 79.8772, "district": "Colombo", "province": "Western Province", "kind": "city_district"},
    {"name": "Colombo 09", "aliases": ["Dematagoda", "Colombo 9"], "lat": 6.9290, "lng": 79.8800, "district": "Colombo", "province": "Western Province", "kind": "city_district"},
    {"name": "Colombo 10", "aliases": ["Maradana", "Panchikawatte", "Colombo 10"], "lat": 6.9281, "lng": 79.8659, "district": "Colombo", "province": "Western Province", "kind": "city_district"},
    {"name": "Colombo 11", "aliases": ["Pettah", "Colombo 11"], "lat": 6.9374, "lng": 79.8530, "district": "Colombo", "province": "Western Province", "kind": "city_district"},
    {"name": "Colombo 12", "aliases": ["Hultsdorf", "Colombo 12"], "lat": 6.9370, "lng": 79.8560, "district": "Colombo", "province": "Western Province", "kind": "city_district"},
    {"name": "Colombo 13", "aliases": ["Kotahena", "Kochchikade", "Colombo 13"], "lat": 6.9498, "lng": 79.8616, "district": "Colombo", "province": "Western Province", "kind": "city_district"},
    {"name": "Colombo 14", "aliases": ["Grandpass", "Colombo 14"], "lat": 6.9520, "lng": 79.8720, "district": "Colombo", "province": "Western Province", "kind": "city_district"},
    {"name": "Colombo 15", "aliases": ["Mutwal", "Modara", "Mattakkuliya", "Colombo 15"], "lat": 6.9660, "lng": 79.8780, "district": "Colombo", "province": "Western Province", "kind": "city_district"},
]

SUBURBS = [
    {"name": "Nugegoda", "aliases": ["Nugegoda East", "Nugegoda West"], "lat": 6.8649, "lng": 79.8997, "district": "Colombo", "province": "Western Province", "kind": "suburb", "pop": 65000},
    {"name": "Dehiwala", "aliases": ["Dehiwela", "Dehiwala-Mount Lavinia"], "lat": 6.8511, "lng": 79.8653, "district": "Colombo", "province": "Western Province", "kind": "city", "pop": 90000},
    {"name": "Mount Lavinia", "aliases": ["Mt Lavinia", "Galkissa"], "lat": 6.8389, "lng": 79.8653, "district": "Colombo", "province": "Western Province", "kind": "suburb", "pop": 80000},
    {"name": "Maharagama", "aliases": ["Maharagama Town"], "lat": 6.8480, "lng": 79.9265, "district": "Colombo", "province": "Western Province", "kind": "suburb", "pop": 75000},
    {"name": "Kotte", "aliases": ["Sri Jayawardenepura Kotte", "Sri Jayawardenapura"], "lat": 6.8905, "lng": 79.9179, "district": "Colombo", "province": "Western Province", "kind": "city", "pop": 115000},
    {"name": "Battaramulla", "aliases": ["Pelawatta", "Koswatta"], "lat": 6.9009, "lng": 79.9181, "district": "Colombo", "province": "Western Province", "kind": "suburb", "pop": 85000},
    {"name": "Rajagiriya", "aliases": ["Wel赋予", "Welikada"], "lat": 6.9089, "lng": 79.8953, "district": "Colombo", "province": "Western Province", "kind": "suburb", "pop": 55000},
    {"name": "Malabe", "aliases": ["Malambe", "Thalahena"], "lat": 6.9061, "lng": 79.9582, "district": "Colombo", "province": "Western Province", "kind": "suburb", "pop": 60000},
    {"name": "Kottawa", "aliases": ["Makumbura"], "lat": 6.8411, "lng": 79.9654, "district": "Colombo", "province": "Western Province", "kind": "suburb", "pop": 50000},
    {"name": "Homagama", "aliases": ["Homagama Town"], "lat": 6.8439, "lng": 80.0024, "district": "Colombo", "province": "Western Province", "kind": "town", "pop": 45000},
    {"name": "Kiribathgoda", "aliases": ["Kiribathgoda Town"], "lat": 6.9780, "lng": 79.9260, "district": "Gampaha", "province": "Western Province", "kind": "suburb", "pop": 70000},
    {"name": "Kadawatha", "aliases": ["Kadawatha Interchange"], "lat": 7.0014, "lng": 79.9533, "district": "Gampaha", "province": "Western Province", "kind": "suburb", "pop": 65000},
    {"name": "Kelaniya", "aliases": ["Pelyagoda", "Peliyagoda"], "lat": 6.9553, "lng": 79.9220, "district": "Gampaha", "province": "Western Province", "kind": "suburb", "pop": 50000},
    {"name": "Moratuwa", "aliases": ["Rawatawatta", "Katubedda"], "lat": 6.7730, "lng": 79.8816, "district": "Colombo", "province": "Western Province", "kind": "city", "pop": 160000},
    {"name": "Panadura", "aliases": ["Panadura Town"], "lat": 6.7132, "lng": 79.9026, "district": "Kalutara", "province": "Western Province", "kind": "city", "pop": 110000},
    {"name": "Negombo", "aliases": ["Meegamuwa"], "lat": 7.2083, "lng": 79.8358, "district": "Gampaha", "province": "Western Province", "kind": "city", "pop": 145000},
]


def normalise_str(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def build_locations():
    locations = []
    seen = set()

    def add_loc(name, district, province, kind, lat, lng, pop=None, aliases=None, source="geonames"):
        name_norm = normalise_str(name)
        dist_key = (district or "").strip().lower()
        key = (name_norm, dist_key)
        if key in seen:
            return
        seen.add(key)
        locations.append({
            "name": name,
            "name_norm": name_norm,
            "district": district,
            "province": province,
            "kind": kind,
            "latitude": round(float(lat), 5),
            "longitude": round(float(lng), 5),
            "population": int(pop) if pop else None,
            "aliases": aliases or [],
            "source": source,
        })

    # 1. Add Colombo 1-15
    for z in COLOMBO_ZONES:
        add_loc(z["name"], z["district"], z["province"], z["kind"], z["lat"], z["lng"], 50000, z["aliases"], "manual")
        # Also add common named areas as separate searchable entries with Colombo 1-15 as alias
        for alias in z["aliases"]:
            if not alias.startswith("Colombo"):
                add_loc(alias, z["district"], z["province"], "suburb", z["lat"], z["lng"], 30000, [z["name"]], "manual")

    # 2. Add Key Suburbs & District Capitals
    for s in SUBURBS:
        add_loc(s["name"], s["district"], s["province"], s["kind"], s["lat"], s["lng"], s.get("pop"), s.get("aliases"), "manual")

    # 3. Parse GeoNames LK.txt dump
    lk_txt_path = "/tmp/LK.txt"
    if not os.path.exists(lk_txt_path):
        zip_path = "/tmp/LK.zip"
        if os.path.exists(zip_path):
            with zipfile.ZipFile(zip_path) as z:
                with open(lk_txt_path, "wb") as f:
                    f.write(z.read("LK.txt"))

    if os.path.exists(lk_txt_path):
        with open(lk_txt_path, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split("\t")
                if len(parts) < 15:
                    continue
                name = parts[1]
                asciiname = parts[2]
                alternatenames = parts[3].split(",") if parts[3] else []
                lat = parts[4]
                lng = parts[5]
                f_class = parts[6]
                f_code = parts[7]
                admin1 = parts[10]
                admin2 = parts[11]
                pop = parts[14]

                # Filter: Populated places only (Class P)
                if f_class != "P":
                    continue

                province = ADMIN1_PROVINCES.get(admin1)
                district = ADMIN2_DISTRICTS.get(admin2)
                kind = "city" if f_code in ("PPLC", "PPLA", "PPLA2") else "town"

                # Filter clean aliases
                clean_aliases = []
                for a in alternatenames[:5]:
                    a_clean = a.strip()
                    if a_clean and a_clean != name and len(a_clean) > 2:
                        clean_aliases.append(a_clean)

                pop_int = int(pop) if pop.isdigit() and int(pop) > 0 else None
                add_loc(name, district, province, kind, lat, lng, pop_int, clean_aliases, "geonames")

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        json.dump(locations, out, ensure_ascii=False, indent=2)

    print(f"Built {len(locations)} locations into {OUTPUT_FILE}")


if __name__ == "__main__":
    build_locations()
