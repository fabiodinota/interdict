# Singapore PDPA - Section 24: Protection obligation
#
# Blocks insecure handling of personal data. Organisations must make
# reasonable security arrangements to protect personal data in their
# possession or under their control.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block insecure data storage
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	insecure_storage_pattern(content)
	not security_marker_present(content)
	result := {
		"action": "block",
		"reason": "Singapore PDPA Section 24 - Protection: Insecure handling of personal data detected. Reasonable security arrangements must be in place to protect personal data.",
		"redactions": [],
	}
}

# Block insecure data transmission
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	insecure_transmission_pattern(content)
	not security_marker_present(content)
	result := {
		"action": "block",
		"reason": "Singapore PDPA Section 24 - Protection: Insecure data transmission detected. Personal data must be protected with reasonable security during transfer.",
		"redactions": [],
	}
}

# Insecure storage patterns
insecure_storage_pattern(content) if {
	contains(content, "store personal data")
	contains(content, "unencrypted")
}

insecure_storage_pattern(content) if {
	contains(content, "plaintext")
	contains(content, "personal data")
}

insecure_storage_pattern(content) if {
	contains(content, "expose personal data")
}

insecure_storage_pattern(content) if {
	contains(content, "publicly accessible")
	contains(content, "personal data")
}

insecure_storage_pattern(content) if {
	contains(content, "no encryption")
	contains(content, "personal")
}

insecure_storage_pattern(content) if {
	contains(content, "store password")
	contains(content, "plain")
}

# Insecure transmission patterns
insecure_transmission_pattern(content) if {
	contains(content, "transmit data without security")
}

insecure_transmission_pattern(content) if {
	contains(content, "send personal data")
	contains(content, "unencrypted")
}

insecure_transmission_pattern(content) if {
	contains(content, "transfer without encryption")
}

insecure_transmission_pattern(content) if {
	contains(content, "email personal data")
	contains(content, "unsecured")
}

insecure_transmission_pattern(content) if {
	contains(content, "http://")
	contains(content, "personal data")
}

# Security markers
security_marker_present(content) if {
	contains(content, "encrypted")
}

security_marker_present(content) if {
	contains(content, "security-controls")
}

security_marker_present(content) if {
	contains(content, "protection-verified")
}

security_marker_present(content) if {
	contains(content, "tls")
	contains(content, "enabled")
}

security_marker_present(content) if {
	contains(content, "encryption applied")
}
