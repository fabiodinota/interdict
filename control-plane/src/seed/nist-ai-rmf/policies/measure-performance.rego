# NIST AI RMF - MEASURE 1.0: Risk measurement and monitoring
#
# Blocks AI model deployment and inference at scale without documented
# performance metrics. MEASURE function requires quantitative or qualitative
# measurement of AI risks including uncertainty and error rates.

package interdict.policy.verdict

import rego.v1

default verdict := {"action": "allow", "reason": "", "redactions": []}

# Block model deployment without performance metrics
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	unmeasured_deployment_pattern(content)
	not performance_metric_present(content)
	result := {
		"action": "block",
		"reason": "NIST AI RMF MEASURE 1.0 - Measurement: AI model deployment detected without documented performance metrics. Risk measurements including accuracy, uncertainty, and error rates must be documented.",
		"redactions": [],
	}
}

# Block inference at scale without monitoring
verdict := result if {
	input.direction == "request"
	content := lower(input.content)
	scale_inference_pattern(content)
	not performance_metric_present(content)
	result := {
		"action": "block",
		"reason": "NIST AI RMF MEASURE 1.0 - Measurement: Large-scale AI inference detected without performance monitoring. Ongoing risk measurement and monitoring are required for production AI systems.",
		"redactions": [],
	}
}

# Unmeasured deployment patterns
unmeasured_deployment_pattern(content) if {
	contains(content, "deploy model")
	not contains(content, "test")
}

unmeasured_deployment_pattern(content) if {
	contains(content, "release model to production")
}

unmeasured_deployment_pattern(content) if {
	contains(content, "push model to serving")
}

unmeasured_deployment_pattern(content) if {
	contains(content, "model deployment")
	contains(content, "without evaluation")
}

unmeasured_deployment_pattern(content) if {
	contains(content, "skip validation")
	contains(content, "model")
}

unmeasured_deployment_pattern(content) if {
	contains(content, "ai prediction")
	contains(content, "production")
}

# Scale inference patterns
scale_inference_pattern(content) if {
	contains(content, "inference at scale")
}

scale_inference_pattern(content) if {
	contains(content, "batch prediction")
	contains(content, "million")
}

scale_inference_pattern(content) if {
	contains(content, "real-time scoring")
	contains(content, "population")
}

scale_inference_pattern(content) if {
	contains(content, "mass classification")
}

scale_inference_pattern(content) if {
	contains(content, "automated scoring")
	contains(content, "all user")
}

# Performance metric markers
performance_metric_present(content) if {
	contains(content, "performance-metrics")
}

performance_metric_present(content) if {
	contains(content, "accuracy-report")
}

performance_metric_present(content) if {
	contains(content, "measure-id")
}

performance_metric_present(content) if {
	contains(content, "error rate")
	contains(content, "documented")
}

performance_metric_present(content) if {
	contains(content, "model evaluation")
	contains(content, "completed")
}
