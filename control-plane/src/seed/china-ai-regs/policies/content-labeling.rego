# China AI Regulations - Deep Synthesis Provisions Article 7: AI content labeling
#
# Blocks generation of deep synthesis content without labeling. Content
# generated or edited using deep synthesis technology must be conspicuously
# labeled to avoid public confusion.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block deep synthesis content without labeling
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	deep_synthesis_pattern(content)
	not labeling_marker_present(content)
	result := {
		"action": "block",
		"reason": "China Deep Synthesis Provisions Article 7 - Content Labeling: Deep synthesis content generation detected without labeling. AI-generated or edited content must be conspicuously labeled.",
		"redactions": [],
	}
}

# Block synthetic media without watermark
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	synthetic_media_pattern(content)
	not labeling_marker_present(content)
	result := {
		"action": "block",
		"reason": "China Deep Synthesis Provisions Article 7 - Content Labeling: Synthetic media generation detected without watermarking. Deep synthesis output must carry conspicuous labels to prevent confusion.",
		"redactions": [],
	}
}

# Deep synthesis patterns
deep_synthesis_pattern(content) if {
	contains(content, "generate deepfake")
}

deep_synthesis_pattern(content) if {
	contains(content, "create synthetic content")
}

deep_synthesis_pattern(content) if {
	contains(content, "deep synthesis")
}

deep_synthesis_pattern(content) if {
	contains(content, "ai-generated image")
	not contains(content, "label")
}

deep_synthesis_pattern(content) if {
	contains(content, "generate realistic face")
}

deep_synthesis_pattern(content) if {
	contains(content, "create fake video")
}

# Synthetic media patterns
synthetic_media_pattern(content) if {
	contains(content, "synthesize voice")
}

synthetic_media_pattern(content) if {
	contains(content, "generate face")
	contains(content, "person")
}

synthetic_media_pattern(content) if {
	contains(content, "voice cloning")
}

synthetic_media_pattern(content) if {
	contains(content, "face swap")
	contains(content, "generate")
}

synthetic_media_pattern(content) if {
	contains(content, "synthetic video")
	contains(content, "create")
}

# Labeling markers
labeling_marker_present(content) if {
	contains(content, "content-labeled")
}

labeling_marker_present(content) if {
	contains(content, "synthesis-disclosed")
}

labeling_marker_present(content) if {
	contains(content, "deepfake-watermarked")
}

labeling_marker_present(content) if {
	contains(content, "ai content label")
	contains(content, "applied")
}

labeling_marker_present(content) if {
	contains(content, "watermark embedded")
}
