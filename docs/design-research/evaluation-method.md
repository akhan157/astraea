# Evaluation method: a professional workstation, not an enterprise-looking screenshot

This is the coordinator's assessment method for the research package and later prototypes. It is not a claim that Astraea or any reference product meets these criteria. Read alongside the observed findings in the lane studies and audit.

## Evidence ladder

1. **Hands-on observed:** a recorded action in an identified running build, with outcome and screenshot/runtime evidence. Strong for that scenario, not proof of all states.
2. **Visual observed:** an actual vendor/tutorial screenshot or video frame inspected at an identified source/version/locator. Strong for visible composition, weak for unshown behavior.
3. **Official documented:** primary documentation describing behavior. Useful contract evidence, not measurement of speed, discoverability, or reliability.
4. **Practitioner reported:** a public user's/trainer's account. Indicates a question to test; does not estimate prevalence or establish a universal defect.
5. **Inference/proposal:** our interpretation or design adaptation. Must say so and provide a falsifiable acceptance condition.

Product adoption announcements establish industrial relevance only. Commercial licenses do not establish usability; open-source licenses do not imply low quality. Historical product documentation is labeled by version and never promoted to a current-deployment claim. Many engineering tools carry useful interaction knowledge inside visually dated interfaces: analyze the behavior separately from the styling.

## What counts as a deep workflow

A useful analysis identifies the starting object/configuration, the user's goal, the sequence of meaningful actions, visible state changes, the commit boundary, and available correction/recovery. It records what is not shown. Three disconnected feature descriptions do not count as a complete journey. A workflow reconstructed from several documentation pages is labeled reconstructed, not hands-on. Missing failure-state evidence stays missing; reviewers do not fill it with plausible behavior.

## Review criteria

| Criterion | Question to answer | Evidence / later prototype check |
|---|---|---|
| Task effectiveness | Can the engineer reach the intended result correctly? | Completed task with exact starting state and final result. Distinguish completion from discoverability: an agent that read source knows more than an untrained user. |
| Orientation | Can the user identify project/configuration, selected entity, inspected run, and time context? | Select or navigate while comparing visible identities. Entity selection, baseline run, and playback cursor are related but distinct state—not one overloaded global selection. |
| Precision editing | Are units, numeric entry, validation, Apply/Cancel and undo scopes predictable? | Enter, clear, undo and reject a value; show which values changed. A pretty slider is not an exact-edit alternative. |
| Result trust | Is a displayed result bound to its input snapshot and method? | Change an input after a run; historical result remains identifiable and cannot silently become current. Show modeled/measured/derived/assumed roles. |
| Comparison semantics | Can differences be interpreted correctly? | Identify baseline, comparison, units/datums, time alignment and processing; inspect missing overlap and mismatched signals. No arbitrary pass/fail tolerance implied. |
| State completeness | Are empty/loading/partial/error/cancelled/stale states intentional? | Separate run states with explicit transitions and recovery. No fake completion percentages or quiet replacement of failed results. |
| Visual hierarchy | Does emphasis follow the current task rather than component count? | Inspect populated desktop and compact screens; identify primary object, action, key result and exception. Count competing hierarchy levels only where actually observed. |
| Density and legibility | Can realistic labels and tables be read without losing context? | Long vehicle/motor names, dense results, units adjacent to values, numeric alignment, visible focus, restrained decoration. No unsupported pixel/contrast claims from resized screenshots. |
| Access | Are essential workflows usable without precise pointer movement? | Keyboard-only functional alternatives, logical focus movement, focus visibility, zoom and text reflow. A WebGL canvas does not excuse all surrounding forms/navigation from access requirements. |
| Responsiveness | Does interaction remain usable while work runs? | Record input responsiveness and lifecycle under a declared fixture/machine. Separate UI latency from solver completion; do not invent universal millisecond promises. |
| Recoverability | Can users correct mistakes without discarding unrelated work? | Failed import, invalid input, navigation with a draft, cancellation, restart. State what persistence is actually implemented versus proposed. |
| Scope discipline | Is the recommendation proportional to Astraea's task? | Borrow a pattern without automatically adding cloud accounts, PLM approvals, ontologies, general graph editors or new physics APIs. Label shared-contract changes explicitly. |

## Severity for current-product findings

- **Critical:** observed risk of wrong interpretation, silent loss/corruption, or inability to recover from a core operation. Severity is tied to demonstrated impact; it is not a certification or flight-safety determination.
- **High:** core task blocked or materially misleading in the tested path; workaround costly or unclear.
- **Medium:** repeated friction, context loss, avoidable navigation or inconsistent behavior with an available workaround.
- **Low:** localized presentation or polish issue without demonstrated task impact.
- **Unverified hypothesis:** a suspected issue with a stated experiment needed; do not assign it an observed failure verdict.

Each finding must name scope, steps, actual result, expected task outcome, evidence ID and confidence. We will not calculate a single numeric 'enterprise readiness' score: weights would conceal hard blockers and imply validation not performed.

## Accessibility references and exact limits

These public W3C explanations were read during this research; they guide checks and do not prove conformance:

- [WCAG 2.2 SC 2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html): functionality must be keyboard-operable except genuinely path-dependent input. Selecting/moving a discrete point is not automatically such an exception. An equivalent keyboard-accessible control may satisfy functionality even if every visual control is not separately focusable.
- [SC 1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html): non-excepted vertical content must work at 320 CSS pixels without two-dimensional scrolling; 1280-wide at 400% zoom is a common equivalent. Necessary two-dimensional content has scoped exceptions, not a blanket exemption for the whole application. A 1280x800 or 200% screenshot alone is not a reflow-conformance test.
- [SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): 24x24 CSS pixels, with the documented spacing/equivalent/inline/user-agent/essential exceptions. Do not confuse a 24px icon with its clickable target, or use a screenshot to declare the spacing exception satisfied without measurement.

A full accessibility audit additionally requires appropriate assistive-technology, contrast, semantics and interaction testing. Research walkthroughs are not that audit.

## Two later design directions: controlled comparison

Future concepts should represent different workspace strategies, not palette variations. Compare a precision/canvas-led workstation against a run/comparison-led workspace using the same vehicle, task, data, viewport and error condition. Both must preserve the same engineering contracts. Evaluate task completion and errors before aesthetics; record time and interactions as descriptive data without assuming fewer clicks always means less effort. Ask users to explain which result they trust and why. Preference ratings cannot replace task evidence.

No participant study has been conducted in this package. Expert inspection provides hypotheses and design constraints; actual task comprehension and satisfaction remain unverified until representative users participate. User identity/work context is still a product decision to validate, not a persona invented from competitor marketing.

## Research-completion boundary

Enough to commission prototypes means: the strongest patterns have attributable evidence, current-product pain points have reproducible observations, visual choices can be discussed concretely, recommendations state tradeoffs, and access/user-study gaps are explicit. It does not mean enough to declare a visual direction superior, approve new shared APIs, ship enterprise production software, or imply legal/safety certification.
