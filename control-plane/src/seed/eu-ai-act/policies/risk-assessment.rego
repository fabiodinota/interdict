# EU AI Act - Article 9: Risk management system
#
# Blocks high-risk AI usage without risk assessment context.
# Detects prompts related to biometric identification, critical
# infrastructure, law enforcement, and other high-risk categories
# defined in Annex III. Article 9 requires a documented risk
# management system for high-risk AI.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block high-risk AI usage without risk assessment context
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	high_risk_category(content)
	not risk_assessment_present(content)
	result := {
		"action": "block",
		"reason": "EU AI Act Article 9 - Risk Management: High-risk AI usage detected without risk assessment context. A documented risk management system is required for high-risk AI applications.",
		"redactions": [],
	}
}

# High-risk categories per EU AI Act Annex III
high_risk_category(content) if {
	contains(content, "biometric identification")
}

high_risk_category(content) if {
	contains(content, "facial recognition")
}

high_risk_category(content) if {
	contains(content, "emotion recognition")
}

high_risk_category(content) if {
	contains(content, "critical infrastructure")
}

high_risk_category(content) if {
	contains(content, "power grid")
}

high_risk_category(content) if {
	contains(content, "water supply")
	contains(content, "control")
}

high_risk_category(content) if {
	contains(content, "law enforcement")
	contains(content, "predict")
}

high_risk_category(content) if {
	contains(content, "border control")
	contains(content, "automat")
}

high_risk_category(content) if {
	contains(content, "social scoring")
}

high_risk_category(content) if {
	contains(content, "creditworthiness")
	contains(content, "natural person")
}

# Risk assessment markers
risk_assessment_present(content) if {
	contains(content, "risk assessment")
}

risk_assessment_present(content) if {
	contains(content, "risk-assessment")
}

risk_assessment_present(content) if {
	contains(content, "risk management plan")
}

risk_assessment_present(content) if {
	contains(content, "rms-id:")
}

risk_assessment_present(content) if {
	contains(content, "conformity assessment")
}
