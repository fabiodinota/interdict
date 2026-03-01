# Singapore PDPA - Section 18: Purpose limitation obligation
#
# Blocks use of personal data for purposes that a reasonable person would
# not consider appropriate. Detects repurposing, secondary use, and
# monetization of personal data beyond stated collection purposes.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block data repurposing without purpose declaration
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	purpose_deviation_pattern(content)
	not purpose_indicator_present(content)
	result := {
		"action": "block",
		"reason": "Singapore PDPA Section 18 - Purpose Limitation: Personal data use beyond stated purpose detected. Data may only be used for purposes a reasonable person would consider appropriate.",
		"redactions": [],
	}
}

# Block data monetization
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	monetization_pattern(content)
	not purpose_indicator_present(content)
	result := {
		"action": "block",
		"reason": "Singapore PDPA Section 18 - Purpose Limitation: Data monetization or sale detected without declared purpose. Personal data must not be used for undeclared commercial purposes.",
		"redactions": [],
	}
}

# Purpose deviation patterns
purpose_deviation_pattern(content) if {
	contains(content, "repurpose data")
}

purpose_deviation_pattern(content) if {
	contains(content, "secondary use of personal data")
}

purpose_deviation_pattern(content) if {
	contains(content, "use data for different purpose")
}

purpose_deviation_pattern(content) if {
	contains(content, "additional processing")
	contains(content, "personal data")
}

purpose_deviation_pattern(content) if {
	contains(content, "cross-reference")
	contains(content, "personal data")
}

purpose_deviation_pattern(content) if {
	contains(content, "combine data sets")
	contains(content, "individual")
}

# Monetization patterns
monetization_pattern(content) if {
	contains(content, "sell user data")
}

monetization_pattern(content) if {
	contains(content, "monetize data")
}

monetization_pattern(content) if {
	contains(content, "sell personal data")
}

monetization_pattern(content) if {
	contains(content, "data broker")
	contains(content, "personal")
}

monetization_pattern(content) if {
	contains(content, "trade customer data")
}

# Purpose indicators
purpose_indicator_present(content) if {
	contains(content, "purpose-declared")
}

purpose_indicator_present(content) if {
	contains(content, "reasonable-purpose")
}

purpose_indicator_present(content) if {
	contains(content, "purpose-notification")
}

purpose_indicator_present(content) if {
	contains(content, "notified purpose")
}

purpose_indicator_present(content) if {
	contains(content, "declared purpose")
}
