# Singapore PDPA - Sections 13-17: Consent obligation
#
# Blocks collection, use, or disclosure of personal data without consent
# indicators. The PDPA requires that individuals give or are deemed to
# have given consent before their personal data is processed.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block personal data collection without consent
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	personal_data_collection_pattern(content)
	not consent_indicator_present(content)
	result := {
		"action": "block",
		"reason": "Singapore PDPA Sections 13-17 - Consent: Collection, use, or disclosure of personal data detected without consent indicators. Individual consent must be obtained before processing personal data.",
		"redactions": [],
	}
}

# Block use of customer data without consent context
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	customer_data_use_pattern(content)
	not consent_indicator_present(content)
	result := {
		"action": "block",
		"reason": "Singapore PDPA Sections 13-17 - Consent: Use of customer or user data detected without consent. Organisations must not use personal data without the individual's consent.",
		"redactions": [],
	}
}

# Personal data collection patterns
personal_data_collection_pattern(content) if {
	contains(content, "collect personal data")
}

personal_data_collection_pattern(content) if {
	contains(content, "gather personal information")
}

personal_data_collection_pattern(content) if {
	contains(content, "obtain individual data")
}

personal_data_collection_pattern(content) if {
	contains(content, "harvest user data")
}

personal_data_collection_pattern(content) if {
	contains(content, "scrape personal data")
}

personal_data_collection_pattern(content) if {
	contains(content, "collect nric")
}

# Customer data use patterns
customer_data_use_pattern(content) if {
	contains(content, "use customer data")
	not contains(content, "anonymi")
}

customer_data_use_pattern(content) if {
	contains(content, "process user information")
}

customer_data_use_pattern(content) if {
	contains(content, "disclose personal data")
}

customer_data_use_pattern(content) if {
	contains(content, "share individual data")
	contains(content, "third party")
}

customer_data_use_pattern(content) if {
	contains(content, "transfer personal data")
	contains(content, "partner")
}

# Consent indicators
consent_indicator_present(content) if {
	contains(content, "pdpa-consent-obtained")
}

consent_indicator_present(content) if {
	contains(content, "consent-ref")
}

consent_indicator_present(content) if {
	contains(content, "deemed-consent")
}

consent_indicator_present(content) if {
	contains(content, "consent obtained")
}

consent_indicator_present(content) if {
	contains(content, "individual consented")
}
