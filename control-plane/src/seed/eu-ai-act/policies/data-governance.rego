# EU AI Act - Article 10: Data and data governance
#
# Enforces data quality requirements for AI training and operation.
# Detects prompts containing training data or datasets without proper
# governance markers. Article 10 requires that datasets used for
# training, validation, and testing are subject to appropriate
# governance practices.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block ungovened training data usage
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	training_data_pattern(content)
	not governance_marker_present(content)
	result := {
		"action": "block",
		"reason": "EU AI Act Article 10 - Data Governance: Training data or dataset usage detected without governance markers. Data used for AI training must be subject to documented governance practices.",
		"redactions": [],
	}
}

# Detect dataset upload or ingestion without governance
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	dataset_ingestion_pattern(content)
	not governance_marker_present(content)
	result := {
		"action": "block",
		"reason": "EU AI Act Article 10 - Data Governance: Dataset ingestion detected without data governance documentation. Datasets must have documented provenance and quality controls.",
		"redactions": [],
	}
}

# Training data patterns
training_data_pattern(content) if {
	contains(content, "train this model")
}

training_data_pattern(content) if {
	contains(content, "fine-tune")
	contains(content, "data")
}

training_data_pattern(content) if {
	contains(content, "training dataset")
}

training_data_pattern(content) if {
	contains(content, "use this data to learn")
}

training_data_pattern(content) if {
	contains(content, "training data:")
}

# Dataset ingestion patterns
dataset_ingestion_pattern(content) if {
	contains(content, "upload dataset")
}

dataset_ingestion_pattern(content) if {
	contains(content, "ingest data from")
}

dataset_ingestion_pattern(content) if {
	contains(content, "import training")
}

dataset_ingestion_pattern(content) if {
	contains(content, "batch process")
	contains(content, "records")
}

# Governance markers
governance_marker_present(content) if {
	contains(content, "data-governance-id:")
}

governance_marker_present(content) if {
	contains(content, "governance approved")
}

governance_marker_present(content) if {
	contains(content, "dg-certified")
}

governance_marker_present(content) if {
	contains(content, "data quality report")
}

governance_marker_present(content) if {
	contains(content, "provenance:")
}
