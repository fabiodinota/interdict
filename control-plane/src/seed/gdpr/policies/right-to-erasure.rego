# GDPR - Article 17: Right to erasure (right to be forgotten)
#
# Detects and blocks processing of data belonging to subjects who have
# exercised their right to erasure. Prevents continued use of data
# that should have been deleted.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block processing data marked for erasure
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	erasure_violation_pattern(content)
	result := {
		"action": "block",
		"reason": "GDPR Article 17 - Right to Erasure: Processing of data belonging to a subject who has exercised their right to erasure detected. Data marked for deletion must not be further processed.",
		"redactions": [],
	}
}

# Block references to deleted data subjects
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	deleted_subject_reference(content)
	result := {
		"action": "block",
		"reason": "GDPR Article 17 - Right to Erasure: Reference to a deleted or erased data subject detected. Records of erased individuals must not be accessed or processed.",
		"redactions": [],
	}
}

# Erasure violation patterns
erasure_violation_pattern(content) if {
	contains(content, "deleted user")
	contains(content, "data")
}

erasure_violation_pattern(content) if {
	contains(content, "erased")
	contains(content, "still process")
}

erasure_violation_pattern(content) if {
	contains(content, "marked for deletion")
	contains(content, "use")
}

erasure_violation_pattern(content) if {
	contains(content, "restore deleted")
	contains(content, "personal")
}

erasure_violation_pattern(content) if {
	contains(content, "recover erased data")
}

erasure_violation_pattern(content) if {
	contains(content, "backup")
	contains(content, "deleted user")
}

# Deleted subject reference patterns
deleted_subject_reference(content) if {
	contains(content, "erasure-request-id:")
}

deleted_subject_reference(content) if {
	contains(content, "data-subject-erased:")
}

deleted_subject_reference(content) if {
	contains(content, "right to be forgotten")
	contains(content, "override")
}

deleted_subject_reference(content) if {
	contains(content, "gdpr deletion")
	contains(content, "bypass")
}
