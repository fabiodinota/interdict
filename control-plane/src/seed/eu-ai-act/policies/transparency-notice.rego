# EU AI Act - Article 13: Transparency obligations
#
# Blocks prompts that attempt to generate content without AI disclosure,
# or that instruct the AI to impersonate a human or hide its AI nature.
# Regulation 2024/1689, Article 13 requires that AI-generated content
# is clearly identifiable as such.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Detect prompts instructing AI to hide its nature
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	concealment_pattern_matched(content)
	result := {
		"action": "block",
		"reason": "EU AI Act Article 13 - Transparency: Prompt instructs AI to conceal its artificial nature or impersonate a human. AI-generated content must be disclosed as such.",
		"redactions": [],
	}
}

# Detect prompts generating content that should carry AI disclosure
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	undisclosed_generation_pattern(content)
	not has_transparency_marker(content)
	result := {
		"action": "block",
		"reason": "EU AI Act Article 13 - Transparency: Content generation detected without transparency disclosure markers. AI-generated output must be identifiable.",
		"redactions": [],
	}
}

concealment_pattern_matched(content) if {
	contains(content, "pretend you are not ai")
}

concealment_pattern_matched(content) if {
	contains(content, "pretend you're not ai")
}

concealment_pattern_matched(content) if {
	contains(content, "act as if you are human")
}

concealment_pattern_matched(content) if {
	contains(content, "write as if human")
}

concealment_pattern_matched(content) if {
	contains(content, "don't reveal you are ai")
}

concealment_pattern_matched(content) if {
	contains(content, "hide that you are ai")
}

concealment_pattern_matched(content) if {
	contains(content, "never mention you are an ai")
}

concealment_pattern_matched(content) if {
	contains(content, "do not disclose")
	contains(content, "artificial")
}

undisclosed_generation_pattern(content) if {
	contains(content, "write a news article")
}

undisclosed_generation_pattern(content) if {
	contains(content, "compose a letter")
	contains(content, "on behalf of")
}

undisclosed_generation_pattern(content) if {
	contains(content, "draft a public statement")
}

undisclosed_generation_pattern(content) if {
	contains(content, "create social media posts")
}

has_transparency_marker(content) if {
	contains(content, "ai-generated")
}

has_transparency_marker(content) if {
	contains(content, "ai generated")
}

has_transparency_marker(content) if {
	contains(content, "include ai disclosure")
}

has_transparency_marker(content) if {
	contains(content, "mark as ai")
}
