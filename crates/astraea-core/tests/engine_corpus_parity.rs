//! Engine-corpus parity for the built-up provider (RMP19 C08).
//!
//! The engine CSVs are **not committed**. Point `ASTRAEA_ENGINE_CORPUS` at the
//! research corpus directory (`.../extract/native-runs/corpus`) to run this
//! test; without it the test skips loudly and CI stays green.
//!
//! Every file is checked against the committed manifest (row count + SHA-256)
//! before evaluation. Each design's worst relative residual is printed and
//! classified into the exact tier (<= 2e-6). Set `ASTRAEA_C08_OUT` to write the
//! per-design report as JSON evidence.

mod common;

use astraea_core::calibrated::{evaluate, CpMethod, DragHighMachComponents, EvalOptions};
use common::{design_from_json, file_sha256, load_rows, manifest, rel_err, EXACT_TOLERANCE};
use std::path::PathBuf;

type Slot = fn(&DragHighMachComponents) -> Option<f64>;

const COMPONENT_COLUMNS: [(&str, Slot); 11] = [
    ("bodyFric", |c| Some(c.body_friction)),
    ("bodyPress", |c| c.body_pressure),
    ("bodyBase", |c| Some(c.body_base)),
    ("finFric", |c| c.fin_friction_pressure),
    ("finInterf", |c| Some(c.fin_interference)),
    ("finBase", |c| Some(c.fin_base)),
    ("protub", |c| Some(c.protuberance)),
    ("noseWave", |c| c.nose_wave),
    ("finFricSup", |c| c.fin_friction_pressure_sup),
    ("finInterfSup", |c| c.fin_interference_sup),
    ("finExtra", |c| c.fin_extra),
];

#[test]
fn provider_reproduces_the_engine_corpus_by_design() {
    let Some(corpus) = std::env::var_os("ASTRAEA_ENGINE_CORPUS").map(PathBuf::from) else {
        eprintln!(
            "SKIP engine corpus parity: ASTRAEA_ENGINE_CORPUS is not set. \
             The engine CSVs are deliberately not committed; set it to the research \
             corpus directory to run this gate."
        );
        return;
    };
    assert!(
        corpus.is_dir(),
        "ASTRAEA_ENGINE_CORPUS must name a directory (got {})",
        corpus.display()
    );

    let designs = manifest();
    assert_eq!(designs.len(), 40, "manifest must pin 40 designs");
    let manifest_rows: usize = designs.iter().map(|d| d.rows).sum();
    assert_eq!(manifest_rows, 36_936, "manifest must pin 36,936 rows");

    let mut checked_rows = 0usize;
    let mut violations: Vec<String> = Vec::new();
    let mut report: Vec<String> = Vec::new();
    let mut worst_overall = (0.0f64, String::new());

    for entry in &designs {
        if entry.duplicate_of.is_some() {
            continue;
        }
        let points = corpus.join(&entry.slug).join("points.csv");
        let design_path = corpus.join(&entry.slug).join("design.json");
        assert!(points.is_file(), "missing {}", points.display());
        assert!(design_path.is_file(), "missing {}", design_path.display());

        let digest = file_sha256(&points);
        assert_eq!(
            digest, entry.sha256,
            "{}: points.csv does not match the manifest hash",
            entry.slug
        );
        let design = design_from_json(
            &std::fs::read_to_string(&design_path).expect("read design.json"),
        );
        let rows = load_rows(&corpus, &entry.slug);
        assert_eq!(
            rows.len(),
            entry.rows,
            "{}: row count does not match the manifest",
            entry.slug
        );

        let mut worst = (0.0f64, String::new());
        for row in rows {
            let options = EvalOptions {
                mach: row.mach,
                alpha_deg: row.alpha_deg,
                method: if row.rogers { CpMethod::Rogers } else { CpMethod::Barrowman },
                nozzle_exit_in: Some(row.nozzle_exit_in),
                altitude_ft: None,
                site: None,
            };
            let at = format!(
                "{} {:?} M{} a{} noz{}",
                entry.slug, options.method, row.mach, row.alpha_deg, row.nozzle_exit_in
            );
            let point = match evaluate(&design, &options) {
                Ok(point) => point,
                Err(error) => {
                    violations.push(format!("{at}: unexpected error {error}"));
                    continue;
                }
            };
            let mut check = |column: &str, actual: f64| {
                let expected = row.require(column);
                let error = rel_err(actual, expected);
                if error > worst.0 {
                    worst = (error, format!("{at} {column}: got={actual} exp={expected}"));
                }
                if error > EXACT_TOLERANCE {
                    violations.push(format!(
                        "{at} {column}: err={error:.3e} > {EXACT_TOLERANCE:e} (got={actual} exp={expected})"
                    ));
                }
            };
            check("CD", point.cd);
            check("CDoff", point.cd_power_off);
            check("CDon", point.cd_power_on);
            check("CAoff", point.ca_power_off);
            check("CAon", point.ca_power_on);
            check("RE", point.reynolds);
            check("CL", point.cl);
            check("CN", point.cn);
            check("CNpotential", point.cn_potential);
            check("CNalpha0_4", point.cn_alpha04);
            check("CP", point.cp_in);
            check("CP0_4", point.cp04_in);
            check("CNviscous", point.cn_viscous);
            let mut presence_mismatches: Vec<String> = Vec::new();
            for (column, slot) in COMPONENT_COLUMNS {
                let actual = point.components.as_ref().and_then(slot);
                match (row.get(column), actual) {
                    (None, None) => {}
                    (Some(_), Some(value)) => check(column, value),
                    (expected, actual) => presence_mismatches.push(format!(
                        "{at} {column}: presence mismatch (corpus {expected:?}, model {actual:?})"
                    )),
                }
            }
            violations.extend(presence_mismatches);
            checked_rows += 1;
        }

        if worst.0 > worst_overall.0 {
            worst_overall = worst.clone();
        }
        let tier = if worst.0 <= EXACT_TOLERANCE { "exact" } else { "violation" };
        println!(
            "{}: rows={} worst={:.3e} tier={} at {}",
            entry.slug, entry.rows, worst.0, tier, worst.1
        );
        report.push(format!(
            "{{\"slug\":\"{}\",\"rows\":{},\"maxRelativeResidual\":{:.17e},\"tier\":\"{}\"}}",
            entry.slug, entry.rows, worst.0, tier
        ));
    }

    println!(
        "engine corpus: designs={} rows={} worst={:.3e} at {}",
        designs.len(),
        checked_rows,
        worst_overall.0,
        worst_overall.1
    );
    if let Some(out) = std::env::var_os("ASTRAEA_C08_OUT") {
        let body = format!(
            "{{\n  \"gate\": \"RMP19-C08\",\n  \"tier\": {:.1e},\n  \"designs\": {},\n  \"rows\": {},\n  \"worst\": {{\"relative\": {:.17e}, \"at\": \"{}\"}},\n  \"perDesign\": [\n    {}\n  ]\n}}\n",
            EXACT_TOLERANCE,
            designs.len(),
            checked_rows,
            worst_overall.0,
            worst_overall.1,
            report.join(",\n    ")
        );
        std::fs::write(&out, body).unwrap_or_else(|e| panic!("write {}: {e}", PathBuf::from(out).display()));
    }

    assert_eq!(checked_rows, 36_936, "every manifest row must be evaluated");
    assert!(
        violations.is_empty(),
        "{} corpus violations (showing up to 20):\n{}",
        violations.len(),
        violations[..violations.len().min(20)].join("\n")
    );
}
