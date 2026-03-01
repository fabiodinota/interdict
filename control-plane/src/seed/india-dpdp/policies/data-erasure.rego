# India DPDP Act - Section 12: Right of erasure
#
# Blocks indefinite retention or refusal of erasure requests. Data
# Fiduciaries must erase personal data when it is no longer needed
# for the stated purpose or upon Data Principal request.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block indefinite data retention
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	retention_violation_pattern(content)
	not erasure_marker_present(content)
	result := {
		"action": "block",
		"reason": "India DPDP Section 12 - Erasure: Indefinite retention of personal data detected. Data Fiduciaries must erase personal data when no longer needed for the stated purpose.",
		"redactions": [],
	}
}

# Block erasure refusal
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	erasure_refusal_pattern(content)
	not erasure_marker_present(content)
	result := {
		"action": "block",
		"reason": "India DPDP Section 12 - Erasure: Refusal of data erasure request detected. Data Principals have the right to erasure of their personal data.",
		"redactions": [],
	}
}

# Retention violation patterns
retention_violation_pattern(content) if {
	contains(content, "retain personal data indefinitely")
}

retention_violation_pattern(content) if {
	contains(content, "keep data forever")
}

retention_violation_pattern(content) if {
	contains(content, "never delete")
	contains(content, "personal data")
}

retention_violation_pattern(content) if {
	contains(content, "permanent storage")
	contains(content, "personal data")
}

retention_violation_pattern(content) if {
	contains(content, "no retention limit")
	contains(content, "personal")
}

retention_violation_pattern(content) if {
	contains(content, "store indefinitely")
	contains(content, "individual data")
}

# Erasure refusal patterns
erasure_refusal_pattern(content) if {
	contains(content, "refuse erasure")
}

erasure_refusal_pattern(content) if {
	contains(content, "deny deletion request")
}

erasure_refusal_pattern(content) if {
	contains(content, "ignore deletion request")
}

erasure_refusal_pattern(content) if {
	contains(content, "reject erasure request")
}

erasure_refusal_pattern(content) if {
	contains(content, "cannot delete")
	contains(content, "personal data")
}

# Erasure markers
erasure_marker_present(content) if {
	contains(content, "retention-policy-ref")
}

erasure_marker_present(content) if {
	contains(content, "erasure-processed")
}

erasure_marker_present(content) if {
	contains(content, "legal-hold")
}

erasure_marker_present(content) if {
	contains(content, "retention policy")
	contains(content, "defined")
}

erasure_marker_present(content) if {
	contains(content, "erasure scheduled")
}
