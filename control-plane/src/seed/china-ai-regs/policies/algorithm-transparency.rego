# China AI Regulations - Algorithmic Recommendation Provisions Articles 4-6: Algorithm transparency
#
# Blocks algorithmic recommendation and content curation without transparency
# disclosures. Providers must inform users of the basic principles, purposes,
# and main operating mechanisms of their algorithms.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block algorithmic recommendation without transparency
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	recommendation_pattern(content)
	not transparency_marker_present(content)
	result := {
		"action": "block",
		"reason": "China Algorithmic Recommendation Provisions Articles 4-6 - Transparency: Algorithmic recommendation service detected without transparency disclosure. Users must be informed of algorithm principles and operating mechanisms.",
		"redactions": [],
	}
}

# Block personalized content without disclosure
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	personalization_pattern(content)
	not transparency_marker_present(content)
	result := {
		"action": "block",
		"reason": "China Algorithmic Recommendation Provisions Articles 4-6 - Transparency: Personalized content curation detected without algorithm disclosure. Users must be informed of how content is selected and ranked.",
		"redactions": [],
	}
}

# Recommendation patterns
recommendation_pattern(content) if {
	contains(content, "algorithmic recommendation")
}

recommendation_pattern(content) if {
	contains(content, "content ranking")
	contains(content, "algorithm")
}

recommendation_pattern(content) if {
	contains(content, "automated content curation")
}

recommendation_pattern(content) if {
	contains(content, "recommendation engine")
}

recommendation_pattern(content) if {
	contains(content, "algorithm-driven feed")
}

recommendation_pattern(content) if {
	contains(content, "automated sorting")
	contains(content, "user content")
}

# Personalization patterns
personalization_pattern(content) if {
	contains(content, "personalized feed")
}

personalization_pattern(content) if {
	contains(content, "personalized content")
	contains(content, "user")
}

personalization_pattern(content) if {
	contains(content, "targeted content delivery")
}

personalization_pattern(content) if {
	contains(content, "user profile")
	contains(content, "content selection")
}

personalization_pattern(content) if {
	contains(content, "behavioral targeting")
	contains(content, "content")
}

# Transparency markers
transparency_marker_present(content) if {
	contains(content, "algorithm-disclosure")
}

transparency_marker_present(content) if {
	contains(content, "transparency-notice")
}

transparency_marker_present(content) if {
	contains(content, "algo-explained")
}

transparency_marker_present(content) if {
	contains(content, "algorithm principles")
	contains(content, "disclosed")
}

transparency_marker_present(content) if {
	contains(content, "mechanism explained")
}
