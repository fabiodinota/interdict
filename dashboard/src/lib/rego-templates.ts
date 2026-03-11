// Rego template engine: 6 policy templates with generateRego() functions
// Each template produces valid Rego following the Interdict policy package structure

import type { PolicyTemplate, PolicyCategoryMeta } from "@/types/policy-templates";

// Escape a string value for safe inclusion in Rego source code
function escapeRegoString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export const POLICY_CATEGORIES: PolicyCategoryMeta[] = [
  {
    id: "vendor_control",
    name: "Vendor Control",
    icon: "Building2",
    description: "Control which AI vendors and models can be used within your organization",
  },
  {
    id: "content_inspection",
    name: "Content Inspection",
    icon: "Shield",
    description: "Detect and enforce policies on content flowing through AI interactions",
  },
  {
    id: "rate_limiting",
    name: "Rate Limiting",
    icon: "Gauge",
    description: "Limit request volumes by department, user, or other dimensions",
  },
  {
    id: "custom",
    name: "Custom",
    icon: "Code",
    description: "Write custom governance rules using the visual editor or raw Rego",
  },
];

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  // 1. Block Vendor
  {
    id: "block-vendor",
    category: "vendor_control",
    name: "Block Vendor",
    description: "Block or allow requests to a specific AI vendor",
    parameters: [
      {
        key: "vendor_name",
        label: "Vendor",
        type: "select",
        description: "The vendor to apply this rule to",
        options: [], // populated dynamically from vendors API
        required: true,
        placeholder: "Select a vendor",
      },
      {
        key: "action",
        label: "Action",
        type: "select",
        description: "Whether to block or allow this vendor",
        options: [
          { value: "block", label: "Block" },
          { value: "allow", label: "Allow" },
        ],
        defaultValue: "block",
        required: true,
      },
    ],
    generateRego: (params) => {
      const vendor = escapeRegoString(String(params.vendor_name || ""));
      const action = String(params.action || "block");

      return `package interdict.policy

import rego.v1

# Block/Allow Vendor Policy
# Vendor: ${vendor}
# Action: ${action}

default verdict := {"action": "${action === "block" ? "allow" : "block"}"}

verdict := {"action": "${action}"} if {
    input.request.vendor == "${vendor}"
}`;
    },
  },

  // 2. PII Detection/Redact
  {
    id: "pii-detection",
    category: "content_inspection",
    name: "PII Detection / Redact",
    description: "Detect personally identifiable information and redact or block the request",
    parameters: [
      {
        key: "pii_types",
        label: "PII Types",
        type: "multi-select",
        description: "Types of PII to detect",
        options: [
          { value: "email", label: "Email Addresses" },
          { value: "phone", label: "Phone Numbers" },
          { value: "ssn", label: "Social Security Numbers" },
          { value: "credit_card", label: "Credit Card Numbers" },
          { value: "address", label: "Physical Addresses" },
        ],
        defaultValue: ["email", "phone", "ssn"],
        required: true,
      },
      {
        key: "action",
        label: "Action",
        type: "select",
        description: "Action to take when PII is detected",
        options: [
          { value: "redact", label: "Redact PII" },
          { value: "block", label: "Block Request" },
        ],
        defaultValue: "redact",
        required: true,
      },
      {
        key: "sensitivity",
        label: "Sensitivity Level",
        type: "select",
        description: "Detection sensitivity (higher = more aggressive matching)",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
        defaultValue: "medium",
        required: true,
      },
    ],
    generateRego: (params) => {
      const piiTypes = Array.isArray(params.pii_types) ? params.pii_types : [];
      const action = String(params.action || "redact");
      const sensitivity = String(params.sensitivity || "medium");
      const piiSet = piiTypes.map((t) => `"${escapeRegoString(String(t))}"`).join(", ");

      return `package interdict.policy

import rego.v1

# PII Detection Policy
# PII Types: ${piiTypes.join(", ")}
# Action: ${action}
# Sensitivity: ${sensitivity}

pii_types := {${piiSet}}

default verdict := {"action": "allow"}

verdict := {"action": "${action}"} if {
    some finding in input.content_inspection.findings
    finding.type in pii_types
    finding.confidence >= ${sensitivity === "high" ? "0.5" : sensitivity === "medium" ? "0.7" : "0.9"}
}`;
    },
  },

  // 3. Rate Limit by Department
  {
    id: "rate-limit-department",
    category: "rate_limiting",
    name: "Rate Limit by Department",
    description: "Limit request volume per department within a time window",
    parameters: [
      {
        key: "department",
        label: "Department",
        type: "select",
        description: "Department to rate limit (leave empty for all departments)",
        options: [], // populated dynamically
        required: false,
        placeholder: "All departments",
      },
      {
        key: "max_requests",
        label: "Max Requests",
        type: "number",
        description: "Maximum number of requests allowed in the time window",
        defaultValue: 100,
        required: true,
        placeholder: "100",
      },
      {
        key: "time_window_minutes",
        label: "Time Window (minutes)",
        type: "number",
        description: "Time window in minutes for rate limiting",
        defaultValue: 60,
        required: true,
        placeholder: "60",
      },
      {
        key: "action",
        label: "Action",
        type: "select",
        description: "Action when rate limit is exceeded",
        options: [
          { value: "block", label: "Block Request" },
          { value: "throttle", label: "Throttle (Delay)" },
        ],
        defaultValue: "block",
        required: true,
      },
    ],
    generateRego: (params) => {
      const department = params.department ? escapeRegoString(String(params.department)) : "";
      const maxRequests = Number(params.max_requests) || 100;
      const timeWindow = Number(params.time_window_minutes) || 60;
      const action = String(params.action || "block");

      const deptClause = department
        ? `\n    input.request.department == "${department}"`
        : `\n    # Applies to all departments`;

      return `package interdict.policy

import rego.v1

# Rate Limit by Department
# Department: ${department || "all"}
# Max Requests: ${maxRequests} per ${timeWindow} minutes
# Action: ${action}

max_requests := ${maxRequests}
time_window_minutes := ${timeWindow}

default verdict := {"action": "allow"}

verdict := {"action": "${action}"} if {${deptClause}
    input.rate_limit.current_count > max_requests
    input.rate_limit.window_minutes == time_window_minutes
}`;
    },
  },

  // 4. Content Length Limit
  {
    id: "content-length-limit",
    category: "content_inspection",
    name: "Content Length Limit",
    description: "Block requests or responses exceeding a token count",
    parameters: [
      {
        key: "max_tokens",
        label: "Max Tokens",
        type: "number",
        description: "Maximum allowed token count",
        defaultValue: 4096,
        required: true,
        placeholder: "4096",
      },
      {
        key: "direction",
        label: "Direction",
        type: "select",
        description: "Apply limit to request, response, or both",
        options: [
          { value: "request", label: "Request Only" },
          { value: "response", label: "Response Only" },
          { value: "both", label: "Both Request & Response" },
        ],
        defaultValue: "both",
        required: true,
      },
      {
        key: "action",
        label: "Action",
        type: "select",
        description: "Action when limit is exceeded",
        options: [
          { value: "block", label: "Block" },
          { value: "warn", label: "Warn (Allow with flag)" },
        ],
        defaultValue: "block",
        required: true,
      },
    ],
    generateRego: (params) => {
      const maxTokens = Number(params.max_tokens) || 4096;
      const direction = String(params.direction || "both");
      const action = String(params.action || "block");

      let condition: string;
      if (direction === "request") {
        condition = `    input.request.token_count > max_tokens`;
      } else if (direction === "response") {
        condition = `    input.response.token_count > max_tokens`;
      } else {
        condition = `    input.request.token_count > max_tokens\n}\n\nverdict := {"action": "${action}"} if {\n    input.response.token_count > max_tokens`;
      }

      return `package interdict.policy

import rego.v1

# Content Length Limit
# Max Tokens: ${maxTokens}
# Direction: ${direction}
# Action: ${action}

max_tokens := ${maxTokens}

default verdict := {"action": "allow"}

verdict := {"action": "${action}"} if {
${condition}
}`;
    },
  },

  // 5. Allowed Model Versions
  {
    id: "allowed-model-versions",
    category: "vendor_control",
    name: "Allowed Model Versions",
    description: "Restrict usage to specific model versions from a vendor",
    parameters: [
      {
        key: "vendor",
        label: "Vendor",
        type: "select",
        description: "The vendor whose models to restrict",
        options: [], // populated dynamically
        required: true,
        placeholder: "Select a vendor",
      },
      {
        key: "allowed_models",
        label: "Allowed Models",
        type: "multi-select",
        description: "Models that are permitted for use",
        options: [], // populated dynamically based on vendor selection
        required: true,
      },
      {
        key: "action",
        label: "Action for Non-Allowed Models",
        type: "select",
        description: "Action to take for models not in the allowed list",
        options: [
          { value: "block", label: "Block" },
          { value: "allow", label: "Allow (log only)" },
        ],
        defaultValue: "block",
        required: true,
      },
    ],
    generateRego: (params) => {
      const vendor = escapeRegoString(String(params.vendor || ""));
      const allowedModels = Array.isArray(params.allowed_models) ? params.allowed_models : [];
      const action = String(params.action || "block");
      const modelSet = allowedModels.map((m) => `"${escapeRegoString(String(m))}"`).join(", ");

      return `package interdict.policy

import rego.v1

# Allowed Model Versions
# Vendor: ${vendor}
# Allowed Models: ${allowedModels.join(", ")}
# Action for non-allowed: ${action}

allowed_models := {${modelSet}}

default verdict := {"action": "allow"}

verdict := {"action": "${action}"} if {
    input.request.vendor == "${vendor}"
    not input.request.model in allowed_models
}`;
    },
  },

  // 6. Jurisdiction Restrict
  {
    id: "jurisdiction-restrict",
    category: "custom",
    name: "Jurisdiction Restrict",
    description: "Block requests based on regulatory jurisdiction",
    parameters: [
      {
        key: "blocked_jurisdictions",
        label: "Blocked Jurisdictions",
        type: "multi-select",
        description: "Jurisdictions to block",
        options: [
          { value: "EU", label: "European Union (EU)" },
          { value: "US", label: "United States (US)" },
          { value: "UK", label: "United Kingdom (UK)" },
          { value: "CN", label: "China (CN)" },
          { value: "JP", label: "Japan (JP)" },
          { value: "AU", label: "Australia (AU)" },
          { value: "CA", label: "Canada (CA)" },
          { value: "BR", label: "Brazil (BR)" },
          { value: "IN", label: "India (IN)" },
          { value: "SG", label: "Singapore (SG)" },
        ],
        required: true,
      },
      {
        key: "action",
        label: "Action",
        type: "select",
        description: "Action for requests from blocked jurisdictions",
        options: [{ value: "block", label: "Block" }],
        defaultValue: "block",
        required: true,
      },
    ],
    generateRego: (params) => {
      const jurisdictions = Array.isArray(params.blocked_jurisdictions)
        ? params.blocked_jurisdictions
        : [];
      const action = String(params.action || "block");
      const jurisdictionSet = jurisdictions
        .map((j) => `"${escapeRegoString(String(j))}"`)
        .join(", ");

      return `package interdict.policy

import rego.v1

# Jurisdiction Restrict
# Blocked Jurisdictions: ${jurisdictions.join(", ")}
# Action: ${action}

blocked_jurisdictions := {${jurisdictionSet}}

default verdict := {"action": "allow"}

verdict := {"action": "${action}"} if {
    input.metadata.jurisdiction in blocked_jurisdictions
}`;
    },
  },
];

// Group templates by category
export function getTemplatesByCategory(): Record<string, PolicyTemplate[]> {
  const grouped: Record<string, PolicyTemplate[]> = {};
  for (const template of POLICY_TEMPLATES) {
    if (!grouped[template.category]) {
      grouped[template.category] = [];
    }
    grouped[template.category].push(template);
  }
  return grouped;
}

// Get templates for a specific category
export function getTemplatesForCategory(category: string): PolicyTemplate[] {
  return POLICY_TEMPLATES.filter((t) => t.category === category);
}

// Get a single template by ID
export function getTemplateById(id: string): PolicyTemplate | undefined {
  return POLICY_TEMPLATES.find((t) => t.id === id);
}
