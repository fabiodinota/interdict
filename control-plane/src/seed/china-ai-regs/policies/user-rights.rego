# China AI Regulations - Generative AI Measures Article 9: User rights and obligations
#
# Blocks generative AI content delivery without user rights protections.
# Providers must clearly inform users of AI-generated content nature and
# protect user rights including the right to opt out.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block AI content generation without user rights notice
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	generative_ai_pattern(content)
	not user_rights_marker_present(content)
	result := {
		"action": "block",
		"reason": "China Generative AI Measures Article 9 - User Rights: Generative AI content delivery detected without user rights protections. Users must be informed of AI-generated nature and given the right to opt out.",
		"redactions": [],
	}
}

# Block automated replies without AI disclosure
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	automated_reply_pattern(content)
	not user_rights_marker_present(content)
	result := {
		"action": "block",
		"reason": "China Generative AI Measures Article 9 - User Rights: Automated AI response to users detected without disclosure. Users must be clearly informed of the AI-generated nature of content.",
		"redactions": [],
	}
}

# Generative AI patterns
generative_ai_pattern(content) if {
	contains(content, "generate content for user")
}

generative_ai_pattern(content) if {
	contains(content, "ai-generated response")
	contains(content, "deliver")
}

generative_ai_pattern(content) if {
	contains(content, "serve ai content")
	contains(content, "user")
}

generative_ai_pattern(content) if {
	contains(content, "publish ai-generated")
}

generative_ai_pattern(content) if {
	contains(content, "distribute generated content")
}

generative_ai_pattern(content) if {
	contains(content, "deploy generative ai")
	contains(content, "public")
}

# Automated reply patterns
automated_reply_pattern(content) if {
	contains(content, "automated reply")
	contains(content, "customer")
}

automated_reply_pattern(content) if {
	contains(content, "ai chatbot")
	contains(content, "respond to user")
}

automated_reply_pattern(content) if {
	contains(content, "auto-respond")
	contains(content, "ai")
}

automated_reply_pattern(content) if {
	contains(content, "bot response")
	contains(content, "pretend")
}

automated_reply_pattern(content) if {
	contains(content, "ai assistant")
	contains(content, "without disclos")
}

# User rights markers
user_rights_marker_present(content) if {
	contains(content, "user-informed")
}

user_rights_marker_present(content) if {
	contains(content, "opt-out-available")
}

user_rights_marker_present(content) if {
	contains(content, "rights-notice")
}

user_rights_marker_present(content) if {
	contains(content, "user informed")
	contains(content, "ai-generated")
}

user_rights_marker_present(content) if {
	contains(content, "opt-out provided")
}
