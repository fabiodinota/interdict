# Singapore PDPA - Sections 21-22: Access and correction obligations
#
# Blocks denial of data access or correction requests. Organisations
# must provide individuals with access to their personal data and the
# ability to correct errors or omissions.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block denial of data access requests
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	access_denial_pattern(content)
	not access_marker_present(content)
	result := {
		"action": "block",
		"reason": "Singapore PDPA Sections 21-22 - Access and Correction: Denial of data access request detected. Organisations must provide individuals access to their personal data upon request.",
		"redactions": [],
	}
}

# Block refusal of correction requests
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	correction_refusal_pattern(content)
	not access_marker_present(content)
	result := {
		"action": "block",
		"reason": "Singapore PDPA Sections 21-22 - Access and Correction: Refusal of data correction request detected. Individuals have the right to correct errors or omissions in their personal data.",
		"redactions": [],
	}
}

# Access denial patterns
access_denial_pattern(content) if {
	contains(content, "deny data access")
}

access_denial_pattern(content) if {
	contains(content, "refuse access request")
}

access_denial_pattern(content) if {
	contains(content, "block data subject")
	contains(content, "access")
}

access_denial_pattern(content) if {
	contains(content, "reject data request")
}

access_denial_pattern(content) if {
	contains(content, "ignore access request")
}

access_denial_pattern(content) if {
	contains(content, "deny individual")
	contains(content, "personal data")
}

# Correction refusal patterns
correction_refusal_pattern(content) if {
	contains(content, "refuse correction request")
}

correction_refusal_pattern(content) if {
	contains(content, "deny correction")
}

correction_refusal_pattern(content) if {
	contains(content, "reject data correction")
}

correction_refusal_pattern(content) if {
	contains(content, "ignore correction request")
}

correction_refusal_pattern(content) if {
	contains(content, "block data correction")
}

# Access and correction markers
access_marker_present(content) if {
	contains(content, "access-granted")
}

access_marker_present(content) if {
	contains(content, "correction-processed")
}

access_marker_present(content) if {
	contains(content, "access-ref")
}

access_marker_present(content) if {
	contains(content, "access request fulfilled")
}

access_marker_present(content) if {
	contains(content, "correction completed")
}
