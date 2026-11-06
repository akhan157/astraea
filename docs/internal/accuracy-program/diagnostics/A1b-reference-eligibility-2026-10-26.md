# Reference geometry eligibility for the initial SB1 adapter

The retained D-4013 ARCAS measurements remain useful development evidence, but
**they are not an exact-geometry qualification case for the current adapter**.
This is a comparison of the retained source contract with the now implemented
adapter, not a new source search, measurement extraction or model comparison.

The [D1 ledger](../sb1-foundation-2026-10-26/D1/geometry-ledger.json) deliberately
leaves geometry/convention closure open. NASA TN D-4013 printed p3 explicitly
describes an ogive/cylinder/boattail ending in a reflex lip and fin anchors; its
drawings and ordinate table are the geometry source. The initial adapter's
declarations cannot truthfully erase these features.

| Source condition | Current adapter boundary | Consequence |
|---|---|---|
| Ordinate-defined ogive and unresolved finite-tip convention | Sharp conical or explicitly interpreted tangent-ogive nose | Do not silently select tangent ogive or assert a sharp physical tip |
| Boattail with reflex lip | Conical transitions and explicit flat aft base, no other external features | A plain conical tail is a different geometry; omission needs its own bounded discrepancy evidence |
| Raised/compound fin anchors and root/section details not fully closed | One trapezoidal set rooted wholly on its host cylinder; no unmodeled attachments | Declaring no interference is not a geometry reconstruction or measurement |
| Normal force/moment with original area, length, datum, roll and alpha conventions | Explicit force/moment/reference transforms | Source-to-provider conversion and uncertainty still need review before scoring |

An intentional approximate ARCAS reconstruction may diagnose a method, provided
every substitution and condition is frozen and reported. Agreement does not
qualify the missing features, and disagreement cannot uniquely identify a force
law. No acceptance budget or harmlessness assumption is supplied by this note.

Concrete next choices are: close the native-density drawing/convention record
and implement justified method/geometry extensions; or use a separately scoped
supplied-coefficient provider retaining the source's total force and independent
moment. The latter can test table normalization and load assembly without
claiming validation of native coefficient generation. Missing axial/power/rate
coverage remains missing. A genuinely matched geometry can also be selected
from the existing source inventory after screening its actual conditions; a
paper's headline Mach range is insufficient.

This does not reduce the intended collegiate mission scope to the initial
subsonic candidate. It prevents a provisional source fixture being promoted to
an empirical pass before it answers the claimed question.
