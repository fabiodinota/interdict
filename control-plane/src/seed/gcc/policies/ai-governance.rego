# GCC - UAE National AI Strategy 2031: AI governance principles
#
# Blocks AI system deployment and automated decisions without governance
# and ethical oversight. AI systems must be developed in accordance with
# ethical principles, transparency, and human oversight standards.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block AI deployment without governance review
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	ai_deployment_pattern(content)
	not governance_marker_present(content)
	result := {
		"action": "block",
		"reason": "GCC UAE AI Strategy 2031 - AI Governance: AI system deployment detected without ethics review. AI systems must comply with ethical principles, transparency, and human oversight requirements.",
		"redactions": [],
	}
}

# Block automated decisions without human oversight
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	automated_decision_pattern(content)
	not governance_marker_present(content)
	result := {
		"action": "block",
		"reason": "GCC UAE AI Strategy 2031 - AI Governance: Automated decision-making detected without human oversight. AI-driven services must include human oversight and ethical governance.",
		"redactions": [],
	}
}

# AI deployment patterns
ai_deployment_pattern(content) if {
	contains(content, "deploy ai system")
	contains(content, "uae")
}

ai_deployment_pattern(content) if {
	contains(content, "launch ai service")
	contains(content, "gcc")
}

ai_deployment_pattern(content) if {
	contains(content, "ai system")
	contains(content, "production")
	contains(content, "gulf")
}

ai_deployment_pattern(content) if {
	contains(content, "deploy ai")
	contains(content, "emirates")
}

ai_deployment_pattern(content) if {
	contains(content, "ai platform")
	contains(content, "deploy")
	contains(content, "gcc")
}

ai_deployment_pattern(content) if {
	contains(content, "operationalize ai")
	contains(content, "middle east")
}

# Automated decision patterns
automated_decision_pattern(content) if {
	contains(content, "automated decision")
	contains(content, "uae")
}

automated_decision_pattern(content) if {
	contains(content, "ai-driven service")
	contains(content, "gcc")
}

automated_decision_pattern(content) if {
	contains(content, "algorithmic decision")
	contains(content, "emirates")
}

automated_decision_pattern(content) if {
	contains(content, "ai judgment")
	contains(content, "citizen")
	contains(content, "gulf")
}

automated_decision_pattern(content) if {
	contains(content, "autonomous system")
	contains(content, "public service")
	contains(content, "uae")
}

# Governance markers
governance_marker_present(content) if {
	contains(content, "ai-ethics-review")
}

governance_marker_present(content) if {
	contains(content, "governance-approved")
}

governance_marker_present(content) if {
	contains(content, "human-oversight-confirmed")
}

governance_marker_present(content) if {
	contains(content, "ethics review")
	contains(content, "completed")
}

governance_marker_present(content) if {
	contains(content, "human oversight")
	contains(content, "confirmed")
}
