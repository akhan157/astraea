//! Model input of the calibrated method (mirror of TS `CalibratedDesign`).
//!
//! Exactly the fields the aero passes read. Lengths in inches, stations from
//! the nose tip. The TS side serialises corpus designs to
//! `extract/native-runs/corpus/<slug>/design.json`; names below map 1:1 to
//! those JSON keys (camelCase there, snake_case here).

use super::CalibratedError;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NoseShape {
    TangentOgive,
    VonKarmanOgive,
    LvHaack,
    Conical,
    Parabolic,
    Elliptical,
    PowerLaw,
}

impl NoseShape {
    /// calibrated's display name (CDX1 `NoseCone.Shape`).
    pub fn from_calibrated_name(name: &str) -> Result<Self, CalibratedError> {
        Ok(match name {
            "Tangent Ogive" => NoseShape::TangentOgive,
            "Von Karman Ogive" => NoseShape::VonKarmanOgive,
            "LV-Haack" => NoseShape::LvHaack,
            "Conical" => NoseShape::Conical,
            "Parabolic" => NoseShape::Parabolic,
            "Elliptical" => NoseShape::Elliptical,
            "Power Law" => NoseShape::PowerLaw,
            other => return Err(CalibratedError::Unsupported(format!("unsupported NoseCone shape: {other}"))),
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SurfaceFinish {
    SmoothZeroRoughness,
    Polished,
    SheetMetal,
    SmoothPaint,
    CamouflagePaint,
    RoughCamouflagePaint,
    GalvanizedMetal,
    CastIronVeryRough,
}

impl SurfaceFinish {
    pub fn from_calibrated_name(name: &str) -> Result<Self, CalibratedError> {
        Ok(match name {
            "Smooth (Zero Roughness)" => SurfaceFinish::SmoothZeroRoughness,
            "Polished" => SurfaceFinish::Polished,
            "Sheet Metal" => SurfaceFinish::SheetMetal,
            "Smooth Paint" => SurfaceFinish::SmoothPaint,
            "Camouflage Paint" => SurfaceFinish::CamouflagePaint,
            "Rough Camouflage Paint" => SurfaceFinish::RoughCamouflagePaint,
            "Galvanized Metal" => SurfaceFinish::GalvanizedMetal,
            "Cast Iron (Very Rough)" => SurfaceFinish::CastIronVeryRough,
            other => return Err(CalibratedError::Unsupported(format!("unknown surface finish: {other}"))),
        })
    }

    /// Equivalent sand roughness (inches) — TS `ROUGHNESS`.
    pub fn roughness_in(self) -> f64 {
        match self {
            SurfaceFinish::SmoothZeroRoughness => 0.0,
            SurfaceFinish::Polished => 5e-05,
            SurfaceFinish::SheetMetal => 0.00016,
            SurfaceFinish::SmoothPaint => 0.00025,
            SurfaceFinish::CamouflagePaint => 0.0004,
            SurfaceFinish::RoughCamouflagePaint => 0.0012,
            SurfaceFinish::GalvanizedMetal => 0.006,
            SurfaceFinish::CastIronVeryRough => 0.01,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Airfoil {
    DoubleWedge,
    Hexagonal,
    SingleWedge,
    HexagonalBluntBase,
    Biconvex,
    SubsonicNaca,
    Rounded,
    Square,
}

impl Airfoil {
    pub fn from_calibrated_name(name: &str) -> Result<Self, CalibratedError> {
        Ok(match name {
            "Double Wedge" => Airfoil::DoubleWedge,
            "Hexagonal" => Airfoil::Hexagonal,
            "Single Wedge" => Airfoil::SingleWedge,
            "Hexagonal Blunt Base" => Airfoil::HexagonalBluntBase,
            "Biconvex" => Airfoil::Biconvex,
            "Subsonic NACA" => Airfoil::SubsonicNaca,
            "Rounded" => Airfoil::Rounded,
            "Square" => Airfoil::Square,
            other => return Err(CalibratedError::Unsupported(format!("unsupported fin airfoil section: {other}"))),
        })
    }

    /// Sharp-edged sections whose leading-edge bevel (fx1) sets the sweep/thickness factor.
    pub fn is_beveled(self) -> bool {
        matches!(
            self,
            Airfoil::DoubleWedge | Airfoil::Hexagonal | Airfoil::SingleWedge | Airfoil::HexagonalBluntBase | Airfoil::Biconvex
        )
    }
}

/// One fin set (TS `FinDesign`).
#[derive(Clone, Debug, PartialEq)]
pub struct Fin {
    pub chord: f64,
    pub tip: f64,
    pub sweep: f64,
    pub span: f64,
    pub thickness: f64,
    pub count: u32,
    pub airfoil: Airfoil,
    /// Raw CDX1 location, measured forward from the parent's aft end.
    pub location: f64,
    /// Leading-edge bevel length.
    pub fx1: f64,
    /// Trailing-edge bevel length (supersonic extra drag only).
    pub fx3: f64,
    pub le_radius: f64,
    /// Local body diameter at the fin (parent tube, or FinCan diameter).
    pub parent_diameter: f64,
    /// Tapered diameter at the fin trailing station (overhang onto a boattail).
    pub rear_diameter: f64,
    /// Nose-referenced leading-edge station of the fin root.
    pub leading_edge: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PartKind {
    Nose,
    Body,
    Expansion,
    Reducer,
}

impl PartKind {
    pub fn from_calibrated_name(name: &str) -> Result<Self, CalibratedError> {
        Ok(match name {
            "nose" => PartKind::Nose,
            "body" => PartKind::Body,
            "expansion" => PartKind::Expansion,
            "reducer" => PartKind::Reducer,
            other => return Err(CalibratedError::Unsupported(format!("unsupported chain part type: {other}"))),
        })
    }
}

/// One sustainer chain part (TS `CalibratedComponent`). Optional TS fields are
/// `None` exactly where the TS object omits them.
#[derive(Clone, Debug, PartialEq)]
pub struct Part {
    pub kind: PartKind,
    pub length: f64,
    pub diameter: f64,
    /// Aft diameter of expansion/reducer frustums.
    pub rear_diameter: Option<f64>,
    pub blunt_radius: Option<f64>,
    pub location: f64,
    pub rail_diameter: Option<f64>,
    pub rail_height: Option<f64>,
    pub lug_diameter: Option<f64>,
    pub shoe_area: Option<f64>,
    pub fin: Option<Fin>,
}

impl Part {
    /// Aft diameter: `rear_diameter` for frustums, else `diameter` (TS `rearDiameter ?? diameter`).
    pub fn aft_diameter(&self) -> f64 {
        self.rear_diameter.unwrap_or(self.diameter)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MachAlt {
    pub mach: f64,
    pub alt_ft: f64,
}

/// TS `CalibratedDesign`.
#[derive(Clone, Debug, PartialEq)]
pub struct Design {
    pub nose_shape: NoseShape,
    /// CDX1 PowerLaw exponent, required when `nose_shape` is `PowerLaw`.
    pub nose_power_law_exponent: Option<f64>,
    pub surface: SurfaceFinish,
    pub turbulence: bool,
    /// Sustainer nozzle exit diameter (in); 0 when absent.
    pub sustainer_nozzle: f64,
    /// Ordered sustainer model chain (nose + shrunk bodies + expansions + reducers + followers).
    pub chain: Vec<Part>,
    /// Sustainer wetted length be.
    pub sustainer_length: f64,
    /// Max model diameter cd.
    pub max_diameter: f64,
    /// First-part base diameter cc.
    pub first_diameter: f64,
    /// Last-part base diameter cb.
    pub base_diameter: f64,
    /// Mach-altitude ladder, sorted by Mach.
    pub mach_alt: Vec<MachAlt>,
}

impl Design {
    /// Validated CDX1 exponent for a Power Law nose.
    pub fn power_law_exponent(&self) -> Result<f64, CalibratedError> {
        match self.nose_power_law_exponent {
            Some(d) if d.is_finite() && (0.0..=1.0).contains(&d) => Ok(d),
            Some(d) => Err(CalibratedError::Unsupported(format!(
                "Power Law exponent outside the engine range [0, 1]: {d}"
            ))),
            None => Err(CalibratedError::Unsupported(
                "power-law nose requires its exponent".into(),
            )),
        }
    }
}

/// Interpolated evaluation altitude (ft) for a Mach number on the ladder; 0 without one.
pub fn altitude_for_mach(design: &Design, mach: f64) -> f64 {
    let ladder = &design.mach_alt;
    let Some(first) = ladder.first() else { return 0.0 };
    if mach <= first.mach {
        return first.alt_ft;
    }
    for i in 1..ladder.len() {
        if mach <= ladder[i].mach {
            let prev = ladder[i - 1];
            let next = ladder[i];
            if next.mach == prev.mach {
                return next.alt_ft;
            }
            let t = (mach - prev.mach) / (next.mach - prev.mach);
            return prev.alt_ft + t * (next.alt_ft - prev.alt_ft);
        }
    }
    ladder[ladder.len() - 1].alt_ft
}
