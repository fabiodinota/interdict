// Policy template type definitions for the Policy Builder wizard

export type ParameterType = "text" | "select" | "toggle" | "number" | "multi-select";

export interface TemplateParameter {
  key: string;
  label: string;
  type: ParameterType;
  description?: string;
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
  required: boolean;
  placeholder?: string;
}

export type PolicyCategory = "vendor_control" | "content_inspection" | "rate_limiting" | "custom";

export interface PolicyCategoryMeta {
  id: PolicyCategory;
  name: string;
  icon: string;
  description: string;
}

export interface PolicyTemplate {
  id: string;
  category: PolicyCategory;
  name: string;
  description: string;
  parameters: TemplateParameter[];
  generateRego: (params: Record<string, unknown>) => string;
}

// Visual rule editor condition types
export interface RuleCondition {
  id: string;
  field: string;
  operator: "==" | "!=" | "contains" | "not_contains" | ">" | "<" | ">=" | "<=";
  value: string;
  connector: "AND" | "OR";
}

// Compilation status from the API
export interface CompilationStatusResponse {
  status: "pending" | "compiling" | "compiled" | "failed";
  error?: string;
  wasmHash?: string;
  wasmSize?: number;
}
