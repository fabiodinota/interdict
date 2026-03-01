# GCC - Saudi PDPL Article 29: Cross-border data transfer
#
# Blocks transfer of personal data outside Saudi Arabia without adequate
# protections. Transfers must serve a purpose consistent with the original
# collection and have appropriate safeguards in place.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block cross-border data export without assessment
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	cross_border_pattern(content)
	not transfer_marker_present(content)
	result := {
		"action": "block",
		"reason": "GCC Saudi PDPL Article 29 - Cross-Border Transfer: Transfer of personal data outside the Kingdom detected without adequate protections. Transfer assessment and safeguards are required.",
		"redactions": [],
	}
}

# Block international data sharing without authorization
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	international_sharing_pattern(content)
	not transfer_marker_present(content)
	result := {
		"action": "block",
		"reason": "GCC Saudi PDPL Article 29 - Cross-Border Transfer: International data sharing detected without SDAIA approval. Transfer must serve original collection purpose with adequate protections.",
		"redactions": [],
	}
}

# Cross-border patterns
cross_border_pattern(content) if {
	contains(content, "export data from saudi")
}

cross_border_pattern(content) if {
	contains(content, "transfer data to foreign server")
}

cross_border_pattern(content) if {
	contains(content, "send data outside kingdom")
}

cross_border_pattern(content) if {
	contains(content, "cross-border transfer")
	contains(content, "saudi")
}

cross_border_pattern(content) if {
	contains(content, "move data")
	contains(content, "outside saudi")
}

cross_border_pattern(content) if {
	contains(content, "data export")
	contains(content, "ksa")
}

# International sharing patterns
international_sharing_pattern(content) if {
	contains(content, "international data sharing")
	contains(content, "saudi")
}

international_sharing_pattern(content) if {
	contains(content, "share data")
	contains(content, "foreign entity")
	contains(content, "saudi")
}

international_sharing_pattern(content) if {
	contains(content, "provide data")
	contains(content, "international partner")
}

international_sharing_pattern(content) if {
	contains(content, "replicate data")
	contains(content, "foreign jurisdiction")
}

international_sharing_pattern(content) if {
	contains(content, "sync data")
	contains(content, "international")
	contains(content, "personal")
}

# Transfer markers
transfer_marker_present(content) if {
	contains(content, "transfer-assessment")
}

transfer_marker_present(content) if {
	contains(content, "sdaia-approved")
}

transfer_marker_present(content) if {
	contains(content, "adequate-protection")
}

transfer_marker_present(content) if {
	contains(content, "transfer assessment")
	contains(content, "completed")
}

transfer_marker_present(content) if {
	contains(content, "cross-border authorization")
}
