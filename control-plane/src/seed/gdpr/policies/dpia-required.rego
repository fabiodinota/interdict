# GDPR - Article 35: Data protection impact assessment
#
# Flags high-risk data processing activities that require a DPIA.
# Detects profiling, large-scale processing, systematic monitoring,
# and other processing operations likely to result in high risk to
# the rights and freedoms of natural persons.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block high-risk processing without DPIA reference
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	high_risk_processing(content)
	not dpia_reference_present(content)
	result := {
		"action": "block",
		"reason": "GDPR Article 35 - DPIA Required: High-risk data processing activity detected without a Data Protection Impact Assessment reference. A DPIA must be carried out prior to processing that is likely to result in high risk.",
		"redactions": [],
	}
}

# High-risk processing patterns (Article 35(3))
high_risk_processing(content) if {
	contains(content, "profiling")
	contains(content, "automated")
}

high_risk_processing(content) if {
	contains(content, "large-scale processing")
}

high_risk_processing(content) if {
	contains(content, "large scale")
	contains(content, "personal data")
}

high_risk_processing(content) if {
	contains(content, "systematic monitoring")
}

high_risk_processing(content) if {
	contains(content, "surveillance")
	contains(content, "public")
}

high_risk_processing(content) if {
	contains(content, "scoring")
	contains(content, "natural person")
}

high_risk_processing(content) if {
	contains(content, "automated decision")
	contains(content, "legal effect")
}

high_risk_processing(content) if {
	contains(content, "special categor")
	contains(content, "data")
}

high_risk_processing(content) if {
	contains(content, "criminal")
	contains(content, "data")
	contains(content, "process")
}

high_risk_processing(content) if {
	contains(content, "cross-border")
	contains(content, "transfer")
	contains(content, "personal")
}

# DPIA reference markers
dpia_reference_present(content) if {
	contains(content, "dpia-id:")
}

dpia_reference_present(content) if {
	contains(content, "dpia completed")
}

dpia_reference_present(content) if {
	contains(content, "impact assessment")
	contains(content, "approved")
}

dpia_reference_present(content) if {
	contains(content, "dpia reference:")
}

dpia_reference_present(content) if {
	contains(content, "data protection impact assessment")
	contains(content, "completed")
}
