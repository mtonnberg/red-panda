# Static text-decoration-line diagnosis

No runtime or production change has been made. The frozen320-row comparison leaves239 differing fields. The most coherent subset is174 identical textDecorationLine differences: Native none, candidate empty string. All default, unrelated inline mutation, display-keyword and actual adoption reads share that pair.

The current initial-property model omits text-decoration-line. compute enumerates only initial names and real cascade winners, so it never writes that absent longhand when no declaration supplies it. cssstyle4.6 does expose the generic property getter; it returns getPropertyValue, hence empty string for an absent entry. This is a concrete missing-initial-value hypothesis, distinct from active UA typography12 and margin-shorthand24 differences.

The narrow candidate hypothesis is to add the measured non-inherited initial longhand none, letting the existing cascade resolve explicit values, inherit/initial/unset/revert and owner-document context normally. No code patch is proposed before calibration: cssstyle does not implement text-decoration shorthand expansion, and Native's actual longhand/shorthand acceptance must be measured rather than inferred from standards.

A queued single-Native-process4s-owned-watchdog control is prepared. It uses real inline property/setProperty/attribute mutation, connected parent/child inheritance, invalid/reset values and live active/inactive adoption. It does not test dynamic author-sheet scheduling, alter prior packets, or infer typography/body defaults. Expected execution under one second; must wait for explicit Root runtime lease.
