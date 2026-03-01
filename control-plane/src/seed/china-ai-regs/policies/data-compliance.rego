# China AI Regulations - PIPL Articles 13-14: Personal information processing compliance
#
# Blocks processing of personal information without consent or other lawful
# conditions. The PIPL requires clear and reasonable purpose with individual
# consent for personal information processing.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block personal information processing without consent
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	personal_info_processing_pattern(content)
	not pipl_consent_marker_present(content)
	result := {
		"action": "block",
		"reason": "China PIPL Articles 13-14 - Data Compliance: Personal information processing detected without consent or lawful basis. Individual consent or other lawful conditions are required.",
		"redactions": [],
	}
}

# Block data collection in China context without compliance
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	china_data_collection_pattern(content)
	not pipl_consent_marker_present(content)
	result := {
		"action": "block",
		"reason": "China PIPL Articles 13-14 - Data Compliance: Collection of user data in Chinese jurisdiction detected without compliance markers. Processing must have a clear and reasonable purpose with proper consent.",
		"redactions": [],
	}
}

# Personal information processing patterns
personal_info_processing_pattern(content) if {
	contains(content, "process personal information")
	contains(content, "china")
}

personal_info_processing_pattern(content) if {
	contains(content, "collect user data")
	contains(content, "chinese")
}

personal_info_processing_pattern(content) if {
	contains(content, "handle individual data")
	contains(content, "prc")
}

personal_info_processing_pattern(content) if {
	contains(content, "process citizen data")
	contains(content, "china")
}

personal_info_processing_pattern(content) if {
	contains(content, "collect personal information")
	contains(content, "mainland")
}

personal_info_processing_pattern(content) if {
	contains(content, "pipl")
	contains(content, "process")
}

# China data collection patterns
china_data_collection_pattern(content) if {
	contains(content, "collect data")
	contains(content, "chinese user")
}

china_data_collection_pattern(content) if {
	contains(content, "gather personal data")
	contains(content, "china")
}

china_data_collection_pattern(content) if {
	contains(content, "harvest data")
	contains(content, "chinese")
}

china_data_collection_pattern(content) if {
	contains(content, "user tracking")
	contains(content, "china")
}

china_data_collection_pattern(content) if {
	contains(content, "data collection")
	contains(content, "prc jurisdiction")
}

# PIPL consent markers
pipl_consent_marker_present(content) if {
	contains(content, "pipl-consent")
}

pipl_consent_marker_present(content) if {
	contains(content, "lawful-basis-cn")
}

pipl_consent_marker_present(content) if {
	contains(content, "data-processing-agreement")
}

pipl_consent_marker_present(content) if {
	contains(content, "pipl consent obtained")
}

pipl_consent_marker_present(content) if {
	contains(content, "lawful basis")
	contains(content, "china")
}
