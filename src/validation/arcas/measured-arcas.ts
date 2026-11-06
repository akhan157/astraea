/**
 * ARCAS measured wind-tunnel data (NASA TN D-4013 / TN D-4014).
 * CAcorr readings are at α≈0; CP readings use each plot's marked conditions.
 *
 * ACQUISITION HISTORY (preserved deliberately — do not "clean up"):
 *   - Phase 1: values were inherited from a third-party comparison deck and
 *     re-labelled with NASA figure citations. That is why the supersonic rows
 *     below previously read "NASA TN D-4014 Fig. 5(b)/6(b), free-stream
 *     corrected". TN D-4014 states the opposite: axial-force data were NOT
 *     corrected to free-stream conditions at the model base (Tables/Figs are
 *     chamber-axial-force CA,c and uncorrected CA). Those rows are therefore
 *     quarantined in QUARANTINED_ARCAS_CSV, not cited as direct NASA data.
 *   - Phase 2 (2026-10-09): the original NTRS PDFs (TN D-4013 doc 19670020050,
 *     TN D-4014 doc 19670020031) were downloaded and rendered locally. The
 *     figures were inspected. CAcorr values below were re-read from the solid
 *     (fin cant 0, solid legend "0") curve of TN D-4013 Figs. 11/12 at
 *     alpha ~ 0 by pixel digitisation of the rendered grids. CP readings were
 *     digitized from TN D-4013 Figs. 11/12 solid fin-cant-0 curves and TN
 *     D-4014 Fig. 7 config curves. The long-model D-4013 M=0.60 overlap and
 *     non-native M=0.95 point remain quarantined.
 *
 * Reference quantities confirmed from the reports:
 *   - Reference area S = maximum cross-sectional area of the body (TN D-4013
 *     Symbols; TN D-4014 Symbols). Moment reference: TN D-4013 at 70% body
 *     length (both models); TN D-4014 at 63.37% (config 1) / 66.36% (config 2).
 *   - CAcorr (TN D-4013) = axial force corrected to free-stream conditions at
 *     the model base. Base pressure coefficient c_p,b is a separate quantity.
 *
 * source_document / figure_or_page are free-text provenance fields; the test
 * loader only reads model/quantity/mach/measured/unit.
 */

export const MEASURED_ARCAS_CSV = `
model,quantity,mach,measured,unit,source_document,figure_or_page,reading_uncertainty
ARCAS-short,CAcorr,0.60,0.315,,NASA TN D-4013,Fig 11 PDFp62 alpha~0 dF=0-solid-2026-10-09,0.025
ARCAS-short,CAcorr,0.80,0.332,,NASA TN D-4013,Fig 11 alpha~0 dF=0-solid-2026-10-09,0.025
ARCAS-short,CAcorr,0.90,0.420,,NASA TN D-4013,Fig 11 alpha~0 dF=0-solid-2026-10-09,0.025
ARCAS-short,CAcorr,0.95,0.585,,NASA TN D-4013,Fig 11 alpha~0 dF=0-solid-2026-10-09,0.025
ARCAS-short,CAcorr,1.00,0.689,,NASA TN D-4013,Fig 11 alpha~0 dF=0-solid-2026-10-09,0.025
ARCAS-short,CAcorr,1.20,0.610,,NASA TN D-4013,Fig 11 alpha~0 dF=0-solid-2026-10-09,0.025
ARCAS-long,CAcorr,0.60,0.355,,NASA TN D-4013,Fig 12 PDFp63 alpha~0 dF=0-solid-2026-10-09,0.025
ARCAS-long,CAcorr,0.80,0.372,,NASA TN D-4013,Fig 12 alpha~0 dF=0-solid-2026-10-09,0.025
ARCAS-long,CAcorr,0.90,0.457,,NASA TN D-4013,Fig 12 alpha~0 dF=0-solid-2026-10-09,0.025
ARCAS-long,CAcorr,1.00,0.729,,NASA TN D-4013,Fig 12 alpha~0 dF=0-solid-2026-10-09,0.025
ARCAS-short,CP,0.60,75.0,percent_body_length,NASA TN D-4013,Fig 11 PDF p62 printed p60 alpha -2 to +2 solid fin-cant-0 digitized 2026-10-10,1.5
ARCAS-short,CP,0.80,71.0,percent_body_length,NASA TN D-4013,Fig 11 PDF p62 printed p60 alpha -2 to +2 solid fin-cant-0 digitized 2026-10-10,1.5
ARCAS-short,CP,0.90,72.0,percent_body_length,NASA TN D-4013,Fig 11 PDF p62 printed p60 alpha -2 to +2 solid fin-cant-0 digitized 2026-10-10,1.5
ARCAS-short,CP,0.95,76.5,percent_body_length,NASA TN D-4013,Fig 11 PDF p62 printed p60 alpha -2 to +2 solid fin-cant-0 digitized 2026-10-10,1.5
ARCAS-short,CP,1.00,83.5,percent_body_length,NASA TN D-4013,Fig 11 PDF p62 printed p60 alpha -2 to +2 solid fin-cant-0 digitized 2026-10-10,1.5
ARCAS-short,CP,1.20,85.5,percent_body_length,NASA TN D-4013,Fig 11 PDF p62 printed p60 alpha -2 to +2 solid fin-cant-0 digitized 2026-10-10,1.5
ARCAS-long,CP,0.80,75.5,percent_body_length,NASA TN D-4013,Fig 12 PDF p63 printed p61 alpha -2 to +2 solid fin-cant-0 digitized 2026-10-10,1.5
ARCAS-long,CP,0.90,76.0,percent_body_length,NASA TN D-4013,Fig 12 PDF p63 printed p61 alpha -2 to +2 solid fin-cant-0 digitized 2026-10-10,1.5
ARCAS-long,CP,1.00,71.5,percent_body_length,NASA TN D-4013,Fig 12 PDF p63 printed p61 alpha -2 to +2 solid fin-cant-0 digitized 2026-10-10,1.5
ARCAS-long,CP,1.20,81.5,percent_body_length,NASA TN D-4013,Fig 12 PDF p63 printed p61 alpha -2 to +2 solid fin-cant-0 digitized 2026-10-10,1.5
ARCAS-short,CP,1.50,78.5,percent_body_length,NASA TN D-4014,Fig 7 PDF p43 printed p41 config 1 solid digitized 2026-10-10,1.5
ARCAS-short,CP,1.80,75.5,percent_body_length,NASA TN D-4014,Fig 7 PDF p43 printed p41 config 1 solid digitized 2026-10-10,1.5
ARCAS-short,CP,2.30,72.0,percent_body_length,NASA TN D-4014,Fig 7 PDF p43 printed p41 config 1 solid digitized 2026-10-10,1.5
ARCAS-short,CP,2.96,67.0,percent_body_length,NASA TN D-4014,Fig 7 PDF p43 printed p41 config 1 solid digitized 2026-10-10,1.5
ARCAS-short,CP,3.96,60.0,percent_body_length,NASA TN D-4014,Fig 7 PDF p43 printed p41 config 1 solid digitized 2026-10-10,1.5
ARCAS-short,CP,4.63,56.0,percent_body_length,NASA TN D-4014,Fig 7 PDF p43 printed p41 config 1 solid digitized 2026-10-10,1.5
ARCAS-long,CP,1.80,77.0,percent_body_length,NASA TN D-4014,Fig 7 PDF p43 printed p41 config 2 dashed digitized 2026-10-10,1.5
ARCAS-long,CP,2.30,71.5,percent_body_length,NASA TN D-4014,Fig 7 PDF p43 printed p41 config 2 dashed digitized 2026-10-10,1.5
ARCAS-long,CP,2.96,66.0,percent_body_length,NASA TN D-4014,Fig 7 PDF p43 printed p41 config 2 dashed digitized 2026-10-10,1.5
ARCAS-long,CP,3.96,59.5,percent_body_length,NASA TN D-4014,Fig 7 PDF p43 printed p41 config 2 dashed digitized 2026-10-10,1.5
ARCAS-long,CP,4.63,55.5,percent_body_length,NASA TN D-4014,Fig 7 PDF p43 printed p41 config 2 dashed digitized 2026-10-10,1.5
ARCAS-long,CAcorr,1.20,0.622,,NASA TN D-4013,Fig 12 alpha~0 dF=0-solid-2026-10-09,0.025`;
/**
 * Digitized but not scored: TN D-4014 reports CA at alpha=0 with no free-stream
 * base correction. Figure 4's CA,c is a separate chamber-force coefficient,
 * not a base-pressure correction. Plot-reading uncertainty is ±0.01.
 */
export const SOURCED_SUPERSONIC_CA_CSV = `
model,quantity,mach,measured,unit,source_document,figure_or_page,reading_uncertainty
ARCAS-short,CA-uncorrected,1.50,0.54,,NASA TN D-4014,"Fig 5(b), PDF p.28/printed p.26, alpha=0, dF=0",0.01
ARCAS-short,CA-uncorrected,1.80,0.47,,NASA TN D-4014,"Fig 5(b), PDF p.28/printed p.26, alpha=0, dF=0",0.01
ARCAS-short,CA-uncorrected,2.30,0.38,,NASA TN D-4014,"Fig 5(b), PDF p.28/printed p.26, alpha=0, dF=0",0.01
ARCAS-short,CA-uncorrected,2.96,0.31,,NASA TN D-4014,"Fig 5(b), PDF p.28/printed p.26, alpha=0, dF=0",0.01
ARCAS-short,CA-uncorrected,3.96,0.22,,NASA TN D-4014,"Fig 5(b), PDF p.28/printed p.26, alpha=0, dF=0",0.01
ARCAS-short,CA-uncorrected,4.63,0.20,,NASA TN D-4014,"Fig 5(b), PDF p.28/printed p.26, alpha=0, dF=0",0.01
ARCAS-long,CA-uncorrected,1.80,0.52,,NASA TN D-4014,"Fig 6(b), PDF p.37/printed p.35, alpha=0, dF=0",0.01
ARCAS-long,CA-uncorrected,2.30,0.42,,NASA TN D-4014,"Fig 6(b), PDF p.37/printed p.35, alpha=0, dF=0",0.01
ARCAS-long,CA-uncorrected,2.96,0.35,,NASA TN D-4014,"Fig 6(b), PDF p.37/printed p.35, alpha=0, dF=0",0.01
ARCAS-long,CA-uncorrected,3.96,0.27,,NASA TN D-4014,"Fig 6(b), PDF p.37/printed p.35, alpha=0, dF=0",0.01
ARCAS-long,CA-uncorrected,4.63,0.23,,NASA TN D-4014,"Fig 6(b), PDF p.37/printed p.35, alpha=0, dF=0",0.01`;

/**
 * QUARANTINED — reported as exclusions, never used in error calculations.
 *
 * These supersonic rows were inherited from a third-party comparison deck /
 * vendor slides and interpolated at M = 1.70/2.00/3.00/4.00, which are NOT the
 * Mach numbers tested in TN D-4014 (1.50, 1.80, 2.30, 2.96, 3.96, 4.63). The
 * NASA citation attached to them does not hold: the original native-Mach CA
 * readings are now recorded separately below, but remain unscored because
 * TN D-4014 explicitly leaves base pressure uncorrected. Fig. 4's CA,c is a
 * chamber-axial-force coefficient, not a free-stream base correction.
 * The remaining CP quarantines are the unresolved long-model M=0.60 curve
 * overlap and the non-native long-model M=0.95 point. History only.
 */
export const QUARANTINED_ARCAS_CSV = `
model,quantity,mach,measured,unit,former_citation,quarantine_reason
ARCAS-long,CP,0.60,77.0,percent_body_length,NASA TN D-4013 Fig 12,Curve styles overlap at native M=0.60; cant-0 attribution unresolved within ±1.5pp
ARCAS-long,CP,0.95,73.0,percent_body_length,NASA TN D-4013 Fig 12,NON-NATIVE Mach; long model native points omit 0.95; historical value not scored
ARCAS-short,CD,1.70,0.460,,NASA TN D-4014 Fig 5(b)/6(b) free-stream corrected,VENDOR-DERIVED interpolated Mach not tested in TN D-4014
ARCAS-short,CD,2.00,0.370,,NASA TN D-4014 Fig 5(b)/6(b) free-stream corrected,VENDOR-DERIVED interpolated Mach not tested in TN D-4014
ARCAS-short,CD,3.00,0.300,,NASA TN D-4014 Fig 5(b)/6(b) free-stream corrected,VENDOR-DERIVED interpolated Mach not tested in TN D-4014
ARCAS-short,CD,4.00,0.230,,NASA TN D-4014 Fig 5(b)/6(b) free-stream corrected,VENDOR-DERIVED interpolated Mach not tested in TN D-4014
ARCAS-short,CD,4.63,0.200,,NASA TN D-4014 Fig 5(b)/6(b) free-stream corrected,VENDOR-DERIVED interpolated Mach not tested in TN D-4014
ARCAS-long,CD,1.70,0.410,,NASA TN D-4014 Fig 5(b)/6(b) free-stream corrected,VENDOR-DERIVED interpolated Mach not tested in TN D-4014
ARCAS-long,CD,2.00,0.335,,NASA TN D-4014 Fig 5(b)/6(b) free-stream corrected,VENDOR-DERIVED interpolated Mach not tested in TN D-4014
ARCAS-long,CD,3.00,0.278,,NASA TN D-4014 Fig 5(b)/6(b) free-stream corrected,VENDOR-DERIVED interpolated Mach not tested in TN D-4014
ARCAS-long,CD,4.00,0.222,,NASA TN D-4014 Fig 5(b)/6(b) free-stream corrected,VENDOR-DERIVED interpolated Mach not tested in TN D-4014
ARCAS-long,CD,4.63,0.225,,NASA TN D-4014 Fig 5(b)/6(b) free-stream corrected,VENDOR-DERIVED interpolated Mach not tested in TN D-4014`;
