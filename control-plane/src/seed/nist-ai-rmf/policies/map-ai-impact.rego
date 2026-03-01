# NIST AI RMF - MAP 1.0: Context and risk identification
#
# Blocks AI usage that impacts vulnerable populations or makes high-stakes
# decisions without impact assessment context. MAP function requires that
# risks related to the AI system are identified and documented.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block high-impact AI usage without impact assessment
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	high_impact_ai_pattern(content)
	not impact_assessment_present(content)
	result := {
		"action": "block",
		"reason": "NIST AI RMF MAP 1.0 - Impact Mapping: High-impact AI application detected without documented impact assessment. AI risks must be identified and documented before deployment in sensitive contexts.",
		"redactions": [],
	}
}

# Block AI affecting vulnerable populations without safeguards
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	vulnerable_population_pattern(content)
	not impact_assessment_present(content)
	result := {
		"action": "block",
		"reason": "NIST AI RMF MAP 1.0 - Impact Mapping: AI usage affecting vulnerable populations detected without impact assessment. Risks to affected communities must be mapped and documented.",
		"redactions": [],
	}
}

# High-impact AI patterns
high_impact_ai_pattern(content) if {
	contains(content, "automated hiring")
}

high_impact_ai_pattern(content) if {
	contains(content, "automated lending")
}

high_impact_ai_pattern(content) if {
	contains(content, "predictive policing")
}

high_impact_ai_pattern(content) if {
	contains(content, "ai-based screening")
}

high_impact_ai_pattern(content) if {
	contains(content, "credit scoring")
	contains(content, "ai")
}

high_impact_ai_pattern(content) if {
	contains(content, "recidivism prediction")
}

# Vulnerable population patterns
vulnerable_population_pattern(content) if {
	contains(content, "vulnerable population")
}

vulnerable_population_pattern(content) if {
	contains(content, "children")
	contains(content, "ai decision")
}

vulnerable_population_pattern(content) if {
	contains(content, "elderly")
	contains(content, "automated")
}

vulnerable_population_pattern(content) if {
	contains(content, "disability")
	contains(content, "ai assessment")
}

vulnerable_population_pattern(content) if {
	contains(content, "disadvantaged communit")
	contains(content, "algorithm")
}

# Impact assessment markers
impact_assessment_present(content) if {
	contains(content, "impact-assessment-id")
}

impact_assessment_present(content) if {
	contains(content, "bia-completed")
}

impact_assessment_present(content) if {
	contains(content, "risk-mapped")
}

impact_assessment_present(content) if {
	contains(content, "impact assessment")
	contains(content, "completed")
}

impact_assessment_present(content) if {
	contains(content, "risk identification")
	contains(content, "documented")
}
