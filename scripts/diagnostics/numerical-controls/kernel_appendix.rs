
// N1 DIAGNOSTIC ONLY: appended to a generated external six_dof.rs copy.
// Production preparation, loads, integrator arithmetic and dense output remain
// verbatim. Controls/counters are local to the single native process thread.
use std::cell::RefCell;

#[derive(Clone, Copy, Debug)]
pub struct N1Controls {
    pub ordinary_scale: f64,
    pub event_scale: f64,
    pub event_time_tolerance: f64,
}
impl Default for N1Controls {
    fn default() -> Self { Self { ordinary_scale: 1.0, event_scale: 1.0, event_time_tolerance: 1e-5 } }
}
#[derive(Clone, Copy, Debug, Default)]
pub struct N1PhaseCounts { pub attempted: u64, pub accepted: u64, pub rejected: u64, pub segments: u64 }
#[derive(Clone, Copy, Debug, Default)]
pub struct N1Counts {
    pub ordinary: N1PhaseCounts,
    pub event: N1PhaseCounts,
    pub root_iterations: u64,
    pub observed_states: u64,
    pub max_quaternion_norm_error: f64,
}
thread_local! {
    static N1_CONTROLS: RefCell<N1Controls> = RefCell::new(N1Controls::default());
    static N1_COUNTS: RefCell<N1Counts> = RefCell::new(N1Counts::default());
    static N1_EVENT_PHASE: RefCell<bool> = const { RefCell::new(false) };
}
pub fn n1_set_controls(c: N1Controls) {
    assert!(c.ordinary_scale > 0.0 && c.ordinary_scale.is_finite());
    assert!(c.event_scale > 0.0 && c.event_scale.is_finite());
    assert!(c.event_time_tolerance > 0.0 && c.event_time_tolerance.is_finite());
    N1_CONTROLS.with(|v| *v.borrow_mut() = c);
    N1_COUNTS.with(|v| *v.borrow_mut() = N1Counts::default());
}
pub fn n1_counts() -> N1Counts { N1_COUNTS.with(|v| *v.borrow()) }
fn n1_tolerances(event: bool) -> AdaptiveTolerances {
    let scale = N1_CONTROLS.with(|v| if event { v.borrow().event_scale } else { v.borrow().ordinary_scale });
    AdaptiveTolerances { r: 1e-3 * scale, v: 1e-2 * scale, q: 1e-5 * scale, w: 1e-3 * scale }
}
fn n1_event_time_tolerance() -> f64 { N1_CONTROLS.with(|v| v.borrow().event_time_tolerance) }
fn n1_count(which: u8) {
    let event = N1_EVENT_PHASE.with(|v| *v.borrow());
    N1_COUNTS.with(|v| {
        let mut c = v.borrow_mut();
        let phase = if event { &mut c.event } else { &mut c.ordinary };
        match which { 0 => phase.attempted += 1, 1 => phase.accepted += 1, 2 => phase.rejected += 1, _ => phase.segments += 1 }
    });
}
fn n1_root_iteration() { N1_COUNTS.with(|v| v.borrow_mut().root_iterations += 1); }
fn n1_observe_norm(qn: f64) {
    N1_COUNTS.with(|v| { let mut c = v.borrow_mut(); c.observed_states += 1; c.max_quaternion_norm_error = c.max_quaternion_norm_error.max((qn - 1.0).abs()); });
}
#[allow(clippy::too_many_arguments)]
fn n1_integrate(event: bool, s0: &RigidState, loads: &dyn Fn(f64, &RigidState) -> Result<Loads, String>, t0: f64, t1: f64, tol: &AdaptiveTolerances, max_step: f64, dt_init: f64) -> Result<AdaptiveResult, String> {
    let old = N1_EVENT_PHASE.with(|v| v.replace(event));
    n1_count(3);
    let result = integrate_rigid_adaptive(s0, loads, t0, t1, tol, max_step, dt_init);
    N1_EVENT_PHASE.with(|v| v.replace(old));
    result
}

#[derive(Clone, Copy, Debug, Default)]
pub struct N1Errors { pub position: f64, pub velocity: f64, pub attitude_rad: f64, pub rate: f64 }
impl N1Errors {
    fn fold(&mut self, got: RigidState, exact: RigidState) {
        self.position = self.position.max(add_vec(&got.r, &exact.r, -1.0).norm());
        self.velocity = self.velocity.max(add_vec(&got.v, &exact.v, -1.0).norm());
        self.attitude_rad = self.attitude_rad.max(rel_quat_angle(&got.q, &exact.q));
        self.rate = self.rate.max(add_vec(&got.w, &exact.w, -1.0).norm());
    }
}
#[derive(Clone, Debug)]
pub struct N1RootCheck { pub tolerance_s: f64, pub expected_s: f64, pub returned_s: f64, pub signed_error_s: f64, pub state_error: N1Errors }
#[derive(Clone, Debug)]
pub struct N1AnalyticRow {
    pub fixture: &'static str, pub integration_phase: &'static str, pub tolerance_scale: f64, pub max_step_s: f64,
    pub endpoint_max_error: N1Errors, pub off_node_max_error: N1Errors,
    pub roots: Vec<N1RootCheck>, pub counts: N1Counts,
}
fn n1_identity() -> RigidState { RigidState { r: Vec3::zero(), v: Vec3::zero(), q: Quat { w:1.0,x:0.0,y:0.0,z:0.0 }, w:Vec3::zero() } }
fn n1_constant_load(force_n: Vec3, inertia_b: Vec3) -> Loads {
    Loads { force_n, moment_b:Vec3::zero(),inertia_b,inertia_dot_b:Vec3::zero(),mass:1.0,validity:StageValidity::Valid }
}
// N1_ROOT_SEARCH_BEGIN: generator substitutes the verbatim production bisection
// body here, including its right-end convention. Only the crossed predicate
// and already integrated dense path are supplied by these analytic fixtures.
fn n1_root(path: &AdaptiveResult, t0: f64, t1: f64, tol_t: f64, crossed: &dyn Fn(&RigidState) -> bool) -> f64 {
    assert!(!crossed(&dense_output_at(&path.dense,t0)));
    assert!(crossed(&dense_output_at(&path.dense,t1)));
    __N1_VERBATIM_ROOT_SEARCH__
    b
}
// N1_ROOT_SEARCH_END
pub fn n1_analytic_suite() -> Result<Vec<N1AnalyticRow>,String> {
    let mut rows=Vec::new();
    for event_phase in [false,true] { for scale in [1.0,0.1,0.01] { for max_step in [0.2,0.05,0.0125] { for fixture in ["ballistic-apogee","constant-acceleration-rail","spherical-torque-free","principal-axis-torque-free","damped-oscillator"] {
        n1_set_controls(N1Controls { ordinary_scale:if event_phase {1.0} else {scale},event_scale:if event_phase {scale} else {1.0},event_time_tolerance:1e-5 });
        let mut initial=n1_identity();
        if fixture=="ballistic-apogee" { initial.r.z=10.0;initial.v.z=30.0; }
        if fixture=="spherical-torque-free" { initial.w=Vec3{x:0.3,y:0.4,z:0.2}; }
        if fixture=="principal-axis-torque-free" { initial.w.x=0.9; }
        if fixture=="damped-oscillator" { initial.r.x=1.0; }
        let end=if fixture=="constant-acceleration-rail" { 1.0 } else { 5.3 };
        let loads=|_:f64,s:&RigidState| -> Result<Loads,String> {
            let force=if fixture=="ballistic-apogee" {Vec3{x:0.0,y:0.0,z:-G0}}
                else if fixture=="constant-acceleration-rail" {Vec3{x:0.0,y:0.0,z:12.0}}
                else if fixture=="damped-oscillator" {Vec3{x:-9.0*s.r.x-0.9*s.v.x,y:0.0,z:0.0}}
                else {Vec3::zero()};
            Ok(n1_constant_load(force,if fixture=="principal-axis-torque-free" {Vec3{x:2.0,y:3.0,z:4.0}} else {Vec3{x:2.0,y:2.0,z:2.0}}))
        };
        let exact=|t:f64| -> RigidState {
            let mut s=initial;
            match fixture {
                "ballistic-apogee" => {s.r.z=10.0+30.0*t-0.5*G0*t*t;s.v.z=30.0-G0*t;},
                "constant-acceleration-rail" => {s.r.z=6.0*t*t;s.v.z=12.0*t;},
                "damped-oscillator" => {let a:f64=0.45;let wd=(9.0-a*a).sqrt();let e=(-a*t).exp();s.r.x=e*((wd*t).cos()+a/wd*(wd*t).sin());s.v.x=-9.0/wd*e*(wd*t).sin();},
                _ => {let mag=initial.w.norm();let a=0.5*mag*t;let f=a.sin()/mag;s.q=Quat{w:a.cos(),x:initial.w.x*f,y:initial.w.y*f,z:initial.w.z*f};},
            }
            s
        };
        let path=n1_integrate(event_phase,&initial,&loads,0.0,end,&n1_tolerances(event_phase),max_step,0.005)?;
        let mut endpoint=N1Errors::default();let mut off_node=N1Errors::default();
        for step in &path.dense {
            endpoint.fold(step.y1,exact(step.t1));
            for f in [0.173,0.371,0.733] {let t=step.t0+(step.t1-step.t0)*f;off_node.fold(dense_output_at(&path.dense,t),exact(t));}
        }
        // Broad fixture correctness gates, fixed before outcomes; no assumed
        // monotonic order. Report endpoint and cubic-Hermite off-node errors.
        for e in [endpoint,off_node] { assert!(e.position<0.001 && e.velocity<0.01 && e.attitude_rad<0.0001 && e.rate<1e-10,"analytic fixture failed: {fixture} {e:?}"); }
        let mut roots=Vec::new();
        if fixture=="ballistic-apogee" || fixture=="constant-acceleration-rail" {
            let expected=if fixture=="ballistic-apogee" {30.0/G0} else {(2.0_f64*1.83/12.0).sqrt()};
            let crossed=|s:&RigidState| if fixture=="ballistic-apogee" {s.v.z<=0.0} else {s.r.z>=1.83};
            for tol in [1e-5,1e-6,1e-7] {
                let t=n1_root(&path,0.0,end,tol,&crossed);let mut error=N1Errors::default();error.fold(dense_output_at(&path.dense,t),exact(t));
                assert!(t-expected>=-1e-10 && t-expected<=tol+1e-10,"analytic root outside right-end bracket");
                roots.push(N1RootCheck{tolerance_s:tol,expected_s:expected,returned_s:t,signed_error_s:t-expected,state_error:error});
            }
        }
        let counts=n1_counts();
        assert_eq!(counts.ordinary.attempted,counts.ordinary.accepted+counts.ordinary.rejected);
        assert_eq!(counts.event.attempted,counts.event.accepted+counts.event.rejected);
        assert_eq!(if event_phase {counts.ordinary.attempted} else {counts.event.attempted},0);
        rows.push(N1AnalyticRow{fixture,integration_phase:if event_phase {"event"} else {"ordinary"},tolerance_scale:scale,max_step_s:max_step,endpoint_max_error:endpoint,off_node_max_error:off_node,roots,counts});
    } } } }
    Ok(rows)
}
