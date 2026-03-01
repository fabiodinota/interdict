# GCC - UAE PDPL Articles 5-6: Consent for processing
#
# Blocks processing of personal data without clear and explicit consent
# of the data subject. Processing is only permitted with consent or
# under specific lawful conditions.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block personal data processing without consent
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	data_processing_pattern(content)
	not gcc_consent_marker_present(content)
	result := {
		"action": "block",
		"reason": "GCC UAE PDPL Articles 5-6 - Consent: Processing of personal data detected without clear and explicit consent. Data subject consent or lawful conditions are required for processing.",
		"redactions": [],
	}
}

# Block sensitive data handling without explicit consent
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	sensitive_data_pattern(content)
	not gcc_consent_marker_present(content)
	result := {
		"action": "block",
		"reason": "GCC UAE PDPL Articles 5-6 - Consent: Sensitive personal data processing detected without explicit consent. Clear and explicit consent is mandatory for sensitive data categories.",
		"redactions": [],
	}
}

# Data processing patterns
data_processing_pattern(content) if {
	contains(content, "process personal data")
	contains(content, "uae")
}

data_processing_pattern(content) if {
	contains(content, "collect sensitive data")
	contains(content, "gulf")
}

data_processing_pattern(content) if {
	contains(content, "handle individual data")
	contains(content, "gcc")
}

data_processing_pattern(content) if {
	contains(content, "process customer data")
	contains(content, "saudi")
}

data_processing_pattern(content) if {
	contains(content, "collect user data")
	contains(content, "emirates")
}

data_processing_pattern(content) if {
	contains(content, "personal data processing")
	contains(content, "bahrain")
}

# Sensitive data patterns
sensitive_data_pattern(content) if {
	contains(content, "health data")
	contains(content, "gcc")
}

sensitive_data_pattern(content) if {
	contains(content, "biometric")
	contains(content, "uae")
}

sensitive_data_pattern(content) if {
	contains(content, "religious data")
	contains(content, "process")
}

sensitive_data_pattern(content) if {
	contains(content, "ethnic origin")
	contains(content, "data")
	contains(content, "gulf")
}

sensitive_data_pattern(content) if {
	contains(content, "financial data")
	contains(content, "gcc")
	contains(content, "process")
}

# GCC consent markers
gcc_consent_marker_present(content) if {
	contains(content, "gcc-consent-obtained")
}

gcc_consent_marker_present(content) if {
	contains(content, "lawful-basis-gcc")
}

gcc_consent_marker_present(content) if {
	contains(content, "consent-ref-gcc")
}

gcc_consent_marker_present(content) if {
	contains(content, "explicit consent")
	contains(content, "obtained")
}

gcc_consent_marker_present(content) if {
	contains(content, "data subject consented")
}
