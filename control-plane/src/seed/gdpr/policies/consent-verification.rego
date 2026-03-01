# GDPR - Articles 6-7: Lawfulness and consent
#
# Blocks processing of personal data without consent indicators or
# other lawful basis. Detects prompts that process identifiable
# individuals' data without documented consent context.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block processing identifiable personal data without consent
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	identifiable_data_processing(content)
	not consent_indicator_present(content)
	not lawful_basis_present(content)
	result := {
		"action": "block",
		"reason": "GDPR Articles 6-7 - Consent: Processing of identifiable personal data detected without consent indicators or documented lawful basis. A valid legal basis is required for all personal data processing.",
		"redactions": [],
	}
}

# Identifiable data processing patterns
identifiable_data_processing(content) if {
	contains(content, "process personal data")
}

identifiable_data_processing(content) if {
	contains(content, "analyze user behavior")
}

identifiable_data_processing(content) if {
	contains(content, "track individual")
}

identifiable_data_processing(content) if {
	contains(content, "profile this person")
}

identifiable_data_processing(content) if {
	contains(content, "monitor employee")
}

identifiable_data_processing(content) if {
	contains(content, "process health data")
}

identifiable_data_processing(content) if {
	contains(content, "analyze customer")
	contains(content, "personal")
}

# Consent indicators
consent_indicator_present(content) if {
	contains(content, "consent obtained")
}

consent_indicator_present(content) if {
	contains(content, "consent-id:")
}

consent_indicator_present(content) if {
	contains(content, "user consented")
}

consent_indicator_present(content) if {
	contains(content, "opt-in confirmed")
}

consent_indicator_present(content) if {
	contains(content, "with consent")
}

# Other lawful bases under Article 6
lawful_basis_present(content) if {
	contains(content, "legal obligation")
}

lawful_basis_present(content) if {
	contains(content, "contractual necessity")
}

lawful_basis_present(content) if {
	contains(content, "vital interests")
}

lawful_basis_present(content) if {
	contains(content, "legitimate interest")
	contains(content, "assessment")
}

lawful_basis_present(content) if {
	contains(content, "public interest")
}
