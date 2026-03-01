# India DPDP Act - Section 8: Data breach notification
#
# Blocks handling of data breaches without notification markers. In the
# event of a personal data breach, the Data Fiduciary must notify the
# Board and each affected Data Principal.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block breach handling without notification
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	breach_pattern(content)
	not notification_marker_present(content)
	result := {
		"action": "block",
		"reason": "India DPDP Section 8 - Breach Notification: Personal data breach detected without notification markers. The Data Fiduciary must notify the Board and affected Data Principals of any breach.",
		"redactions": [],
	}
}

# Block unauthorized access without incident reporting
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	unauthorized_access_pattern(content)
	not notification_marker_present(content)
	result := {
		"action": "block",
		"reason": "India DPDP Section 8 - Breach Notification: Unauthorized access to personal data detected without incident reporting. Breach notification to the Board and affected individuals is mandatory.",
		"redactions": [],
	}
}

# Breach patterns
breach_pattern(content) if {
	contains(content, "data breach")
	contains(content, "personal")
}

breach_pattern(content) if {
	contains(content, "data leak")
}

breach_pattern(content) if {
	contains(content, "personal data exposed")
}

breach_pattern(content) if {
	contains(content, "data breach occurred")
}

breach_pattern(content) if {
	contains(content, "breach of personal data")
}

breach_pattern(content) if {
	contains(content, "compromised personal data")
}

# Unauthorized access patterns
unauthorized_access_pattern(content) if {
	contains(content, "unauthorized access")
	contains(content, "personal data")
}

unauthorized_access_pattern(content) if {
	contains(content, "data stolen")
}

unauthorized_access_pattern(content) if {
	contains(content, "exfiltrated personal data")
}

unauthorized_access_pattern(content) if {
	contains(content, "leaked user data")
}

unauthorized_access_pattern(content) if {
	contains(content, "data exfiltration")
	contains(content, "individual")
}

# Notification markers
notification_marker_present(content) if {
	contains(content, "breach-notification-sent")
}

notification_marker_present(content) if {
	contains(content, "dpb-notified")
}

notification_marker_present(content) if {
	contains(content, "incident-reported")
}

notification_marker_present(content) if {
	contains(content, "breach notification")
	contains(content, "sent")
}

notification_marker_present(content) if {
	contains(content, "board notified")
}
