# India DPDP Act - Section 5: Purpose limitation
#
# Blocks processing of personal data beyond stated purposes. Personal data
# may only be processed for a lawful purpose for which the Data Principal
# has given consent, or for certain legitimate uses.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block data repurposing without lawful basis
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	purpose_violation_pattern(content)
	not purpose_marker_present(content)
	result := {
		"action": "block",
		"reason": "India DPDP Section 5 - Purpose Limitation: Processing of personal data beyond stated purpose detected. Data may only be processed for the lawful purpose for which consent was given.",
		"redactions": [],
	}
}

# Block undeclared data processing
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	undeclared_processing_pattern(content)
	not purpose_marker_present(content)
	result := {
		"action": "block",
		"reason": "India DPDP Section 5 - Purpose Limitation: Undeclared purpose for personal data processing detected. All processing purposes must be specified and consented to by the Data Principal.",
		"redactions": [],
	}
}

# Purpose violation patterns
purpose_violation_pattern(content) if {
	contains(content, "repurpose personal data")
}

purpose_violation_pattern(content) if {
	contains(content, "use data beyond stated purpose")
}

purpose_violation_pattern(content) if {
	contains(content, "secondary processing")
	contains(content, "personal data")
}

purpose_violation_pattern(content) if {
	contains(content, "additional purpose")
	contains(content, "personal data")
}

purpose_violation_pattern(content) if {
	contains(content, "use for marketing")
	contains(content, "personal data")
}

purpose_violation_pattern(content) if {
	contains(content, "share personal data")
	contains(content, "undisclosed")
}

# Undeclared processing patterns
undeclared_processing_pattern(content) if {
	contains(content, "process for undeclared purpose")
}

undeclared_processing_pattern(content) if {
	contains(content, "unstated purpose")
	contains(content, "data")
}

undeclared_processing_pattern(content) if {
	contains(content, "process without specifying")
	contains(content, "purpose")
}

undeclared_processing_pattern(content) if {
	contains(content, "no stated purpose")
	contains(content, "personal data")
}

undeclared_processing_pattern(content) if {
	contains(content, "unspecified use")
	contains(content, "individual data")
}

# Purpose markers
purpose_marker_present(content) if {
	contains(content, "purpose-declared")
}

purpose_marker_present(content) if {
	contains(content, "legitimate-use")
}

purpose_marker_present(content) if {
	contains(content, "lawful-purpose-ref")
}

purpose_marker_present(content) if {
	contains(content, "purpose specified")
}

purpose_marker_present(content) if {
	contains(content, "lawful purpose")
	contains(content, "documented")
}
