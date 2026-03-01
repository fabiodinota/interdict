# Canada AIDA - Section 7: Transparency and explanation
#
# Blocks deployment of high-impact AI systems without transparency and
# explanation. Responsible persons must publish plain-language descriptions
# of the system, its intended uses, and risk mitigation measures.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block high-impact AI deployment without explanation
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	high_impact_ai_pattern(content)
	not explanation_marker_present(content)
	result := {
		"action": "block",
		"reason": "AIDA Section 7 - Transparency: High-impact AI system deployment detected without published explanation. Plain-language descriptions of the system and its risk mitigation measures are required.",
		"redactions": [],
	}
}

# Block AI-driven assessment without transparency
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	ai_assessment_pattern(content)
	not explanation_marker_present(content)
	result := {
		"action": "block",
		"reason": "AIDA Section 7 - Transparency: AI-driven assessment of individuals detected without transparency report. Persons responsible for high-impact AI must publish system descriptions and intended uses.",
		"redactions": [],
	}
}

# High-impact AI patterns
high_impact_ai_pattern(content) if {
	contains(content, "deploy high-impact ai")
}

high_impact_ai_pattern(content) if {
	contains(content, "high-impact ai system")
}

high_impact_ai_pattern(content) if {
	contains(content, "automated decision-making")
	contains(content, "significant impact")
}

high_impact_ai_pattern(content) if {
	contains(content, "ai system")
	contains(content, "employment decision")
}

high_impact_ai_pattern(content) if {
	contains(content, "ai-based eligibility")
}

high_impact_ai_pattern(content) if {
	contains(content, "automated assessment")
	contains(content, "benefit")
}

# AI assessment patterns
ai_assessment_pattern(content) if {
	contains(content, "ai-driven assessment")
}

ai_assessment_pattern(content) if {
	contains(content, "algorithmic assessment")
	contains(content, "individual")
}

ai_assessment_pattern(content) if {
	contains(content, "ai scoring")
	contains(content, "person")
}

ai_assessment_pattern(content) if {
	contains(content, "automated evaluation")
	contains(content, "applicant")
}

ai_assessment_pattern(content) if {
	contains(content, "machine learning")
	contains(content, "assess risk")
	contains(content, "person")
}

# Explanation markers
explanation_marker_present(content) if {
	contains(content, "explanation-published")
}

explanation_marker_present(content) if {
	contains(content, "transparency-report")
}

explanation_marker_present(content) if {
	contains(content, "aia-completed")
}

explanation_marker_present(content) if {
	contains(content, "system description")
	contains(content, "published")
}

explanation_marker_present(content) if {
	contains(content, "plain-language explanation")
}
