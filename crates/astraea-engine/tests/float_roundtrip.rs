//! Request captured by candidateFloatRoundtrip.test.ts from the built WASM
//! aggregate_mass -> deriveMotorStation -> buildCandidateRequest app path.
//! NASA stack with explicit supported nose/mount edits; no as-flown claim.
#[test]
fn app_nasa_stack_aft_fallback_survives_json_dispatch() {
    let reply = astraea_engine::dispatch_json(
        "simulate_candidate",
        include_str!("fixtures/nasa-stack-candidate-envelope.json"),
    );
    let value: serde_json::Value = serde_json::from_str(&reply).unwrap();
    assert!(value.get("error").is_none(), "app candidate refused: {reply}");
    assert_eq!(value["ok"]["trajectory"]["finalTimeS"], 0.1);
}
