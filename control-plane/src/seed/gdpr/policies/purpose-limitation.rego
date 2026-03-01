# GDPR - Article 5(1)(b): Purpose limitation
#
# Blocks prompts that indicate data processing beyond stated purposes.
# Detects requests to repurpose personal data for undeclared objectives
# such as marketing, profiling, or sharing with third parties without
# documented purpose alignment.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block purpose deviation for personal data
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	personal_data_context(content)
	purpose_deviation_pattern(content)
	result := {
		"action": "block",
		"reason": "GDPR Article 5(1)(b) - Purpose Limitation: Processing of personal data for purposes incompatible with the original collection purpose detected. Data must only be processed for specified, explicit and legitimate purposes.",
		"redactions": [],
	}
}

# Personal data context indicators
personal_data_context(content) if {
	contains(content, "customer data")
}

personal_data_context(content) if {
	contains(content, "user data")
}

personal_data_context(content) if {
	contains(content, "personal information")
}

personal_data_context(content) if {
	contains(content, "employee records")
}

personal_data_context(content) if {
	contains(content, "patient data")
}

personal_data_context(content) if {
	contains(content, "subscriber")
	contains(content, "data")
}

# Purpose deviation patterns
purpose_deviation_pattern(content) if {
	contains(content, "also use this data for marketing")
}

purpose_deviation_pattern(content) if {
	contains(content, "repurpose")
	contains(content, "data")
}

purpose_deviation_pattern(content) if {
	contains(content, "use for a different purpose")
}

purpose_deviation_pattern(content) if {
	contains(content, "share with third part")
}

purpose_deviation_pattern(content) if {
	contains(content, "cross-sell")
	contains(content, "data")
}

purpose_deviation_pattern(content) if {
	contains(content, "use their data to train")
}

purpose_deviation_pattern(content) if {
	contains(content, "additional processing")
	not contains(content, "consent")
}

purpose_deviation_pattern(content) if {
	contains(content, "secondary use")
	not contains(content, "compatible purpose")
}
