# Canada AIDA - Section 8: Risk assessment and harm mitigation
#
# Blocks high-impact AI usage without risk assessment and harm mitigation
# measures. Responsible persons must identify, assess, and mitigate risks
# of harm or biased output from AI systems.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block AI impacting individuals without harm assessment
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	ai_impact_pattern(content)
	not mitigation_marker_present(content)
	result := {
		"action": "block",
		"reason": "AIDA Section 8 - Harm Mitigation: AI system impacting individuals detected without harm assessment. Measures to identify, assess, and mitigate risks of harm must be established.",
		"redactions": [],
	}
}

# Block AI risk assessment without bias audit
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	bias_risk_pattern(content)
	not mitigation_marker_present(content)
	result := {
		"action": "block",
		"reason": "AIDA Section 8 - Harm Mitigation: AI-based scoring or assessment detected without bias audit. Risks of biased output must be identified and mitigated.",
		"redactions": [],
	}
}

# AI impact patterns
ai_impact_pattern(content) if {
	contains(content, "ai impacting individual")
}

ai_impact_pattern(content) if {
	contains(content, "automated scoring")
	contains(content, "person")
}

ai_impact_pattern(content) if {
	contains(content, "risk assessment using ai")
}

ai_impact_pattern(content) if {
	contains(content, "ai-driven ranking")
	contains(content, "people")
}

ai_impact_pattern(content) if {
	contains(content, "automated classification")
	contains(content, "individual")
}

ai_impact_pattern(content) if {
	contains(content, "ai system")
	contains(content, "deny benefit")
}

# Bias risk patterns
bias_risk_pattern(content) if {
	contains(content, "ai scoring")
	contains(content, "demographic")
}

bias_risk_pattern(content) if {
	contains(content, "predictive model")
	contains(content, "protected group")
}

bias_risk_pattern(content) if {
	contains(content, "automated decision")
	contains(content, "bias")
}

bias_risk_pattern(content) if {
	contains(content, "algorithmic bias")
}

bias_risk_pattern(content) if {
	contains(content, "discriminatory outcome")
	contains(content, "ai")
}

# Mitigation markers
mitigation_marker_present(content) if {
	contains(content, "harm-assessment")
}

mitigation_marker_present(content) if {
	contains(content, "risk-mitigated")
}

mitigation_marker_present(content) if {
	contains(content, "bias-audit-completed")
}

mitigation_marker_present(content) if {
	contains(content, "harm assessment")
	contains(content, "completed")
}

mitigation_marker_present(content) if {
	contains(content, "bias audit")
	contains(content, "passed")
}
