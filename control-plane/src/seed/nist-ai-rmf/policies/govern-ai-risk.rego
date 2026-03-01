# NIST AI RMF - GOVERN 1.0: Governance and oversight
#
# Blocks AI deployment and production AI usage without governance markers.
# GOVERN function requires that organizational policies, processes, and
# practices for AI risk management are in place and transparent.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block AI deployment without governance context
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	ungoverned_ai_pattern(content)
	not governance_marker_present(content)
	result := {
		"action": "block",
		"reason": "NIST AI RMF GOVERN 1.0 - Governance: AI deployment or production use detected without governance oversight markers. Organizational AI governance policies must be in place before deployment.",
		"redactions": [],
	}
}

# Detect automated decision-making without oversight
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	automated_decision_pattern(content)
	not governance_marker_present(content)
	result := {
		"action": "block",
		"reason": "NIST AI RMF GOVERN 1.0 - Governance: Automated decision-making detected without AI governance review. Risk management policies must be established before automated decisions affect individuals.",
		"redactions": [],
	}
}

# Ungoverned AI deployment patterns
ungoverned_ai_pattern(content) if {
	contains(content, "deploy ai")
}

ungoverned_ai_pattern(content) if {
	contains(content, "deploy model to production")
}

ungoverned_ai_pattern(content) if {
	contains(content, "production ai system")
}

ungoverned_ai_pattern(content) if {
	contains(content, "release ai service")
}

ungoverned_ai_pattern(content) if {
	contains(content, "launch ai")
	contains(content, "production")
}

ungoverned_ai_pattern(content) if {
	contains(content, "operationalize ai")
}

# Automated decision-making patterns
automated_decision_pattern(content) if {
	contains(content, "automated decision")
	contains(content, "individual")
}

automated_decision_pattern(content) if {
	contains(content, "ai-driven decision")
}

automated_decision_pattern(content) if {
	contains(content, "algorithmic decision")
	contains(content, "people")
}

automated_decision_pattern(content) if {
	contains(content, "autonomous decision")
	contains(content, "customer")
}

automated_decision_pattern(content) if {
	contains(content, "machine learning")
	contains(content, "approval")
}

# Governance markers
governance_marker_present(content) if {
	contains(content, "governance-id")
}

governance_marker_present(content) if {
	contains(content, "risk-board-approved")
}

governance_marker_present(content) if {
	contains(content, "ai-governance-review")
}

governance_marker_present(content) if {
	contains(content, "governance framework")
	contains(content, "approved")
}

governance_marker_present(content) if {
	contains(content, "ai risk committee")
}
