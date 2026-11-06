#!/usr/bin/env python3
"""Generate scripts/cea-propellant-corpus.json: NASA CEA rocket results for
propellant recipes, used as the reference by crates/astraea-core/src/propellant.rs.

Requires RocketCEA (`pip install rocketcea`, needs gfortran), which runs the
NASA Glenn CEA2 Fortran code. Ingredient definitions below must equal the
Rust `ingredient_library()`; the Rust test checks that.

Usage: python3 scripts/cea-propellant-corpus.py
"""
import json
import re

from rocketcea.cea_obj import CEA_Obj, add_new_fuel, add_new_oxidizer

PSI = 6894.757293168
ATM_PSI = 14.6959487755

# id: (formula, Hf J/mol, density kg/m3, role)
ING = {
    "ammonium_perchlorate": ({"N": 1, "H": 4, "CL": 1, "O": 4}, -295767.0, 1950.0, "ox"),
    "potassium_nitrate": ({"K": 1, "N": 1, "O": 3}, -494000.0, 2109.0, "ox"),
    "ammonium_nitrate": ({"N": 2, "H": 4, "O": 3}, -365600.0, 1725.0, "ox"),
    "potassium_perchlorate": ({"K": 1, "CL": 1, "O": 4}, -432750.0, 2520.0, "ox"),
    "aluminum": ({"AL": 1}, 0.0, 2700.0, "fuel"),
    "magnesium": ({"MG": 1}, 0.0, 1738.0, "fuel"),
    "sulfur": ({"S": 1}, 0.0, 2070.0, "fuel"),
    "iron_oxide": ({"FE": 2, "O": 3}, -824248.0, 5240.0, "fuel"),
    "htpb": ({"C": 7.3165, "H": 10.3360, "O": 0.1063}, 5020.8, 922.0, "fuel"),
    "sorbitol": ({"C": 6, "H": 14, "O": 6}, -1353700.0, 1489.0, "fuel"),
    "dextrose": ({"C": 6, "H": 12, "O": 6}, -1273300.0, 1540.0, "fuel"),
    "sucrose": ({"C": 12, "H": 22, "O": 11}, -2226100.0, 1587.0, "fuel"),
}

CASES = [
    ("KNSB 65/35", {"potassium_nitrate": 65, "sorbitol": 35}, 1000, "pe", ATM_PSI),
    ("KNSB 65/35 low Pc", {"potassium_nitrate": 65, "sorbitol": 35}, 500, "pe", ATM_PSI),
    ("KNSB 65/35 eps 8", {"potassium_nitrate": 65, "sorbitol": 35}, 1000, "eps", 8.0),
    ("KNDX 65/35", {"potassium_nitrate": 65, "dextrose": 35}, 1000, "pe", ATM_PSI),
    ("KNSU 65/35", {"potassium_nitrate": 65, "sucrose": 35}, 1000, "pe", ATM_PSI),
    ("KNSB 60/40", {"potassium_nitrate": 60, "sorbitol": 40}, 800, "pe", ATM_PSI),
    ("APCP 70/18/12", {"ammonium_perchlorate": 70, "aluminum": 18, "htpb": 12}, 1000, "pe", ATM_PSI),
    ("APCP 70/18/12 low Pc", {"ammonium_perchlorate": 70, "aluminum": 18, "htpb": 12}, 500, "pe", ATM_PSI),
    ("APCP 70/18/12 eps 10", {"ammonium_perchlorate": 70, "aluminum": 18, "htpb": 12}, 1500, "eps", 10.0),
    ("AP/HTPB 80/20", {"ammonium_perchlorate": 80, "htpb": 20}, 1000, "pe", ATM_PSI),
    ("AP/Al/HTPB/Fe2O3", {"ammonium_perchlorate": 68, "aluminum": 18, "htpb": 13, "iron_oxide": 1}, 1000, "pe", ATM_PSI),
    ("AP/Mg/HTPB", {"ammonium_perchlorate": 70, "magnesium": 15, "htpb": 15}, 1000, "pe", ATM_PSI),
    ("AN/HTPB 80/20", {"ammonium_nitrate": 80, "htpb": 20}, 1000, "pe", ATM_PSI),
    ("KP/HTPB 80/20", {"potassium_perchlorate": 80, "htpb": 20}, 1000, "pe", ATM_PSI),
]


def card(kind, items):
    lines = []
    for iid, wt in items:
        f, hf, rho, _ = ING[iid]
        formula = " ".join(f"{e} {c}" for e, c in f.items())
        lines.append(f"{kind} {iid[:15]} {formula} wt%={wt:.6f}")
        lines.append(f"   h,kj/mol={hf / 1000.0:.4f} t(k)=298.15 rho={rho / 1000.0:.4f}")
    return "\n".join(lines)


ROWS = {
    "P, BAR": "p_bar", "T, K": "t", "M, (1/n)": "m", "GAMMAs": "gamma",
    "SON VEL,M/SEC": "son", "MACH NUMBER": "mach", "Ae/At": "ae_at",
    "CSTAR, M/SEC": "cstar", "CF": "cf", "Ivac, M/SEC": "ivac", "Isp, M/SEC": "isp",
}


def parse(text):
    out, species = {}, {}
    in_frac = False
    for line in text.splitlines():
        key = line[:17].strip()
        if key == "Cp, KJ/(KG)(K)" and "cp" not in out:
            out["cp"] = [float(v) for v in line[17:].split()]
        elif key in ROWS and ROWS[key] not in out:
            out[ROWS[key]] = [float(v) for v in line[17:].split()]
        if "MOLE FRACTIONS" in line:
            in_frac = True
            continue
        if in_frac:
            if line.strip().startswith("*") and "THERMODYNAMIC" in line:
                break
            name = None
            for tok in line.split():
                tok = tok.lstrip("*")
                try:
                    val = float(re.sub(r"(\d)-(\d)", r"\1e-\2", tok))
                except ValueError:
                    name = tok
                    species.setdefault(name, [])
                    continue
                if name is not None:
                    species[name].append(val)
    out["species"] = species
    return out


def run(name, recipe, pc_psi, mode, value):
    ox = [(k, v) for k, v in recipe.items() if ING[k][3] == "ox"]
    fu = [(k, v) for k, v in recipe.items() if ING[k][3] == "fuel"]
    tag = re.sub(r"\W", "", name)
    add_new_oxidizer("OX" + tag, card("oxid", ox))
    add_new_fuel("FU" + tag, card("fuel", fu))
    c = CEA_Obj(oxName="OX" + tag, fuelName="FU" + tag)
    mr = sum(v for _, v in ox) / sum(v for _, v in fu)
    res = {}
    for frozen in (0, 1):
        kw = dict(Pc=pc_psi, MR=mr, short_output=1, output="siunits", frozen=frozen)
        if mode == "pe":
            kw["PcOvPe"] = pc_psi / value
            kw["eps"] = None
        else:
            kw["eps"] = value
        text = c.get_full_cea_output(**kw)
        res["frozen" if frozen else "equilibrium"] = parse(text)
    return {
        "name": name,
        "recipe": recipe,
        "pc_pa": pc_psi * PSI,
        "exit": {"pressure_pa": value * PSI} if mode == "pe" else {"area_ratio": value},
        **res,
    }


def main():
    corpus = {
        "source": "NASA CEA2 (Glenn, 2002) via RocketCEA; rocket problem, infinite-area combustor",
        "columns": "0 = chamber, 1 = throat, 2 = exit (extra columns ignored)",
        "ingredients": {k: {"formula": v[0], "hf_j_per_mol": v[1], "density": v[2]} for k, v in ING.items()},
        "cases": [run(*c) for c in CASES],
    }
    with open("scripts/cea-propellant-corpus.json", "w") as f:
        json.dump(corpus, f, indent=1)
    for case in corpus["cases"]:
        e = case["equilibrium"]
        print(f'{case["name"]:24s} Tc {e["t"][0]:8.2f}  c* {e["cstar"][0]:7.1f}  Isp {e["isp"][1]:7.1f}  eps {e["ae_at"][1]:.3f}')


if __name__ == "__main__":
    main()
