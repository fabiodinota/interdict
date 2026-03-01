# Canada PIPEDA - Principle 1: Accountability
#
# Blocks processing of personal information without accountability markers.
# An organization is responsible for personal information under its control
# and must designate an individual accountable for compliance.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block personal information processing without accountability
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	personal_info_pattern(content)
	not accountability_marker_present(content)
	result := {
		"action": "block",
		"reason": "PIPEDA Principle 1 - Accountability: Processing of personal information detected without accountability markers. A designated individual must be accountable for compliance with data protection obligations.",
		"redactions": [],
	}
}

# Block data handling without compliance officer
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	data_handling_pattern(content)
	not accountability_marker_present(content)
	result := {
		"action": "block",
		"reason": "PIPEDA Principle 1 - Accountability: Handling of customer data detected without designated accountability. Organizations must assign responsibility for personal information protection.",
		"redactions": [],
	}
}

# Personal information patterns
personal_info_pattern(content) if {
	contains(content, "process personal information")
}

personal_info_pattern(content) if {
	contains(content, "handle customer data")
	not contains(content, "anonymous")
}

personal_info_pattern(content) if {
	contains(content, "collect personal data")
	contains(content, "canad")
}

personal_info_pattern(content) if {
	contains(content, "store individual data")
	contains(content, "organization")
}

personal_info_pattern(content) if {
	contains(content, "manage personal records")
}

personal_info_pattern(content) if {
	contains(content, "process employee data")
	contains(content, "canad")
}

# Data handling patterns
data_handling_pattern(content) if {
	contains(content, "transfer personal data")
	contains(content, "third party")
	contains(content, "canad")
}

data_handling_pattern(content) if {
	contains(content, "outsource data processing")
	contains(content, "personal")
}

data_handling_pattern(content) if {
	contains(content, "delegate data handling")
}

data_handling_pattern(content) if {
	contains(content, "share personal information")
	contains(content, "service provider")
}

data_handling_pattern(content) if {
	contains(content, "vendor access")
	contains(content, "personal data")
}

# Accountability markers
accountability_marker_present(content) if {
	contains(content, "dpo-assigned")
}

accountability_marker_present(content) if {
	contains(content, "accountability-ref")
}

accountability_marker_present(content) if {
	contains(content, "compliance-officer")
}

accountability_marker_present(content) if {
	contains(content, "privacy officer")
	contains(content, "designated")
}

accountability_marker_present(content) if {
	contains(content, "accountability framework")
}
