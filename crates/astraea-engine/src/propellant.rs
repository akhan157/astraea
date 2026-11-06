//! Propellant IPC DTOs: recipe in, theoretical rocket performance out
//! (`astraea_core::propellant`). camelCase wire format; SI units throughout
//! (Pa, K, kg/m³, J/kg, m/s, s).

use astraea_core::propellant::{
    self as core, Exit, Ingredient, Performance, PropellantResult, RecipeItem, Station,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IngredientDto {
    pub id: String,
    pub name: String,
    /// Element symbol → atoms per formula unit, e.g. {"K":1,"N":1,"O":3}.
    pub formula: BTreeMap<String, f64>,
    /// Heat of formation at 298.15 K, J/mol.
    pub hf_j_per_mol: f64,
    /// kg/m³.
    pub density: f64,
    #[serde(default)]
    pub source: String,
}

impl From<Ingredient> for IngredientDto {
    fn from(i: Ingredient) -> Self {
        IngredientDto {
            id: i.id,
            name: i.name,
            formula: i.formula.into_iter().collect(),
            hf_j_per_mol: i.hf_j_per_mol,
            density: i.density,
            source: i.source,
        }
    }
}

impl From<IngredientDto> for Ingredient {
    fn from(d: IngredientDto) -> Self {
        Ingredient {
            id: d.id,
            name: d.name,
            formula: d.formula.into_iter().collect(),
            hf_j_per_mol: d.hf_j_per_mol,
            density: d.density,
            source: d.source,
        }
    }
}

/// One recipe line: a built-in ingredient by id, or a full custom ingredient.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeItemDto {
    pub ingredient_id: Option<String>,
    pub ingredient: Option<IngredientDto>,
    /// Mass or percent; the recipe is normalized.
    pub mass: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropellantRequestDto {
    pub recipe: Vec<RecipeItemDto>,
    /// Pa.
    pub chamber_pressure: f64,
    /// Exit pressure, Pa (give this or `area_ratio`).
    pub exit_pressure: Option<f64>,
    pub area_ratio: Option<f64>,
    /// Pa; defaults to 101 325.
    pub ambient_pressure: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StationDto {
    pub pressure: f64,
    pub temperature: f64,
    /// CEA "M" (1/n), kg/kmol.
    pub mol_weight: f64,
    pub gamma: f64,
    pub cp: f64,
    pub sound_speed: f64,
    pub velocity: f64,
    pub mach: f64,
    pub density: f64,
    /// Ae/At; null in the chamber.
    pub area_ratio: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceDto {
    pub chamber: StationDto,
    pub throat: StationDto,
    pub exit: StationDto,
    pub cstar: f64,
    pub cf: f64,
    pub cf_vac: f64,
    pub cf_ambient: f64,
    pub isp: f64,
    pub isp_vac: f64,
    pub isp_ambient: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeciesDto {
    pub name: String,
    pub mole_fraction: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PropellantResultDto {
    pub density: f64,
    pub enthalpy: f64,
    /// Shifting-equilibrium expansion.
    pub equilibrium: PerformanceDto,
    /// Composition frozen at the chamber.
    pub frozen: PerformanceDto,
    pub chamber_species: Vec<SpeciesDto>,
    pub exit_species: Vec<SpeciesDto>,
}

fn station(s: &Station) -> StationDto {
    StationDto {
        pressure: s.pressure,
        temperature: s.temperature,
        mol_weight: s.m,
        gamma: s.gamma,
        cp: s.cp,
        sound_speed: s.sound_speed,
        velocity: s.velocity,
        mach: s.mach,
        density: s.density,
        area_ratio: s.area_ratio.is_finite().then_some(s.area_ratio),
    }
}

fn performance(p: &Performance) -> PerformanceDto {
    PerformanceDto {
        chamber: station(&p.chamber),
        throat: station(&p.throat),
        exit: station(&p.exit),
        cstar: p.cstar,
        cf: p.cf,
        cf_vac: p.cf_vac,
        cf_ambient: p.cf_ambient,
        isp: p.isp,
        isp_vac: p.isp_vac,
        isp_ambient: p.isp_ambient,
    }
}

fn species(v: &[(String, f64)]) -> Vec<SpeciesDto> {
    v.iter()
        .map(|(name, x)| SpeciesDto { name: name.clone(), mole_fraction: *x })
        .collect()
}

pub fn to_result_dto(r: &PropellantResult) -> PropellantResultDto {
    PropellantResultDto {
        density: r.density,
        enthalpy: r.enthalpy,
        equilibrium: performance(&r.equilibrium),
        frozen: performance(&r.frozen),
        chamber_species: species(&r.chamber_species),
        exit_species: species(&r.exit_species),
    }
}

pub fn run(req: PropellantRequestDto) -> Result<PropellantResultDto, String> {
    let recipe = req
        .recipe
        .into_iter()
        .map(|item| {
            let ingredient = match (item.ingredient, item.ingredient_id) {
                (Some(custom), _) => Ingredient::from(custom),
                (None, Some(id)) => core::ingredient(&id)
                    .ok_or_else(|| format!("unknown ingredient id: {id}"))?,
                (None, None) => return Err("recipe line needs ingredientId or ingredient".into()),
            };
            Ok(RecipeItem { ingredient, mass: item.mass })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let exit = match (req.exit_pressure, req.area_ratio) {
        (Some(p), None) => Exit::Pressure(p),
        (None, Some(e)) => Exit::AreaRatio(e),
        _ => return Err("give exactly one of exitPressure or areaRatio".into()),
    };
    let r = core::rocket_performance(
        &recipe,
        req.chamber_pressure,
        exit,
        req.ambient_pressure.unwrap_or(101_325.0),
    )?;
    Ok(to_result_dto(&r))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn knsb_round_trip_over_the_wire() {
        let req: PropellantRequestDto = serde_json::from_value(serde_json::json!({
            "recipe": [
                {"ingredientId": "potassium_nitrate", "mass": 65},
                {"ingredientId": "sorbitol", "mass": 35}
            ],
            "chamberPressure": 6894757.293168,
            "exitPressure": 101325.0
        }))
        .unwrap();
        let out = run(req).unwrap();
        // NASA CEA: Tc 1601.35 K, c* 911.3 m/s, Isp 1503.7 m/s.
        assert!((out.equilibrium.chamber.temperature - 1601.35).abs() < 0.5);
        assert!((out.equilibrium.cstar - 911.3).abs() < 0.5);
        let wire = serde_json::to_value(&out).unwrap();
        assert!(wire["equilibrium"]["chamber"]["areaRatio"].is_null());
        assert!(wire["equilibrium"]["ispVac"].is_number());
        assert!(wire["chamberSpecies"][0]["moleFraction"].is_number());
    }

    #[test]
    fn custom_ingredient_and_errors() {
        let custom = IngredientDto::from(core::ingredient("sorbitol").unwrap());
        let req: PropellantRequestDto = serde_json::from_value(serde_json::json!({
            "recipe": [
                {"ingredientId": "potassium_nitrate", "mass": 65},
                {"ingredient": serde_json::to_value(&custom).unwrap(), "mass": 35}
            ],
            "chamberPressure": 5e6,
            "areaRatio": 8.0
        }))
        .unwrap();
        assert!(run(req).is_ok());
        let bad: PropellantRequestDto = serde_json::from_value(serde_json::json!({
            "recipe": [{"ingredientId": "unobtainium", "mass": 1}],
            "chamberPressure": 5e6, "exitPressure": 1e5
        }))
        .unwrap();
        assert!(run(bad).unwrap_err().contains("unknown ingredient"));
        let both: PropellantRequestDto = serde_json::from_value(serde_json::json!({
            "recipe": [{"ingredientId": "sorbitol", "mass": 1}],
            "chamberPressure": 5e6, "exitPressure": 1e5, "areaRatio": 8.0
        }))
        .unwrap();
        assert!(run(both).is_err());
    }
}
