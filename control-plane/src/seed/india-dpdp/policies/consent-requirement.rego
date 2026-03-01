# India DPDP Act - Section 6: Consent
#
# Blocks processing of personal data without consent of the Data Principal.
# The DPDP Act requires free, specific, informed, and unambiguous consent
# before processing any digital personal data.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block personal data processing without consent
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	personal_data_processing_pattern(content)
	not consent_marker_present(content)
	result := {
		"action": "block",
		"reason": "India DPDP Section 6 - Consent: Processing of personal data detected without Data Principal consent. Free, specific, informed, and unambiguous consent must be obtained before processing.",
		"redactions": [],
	}
}

# Block biometric data collection without explicit consent
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	sensitive_data_pattern(content)
	not consent_marker_present(content)
	result := {
		"action": "block",
		"reason": "India DPDP Section 6 - Consent: Sensitive personal data processing detected without explicit consent. Collection of biometric or health data requires informed consent of the Data Principal.",
		"redactions": [],
	}
}

# Personal data processing patterns
personal_data_processing_pattern(content) if {
	contains(content, "process personal data")
}

personal_data_processing_pattern(content) if {
	contains(content, "analyze individual data")
}

personal_data_processing_pattern(content) if {
	contains(content, "process citizen data")
}

personal_data_processing_pattern(content) if {
	contains(content, "handle personal information")
	contains(content, "india")
}

personal_data_processing_pattern(content) if {
	contains(content, "process aadhaar")
}

personal_data_processing_pattern(content) if {
	contains(content, "collect user data")
	contains(content, "indian")
}

# Sensitive data patterns
sensitive_data_pattern(content) if {
	contains(content, "collect biometric data")
}

sensitive_data_pattern(content) if {
	contains(content, "process health data")
}

sensitive_data_pattern(content) if {
	contains(content, "fingerprint data")
}

sensitive_data_pattern(content) if {
	contains(content, "iris scan")
	contains(content, "data")
}

sensitive_data_pattern(content) if {
	contains(content, "genetic data")
	contains(content, "process")
}

# Consent markers
consent_marker_present(content) if {
	contains(content, "dpdp-consent-obtained")
}

consent_marker_present(content) if {
	contains(content, "consent-ref")
}

consent_marker_present(content) if {
	contains(content, "data-principal-consent")
}

consent_marker_present(content) if {
	contains(content, "consent obtained")
}

consent_marker_present(content) if {
	contains(content, "informed consent")
	contains(content, "given")
}
