# EU AI Act - Article 14: Human oversight
#
# Flags automated decision-making prompts that involve high-impact
# domains (hiring, lending, legal, medical) without indicators of
# human review or oversight. Article 14 requires that high-risk AI
# systems allow effective human oversight.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block automated decisions in high-impact domains without human oversight markers
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	high_impact_decision(content)
	automated_decision_indicator(content)
	not human_oversight_present(content)
	result := {
		"action": "block",
		"reason": "EU AI Act Article 14 - Human Oversight: Automated decision-making detected in a high-impact domain without human review indicators. High-risk AI decisions require effective human oversight.",
		"redactions": [],
	}
}

# High-impact decision domains per EU AI Act Annex III
high_impact_decision(content) if {
	contains(content, "hiring decision")
}

high_impact_decision(content) if {
	contains(content, "reject candidate")
}

high_impact_decision(content) if {
	contains(content, "approve loan")
}

high_impact_decision(content) if {
	contains(content, "deny loan")
}

high_impact_decision(content) if {
	contains(content, "credit decision")
}

high_impact_decision(content) if {
	contains(content, "legal verdict")
}

high_impact_decision(content) if {
	contains(content, "sentencing recommendation")
}

high_impact_decision(content) if {
	contains(content, "medical diagnosis")
}

high_impact_decision(content) if {
	contains(content, "insurance claim")
	contains(content, "deny")
}

high_impact_decision(content) if {
	contains(content, "terminate employee")
}

# Indicators of automated processing without human review
automated_decision_indicator(content) if {
	contains(content, "automatically")
}

automated_decision_indicator(content) if {
	contains(content, "auto-approve")
}

automated_decision_indicator(content) if {
	contains(content, "make the final decision")
}

automated_decision_indicator(content) if {
	contains(content, "decide without")
}

automated_decision_indicator(content) if {
	contains(content, "no review needed")
}

automated_decision_indicator(content) if {
	contains(content, "process immediately")
}

# Human oversight markers
human_oversight_present(content) if {
	contains(content, "human review")
}

human_oversight_present(content) if {
	contains(content, "manual review")
}

human_oversight_present(content) if {
	contains(content, "pending approval")
}

human_oversight_present(content) if {
	contains(content, "subject to review")
}

human_oversight_present(content) if {
	contains(content, "recommendation only")
}

human_oversight_present(content) if {
	contains(content, "for review by")
}
