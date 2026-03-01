# NIST AI RMF - MANAGE 1.0: Risk response and recovery
#
# Blocks AI incident handling and model failure responses without risk
# management context. MANAGE function requires that AI risks are prioritized
# and acted upon with developed response and recovery procedures.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block AI incident handling without risk management plan
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	ai_incident_pattern(content)
	not risk_management_present(content)
	result := {
		"action": "block",
		"reason": "NIST AI RMF MANAGE 1.0 - Risk Management: AI incident or failure detected without documented risk response plan. Incident response and recovery procedures must be in place for AI systems.",
		"redactions": [],
	}
}

# Block bias detection without mitigation context
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	bias_detection_pattern(content)
	not risk_management_present(content)
	result := {
		"action": "block",
		"reason": "NIST AI RMF MANAGE 1.0 - Risk Management: AI bias or unexpected behavior detected without mitigation plan. Risks must be prioritized and acted upon with documented response procedures.",
		"redactions": [],
	}
}

# AI incident patterns
ai_incident_pattern(content) if {
	contains(content, "ai incident")
}

ai_incident_pattern(content) if {
	contains(content, "model failure")
}

ai_incident_pattern(content) if {
	contains(content, "unexpected ai behavior")
}

ai_incident_pattern(content) if {
	contains(content, "ai system malfunction")
}

ai_incident_pattern(content) if {
	contains(content, "model producing incorrect")
}

ai_incident_pattern(content) if {
	contains(content, "ai outage")
	contains(content, "production")
}

# Bias detection patterns
bias_detection_pattern(content) if {
	contains(content, "bias detected")
	contains(content, "model")
}

bias_detection_pattern(content) if {
	contains(content, "discriminatory output")
}

bias_detection_pattern(content) if {
	contains(content, "unfair treatment")
	contains(content, "algorithm")
}

bias_detection_pattern(content) if {
	contains(content, "disparate impact")
	contains(content, "ai")
}

bias_detection_pattern(content) if {
	contains(content, "model drift")
	contains(content, "detected")
}

# Risk management markers
risk_management_present(content) if {
	contains(content, "incident-response-plan")
}

risk_management_present(content) if {
	contains(content, "risk-mitigation-id")
}

risk_management_present(content) if {
	contains(content, "manage-approved")
}

risk_management_present(content) if {
	contains(content, "response plan")
	contains(content, "activated")
}

risk_management_present(content) if {
	contains(content, "mitigation strategy")
	contains(content, "documented")
}
