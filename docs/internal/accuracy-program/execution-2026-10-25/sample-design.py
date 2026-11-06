"""Illustrative independent-Bernoulli cohort planning, not an approved gate."""
import json,math
from pathlib import Path

def tail(n,p,k):
    return sum(math.exp(math.lgamma(n+1)-math.lgamma(i+1)-math.lgamma(n-i+1)+i*math.log(p)+(n-i)*math.log1p(-p)) for i in range(k,n+1))
alpha=.05
all_pass=[{'independent_units':n,'successes':n,'one_sided_95pct_lower':alpha**(1/n)} for n in [6,14,29,59]]
# Illustrative test of coverage p<=.8 against p=.9, one-sided size<=.05, power>=.8.
solution=None
for n in range(1,501):
    k=next((k for k in range(n+1) if tail(n,.8,k)<=alpha+1e-12),None)
    if k is not None and tail(n,.9,k)>=.8:
        solution={'n':n,'minimum_successes':k,'false_positive_at_p0':tail(n,.8,k),'power_at_p1':tail(n,.9,k)}
        break
assert abs(all_pass[0]['one_sided_95pct_lower']-.05**(1/6))<1e-12
assert solution is not None
result={'status':'illustrative proposal; not frozen or approved acceptance criteria','assumptions':['Independent exchangeable Bernoulli units; repeated flights on one vehicle/source are not automatically independent','One selected binary decision/coverage criterion, no multiple-output or multiple-regime correction','Thresholds p0=.8,p1=.9,alpha=.05,power=.8 chosen only to illustrate effort, not asserted suitable for primary simulation','Real design must allocate strata, cluster effects, useful interval width and measurement uncertainty before outcome exposure'],'all_pass_bounds':all_pass,'minimum_fixed_design_example':solution,'primary_method_source':'https://itl.nist.gov/div898/software/dataplot/refman2/auxillar/exacbici.htm'}
p=Path(__file__).with_suffix('.json');p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
