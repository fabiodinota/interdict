# EU AI Act - Article 62: Reporting of serious incidents
#
# Detects prompts indicating potential serious incidents such as
# system failures, safety concerns, bias detection, or harm events.
# Article 62 requires providers to report serious incidents to market
# surveillance authorities.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Flag serious incident indicators
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	serious_incident_pattern(content)
	result := {
		"action": "block",
		"reason": "EU AI Act Article 62 - Incident Reporting: Potential serious incident detected. This event may require reporting to market surveillance authorities. Please route through the incident management process.",
		"redactions": [],
	}
}

# Flag bias and discrimination reports
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	bias_detection_pattern(content)
	result := {
		"action": "block",
		"reason": "EU AI Act Article 62 - Incident Reporting: Potential AI bias or discriminatory output detected. This may constitute a serious incident requiring investigation and reporting.",
		"redactions": [],
	}
}

# Serious incident patterns
serious_incident_pattern(content) if {
	contains(content, "system failure")
	contains(content, "ai")
}

serious_incident_pattern(content) if {
	contains(content, "safety incident")
}

serious_incident_pattern(content) if {
	contains(content, "caused harm")
	contains(content, "model")
}

serious_incident_pattern(content) if {
	contains(content, "serious malfunction")
}

serious_incident_pattern(content) if {
	contains(content, "unintended behavior")
	contains(content, "ai system")
}

serious_incident_pattern(content) if {
	contains(content, "risk to health")
}

serious_incident_pattern(content) if {
	contains(content, "risk to safety")
}

serious_incident_pattern(content) if {
	contains(content, "fundamental rights violation")
}

# Bias and discrimination patterns
bias_detection_pattern(content) if {
	contains(content, "discriminat")
	contains(content, "output")
}

bias_detection_pattern(content) if {
	contains(content, "biased result")
}

bias_detection_pattern(content) if {
	contains(content, "racial bias")
}

bias_detection_pattern(content) if {
	contains(content, "gender bias")
	contains(content, "detected")
}

bias_detection_pattern(content) if {
	contains(content, "unfair treatment")
	contains(content, "algorithm")
}
