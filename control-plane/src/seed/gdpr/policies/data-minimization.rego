# GDPR - Article 5(1)(c): Data minimisation
#
# Flags prompts requesting more personal data than necessary for the
# stated purpose. Detects excessive data collection patterns and
# requests for unnecessary personal identifiers.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Detect excessive personal data collection
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	excessive_collection_pattern(content)
	result := {
		"action": "redact",
		"reason": "GDPR Article 5(1)(c) - Data Minimisation: Excessive personal data collection detected. Data processed must be adequate, relevant and limited to what is necessary for the stated purpose.",
		"redactions": [{"category": "EXCESSIVE_PII", "replacement": "[REDACTED:EXCESSIVE_DATA]"}],
	}
}

# Detect requests for unnecessary identifiers
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	unnecessary_identifier_pattern(content)
	result := {
		"action": "redact",
		"reason": "GDPR Article 5(1)(c) - Data Minimisation: Request for unnecessary personal identifiers detected. Only data that is strictly necessary for the processing purpose should be collected.",
		"redactions": [{"category": "UNNECESSARY_ID", "replacement": "[REDACTED:UNNECESSARY_ID]"}],
	}
}

# Excessive data collection patterns
excessive_collection_pattern(content) if {
	contains(content, "collect all available data")
}

excessive_collection_pattern(content) if {
	contains(content, "gather everything")
	contains(content, "about")
}

excessive_collection_pattern(content) if {
	contains(content, "full profile")
	contains(content, "including")
}

excessive_collection_pattern(content) if {
	contains(content, "all personal details")
}

excessive_collection_pattern(content) if {
	contains(content, "comprehensive data dump")
}

excessive_collection_pattern(content) if {
	contains(content, "extract all information")
}

# Unnecessary identifier patterns
unnecessary_identifier_pattern(content) if {
	contains(content, "social security number")
	not contains(content, "tax")
	not contains(content, "employment verification")
}

unnecessary_identifier_pattern(content) if {
	contains(content, "passport number")
	not contains(content, "travel")
	not contains(content, "identity verification")
}

unnecessary_identifier_pattern(content) if {
	contains(content, "biometric data")
	not contains(content, "security access")
}

unnecessary_identifier_pattern(content) if {
	contains(content, "genetic data")
	not contains(content, "medical treatment")
}
