# GCC - UAE PDPL Article 22 / Saudi PDPL Article 29: Data localization
#
# Blocks transfer of personal data outside GCC jurisdictions without
# adequate protection measures or explicit consent. Data localization
# requirements may apply to certain categories of personal data.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block data transfer outside GCC without authorization
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	data_transfer_pattern(content)
	not localization_marker_present(content)
	result := {
		"action": "block",
		"reason": "GCC UAE PDPL Art. 22 / Saudi PDPL Art. 29 - Data Localization: Transfer of personal data outside jurisdiction detected without authorization. Adequate protection measures or explicit consent are required.",
		"redactions": [],
	}
}

# Block offshore data storage without approval
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	offshore_storage_pattern(content)
	not localization_marker_present(content)
	result := {
		"action": "block",
		"reason": "GCC UAE PDPL Art. 22 / Saudi PDPL Art. 29 - Data Localization: Storage of personal data outside GCC jurisdiction detected. Data localization requirements must be satisfied before offshore storage.",
		"redactions": [],
	}
}

# Data transfer patterns
data_transfer_pattern(content) if {
	contains(content, "transfer data abroad")
}

data_transfer_pattern(content) if {
	contains(content, "send data overseas")
}

data_transfer_pattern(content) if {
	contains(content, "store data outside gcc")
}

data_transfer_pattern(content) if {
	contains(content, "cross-border data flow")
}

data_transfer_pattern(content) if {
	contains(content, "export data")
	contains(content, "uae")
}

data_transfer_pattern(content) if {
	contains(content, "transfer personal data")
	contains(content, "foreign")
}

# Offshore storage patterns
offshore_storage_pattern(content) if {
	contains(content, "store data")
	contains(content, "outside uae")
}

offshore_storage_pattern(content) if {
	contains(content, "cloud storage")
	contains(content, "foreign server")
}

offshore_storage_pattern(content) if {
	contains(content, "data center")
	contains(content, "outside kingdom")
}

offshore_storage_pattern(content) if {
	contains(content, "host data")
	contains(content, "overseas")
}

offshore_storage_pattern(content) if {
	contains(content, "migrate data")
	contains(content, "international")
}

# Localization markers
localization_marker_present(content) if {
	contains(content, "data-localization-approved")
}

localization_marker_present(content) if {
	contains(content, "transfer-authorization")
}

localization_marker_present(content) if {
	contains(content, "adequacy-decision")
}

localization_marker_present(content) if {
	contains(content, "transfer authorized")
}

localization_marker_present(content) if {
	contains(content, "localization requirement")
	contains(content, "satisfied")
}
