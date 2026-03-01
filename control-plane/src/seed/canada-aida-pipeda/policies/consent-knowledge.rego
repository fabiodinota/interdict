# Canada PIPEDA - Principle 3: Consent and knowledge
#
# Blocks collection, use, or disclosure of personal information without
# consent and knowledge of the individual. Exceptions apply only in
# limited circumstances defined by law.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block personal information collection without consent
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	collection_without_consent_pattern(content)
	not consent_marker_present(content)
	result := {
		"action": "block",
		"reason": "PIPEDA Principle 3 - Consent: Collection of personal information detected without individual consent or knowledge. Consent is required for collection, use, or disclosure of personal information.",
		"redactions": [],
	}
}

# Block data sharing without individual knowledge
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	sharing_without_knowledge_pattern(content)
	not consent_marker_present(content)
	result := {
		"action": "block",
		"reason": "PIPEDA Principle 3 - Consent: Disclosure of personal information detected without individual knowledge. Individuals must be informed of and consent to how their data is shared.",
		"redactions": [],
	}
}

# Collection without consent patterns
collection_without_consent_pattern(content) if {
	contains(content, "collect personal information")
	not contains(content, "consent")
}

collection_without_consent_pattern(content) if {
	contains(content, "gather individual data")
	not contains(content, "permission")
}

collection_without_consent_pattern(content) if {
	contains(content, "use personal data")
	contains(content, "without informing")
}

collection_without_consent_pattern(content) if {
	contains(content, "covert collection")
	contains(content, "personal")
}

collection_without_consent_pattern(content) if {
	contains(content, "secretly collect")
	contains(content, "data")
}

collection_without_consent_pattern(content) if {
	contains(content, "collect without knowledge")
}

# Sharing without knowledge patterns
sharing_without_knowledge_pattern(content) if {
	contains(content, "share individual data")
	contains(content, "without")
}

sharing_without_knowledge_pattern(content) if {
	contains(content, "disclose personal")
	contains(content, "without knowledge")
}

sharing_without_knowledge_pattern(content) if {
	contains(content, "sell personal information")
}

sharing_without_knowledge_pattern(content) if {
	contains(content, "transfer personal data")
	contains(content, "without consent")
}

sharing_without_knowledge_pattern(content) if {
	contains(content, "share with third party")
	contains(content, "personal")
	not contains(content, "consent")
}

# Consent markers
consent_marker_present(content) if {
	contains(content, "consent-obtained-ca")
}

consent_marker_present(content) if {
	contains(content, "knowledge-provided")
}

consent_marker_present(content) if {
	contains(content, "pipeda-consent")
}

consent_marker_present(content) if {
	contains(content, "individual consent obtained")
}

consent_marker_present(content) if {
	contains(content, "informed and consented")
}
