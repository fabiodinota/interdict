"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Code, LayoutList } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CategoryPicker } from "@/components/policies/CategoryPicker";
import { TemplatePicker } from "@/components/policies/TemplatePicker";
import { ParameterForm } from "@/components/policies/ParameterForm";
import { RuleEditor, generateConditionRego } from "@/components/policies/RuleEditor";
import { RegoPreview } from "@/components/policies/RegoPreview";
import { RawRegoEditor } from "@/components/policies/RawRegoEditor";
import { usePolicy, useCreatePolicy, useUpdatePolicy } from "@/hooks/use-policies";
import type { PolicyCategory, PolicyTemplate, RuleCondition } from "@/types/policy-templates";

const STEP_LABELS = [
  "Category",
  "Template",
  "Parameters",
  "Rules",
  "Review",
];

interface WizardState {
  step: number; // 1-5
  selectedCategory: PolicyCategory | null;
  selectedTemplate: PolicyTemplate | null;
  parameterValues: Record<string, unknown>;
  ruleConditions: RuleCondition[];
  rawMode: boolean;
  rawRego: string;
  policyName: string;
  policyDescription: string;
  entrypoint: string;
}

function StepIndicator({
  currentStep,
  onGoToStep,
}: {
  currentStep: number;
  onGoToStep: (step: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {STEP_LABELS.map((label, idx) => {
        const stepNum = idx + 1;
        const isCompleted = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;

        return (
          <div key={label} className="flex items-center">
            <button
              type="button"
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                isCurrent
                  ? "bg-primary text-primary-foreground"
                  : isCompleted
                    ? "bg-primary/10 text-primary cursor-pointer hover:bg-primary/20"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
              onClick={() => isCompleted && onGoToStep(stepNum)}
              disabled={!isCompleted}
            >
              <span className="size-4 rounded-full bg-current/20 flex items-center justify-center text-[10px]">
                {stepNum}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {idx < STEP_LABELS.length - 1 && (
              <div
                className={`w-4 h-px mx-1 ${
                  isCompleted ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PolicyWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;

  // Load existing policy for edit mode
  const { data: existingPolicyData } = usePolicy(editId ?? "");
  const existingPolicy = existingPolicyData?.data;

  const createPolicy = useCreatePolicy();
  const updatePolicy = useUpdatePolicy();

  const [state, setState] = useState<WizardState>(() => {
    // In edit mode, start in raw editor with existing policy data
    if (isEditMode) {
      return {
        step: 1,
        selectedCategory: null,
        selectedTemplate: null,
        parameterValues: {},
        ruleConditions: [],
        rawMode: true,
        rawRego: "",
        policyName: "",
        policyDescription: "",
        entrypoint: "interdict/policy/verdict",
      };
    }

    return {
      step: 1,
      selectedCategory: null,
      selectedTemplate: null,
      parameterValues: {},
      ruleConditions: [],
      rawMode: false,
      rawRego: "",
      policyName: "",
      policyDescription: "",
      entrypoint: "interdict/policy/verdict",
    };
  });

  // Populate edit mode data when it arrives
  const [editDataLoaded, setEditDataLoaded] = useState(false);
  if (isEditMode && existingPolicy && !editDataLoaded) {
    setState((prev) => ({
      ...prev,
      rawRego: existingPolicy.regoSource,
      policyName: existingPolicy.name,
      policyDescription: existingPolicy.description,
      rawMode: true,
    }));
    setEditDataLoaded(true);
  }

  const [showRawWarning, setShowRawWarning] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Generate Rego from current wizard state
  const getGeneratedRego = useCallback((): string => {
    if (!state.selectedTemplate) return "";
    try {
      let rego = state.selectedTemplate.generateRego(state.parameterValues);
      if (state.ruleConditions.length > 0) {
        rego += generateConditionRego(state.ruleConditions);
      }
      return rego;
    } catch {
      return "// Error generating Rego";
    }
  }, [state.selectedTemplate, state.parameterValues, state.ruleConditions]);

  // Submit handler
  async function handleSubmit() {
    setSubmitError(null);
    const regoSource = state.rawMode ? state.rawRego : getGeneratedRego();

    try {
      if (isEditMode && editId) {
        await updatePolicy.mutateAsync({
          id: editId,
          name: state.policyName,
          description: state.policyDescription,
          rego_source: regoSource,
          entrypoint: state.entrypoint,
          change_description: "Updated via Policy Builder",
        });
      } else {
        await createPolicy.mutateAsync({
          name: state.policyName,
          description: state.policyDescription,
          rego_source: regoSource,
          entrypoint: state.entrypoint,
        });
      }
      router.push("/policies");
    } catch (error: unknown) {
      if (error && typeof error === "object" && "message" in error) {
        setSubmitError(String((error as { message: string }).message));
      } else {
        setSubmitError("An unexpected error occurred");
      }
    }
  }

  const isSubmitting = createPolicy.isPending || updatePolicy.isPending;

  // Toggle raw mode
  function handleToggleRawMode() {
    if (state.rawMode) {
      // Switching back to wizard: warn about state reset
      setShowRawWarning(true);
    } else {
      // Switching to raw mode: carry over any generated Rego
      const currentRego = getGeneratedRego();
      setState((prev) => ({
        ...prev,
        rawMode: true,
        rawRego: currentRego || prev.rawRego,
      }));
    }
  }

  function confirmSwitchToWizard() {
    setState((prev) => ({
      ...prev,
      rawMode: false,
      step: 1,
      selectedCategory: null,
      selectedTemplate: null,
      parameterValues: {},
      ruleConditions: [],
    }));
    setShowRawWarning(false);
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggleRawMode}
        >
          {state.rawMode ? (
            <>
              <LayoutList className="size-4" />
              Switch to Wizard
            </>
          ) : (
            <>
              <Code className="size-4" />
              Switch to Raw Editor
            </>
          )}
        </Button>
      </div>

      {/* Raw mode */}
      {state.rawMode && (
        <RawRegoEditor
          regoSource={state.rawRego}
          policyName={state.policyName}
          policyDescription={state.policyDescription}
          entrypoint={state.entrypoint}
          onRegoChange={(rego) =>
            setState((prev) => ({ ...prev, rawRego: rego }))
          }
          onNameChange={(name) =>
            setState((prev) => ({ ...prev, policyName: name }))
          }
          onDescriptionChange={(desc) =>
            setState((prev) => ({ ...prev, policyDescription: desc }))
          }
          onEntrypointChange={(ep) =>
            setState((prev) => ({ ...prev, entrypoint: ep }))
          }
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          submitError={submitError}
          isEditMode={isEditMode}
        />
      )}

      {/* Wizard mode */}
      {!state.rawMode && (
        <>
          <StepIndicator
            currentStep={state.step}
            onGoToStep={(step) =>
              setState((prev) => ({ ...prev, step }))
            }
          />

          {/* Step 1: Category Picker */}
          {state.step === 1 && (
            <CategoryPicker
              selectedCategory={state.selectedCategory}
              onSelect={(category) =>
                setState((prev) => ({
                  ...prev,
                  selectedCategory: category,
                  selectedTemplate: null,
                  parameterValues: {},
                  step: 2,
                }))
              }
            />
          )}

          {/* Step 2: Template Picker */}
          {state.step === 2 && state.selectedCategory && (
            <TemplatePicker
              category={state.selectedCategory}
              selectedTemplate={state.selectedTemplate}
              onSelect={(template) =>
                setState((prev) => ({
                  ...prev,
                  selectedTemplate: template,
                  parameterValues: {},
                  step: 3,
                }))
              }
              onBack={() =>
                setState((prev) => ({ ...prev, step: 1 }))
              }
            />
          )}

          {/* Step 3: Parameter Form */}
          {state.step === 3 && state.selectedTemplate && (
            <ParameterForm
              template={state.selectedTemplate}
              values={state.parameterValues}
              onChange={(values) =>
                setState((prev) => ({
                  ...prev,
                  parameterValues: values,
                }))
              }
              onNext={() =>
                setState((prev) => ({ ...prev, step: 4 }))
              }
              onBack={() =>
                setState((prev) => ({ ...prev, step: 2 }))
              }
            />
          )}

          {/* Step 4: Visual Rule Editor */}
          {state.step === 4 && state.selectedTemplate && (
            <RuleEditor
              conditions={state.ruleConditions}
              onChange={(conditions) =>
                setState((prev) => ({
                  ...prev,
                  ruleConditions: conditions,
                }))
              }
              generatedRego={
                state.selectedTemplate.generateRego(state.parameterValues)
              }
              onNext={() =>
                setState((prev) => ({ ...prev, step: 5 }))
              }
              onBack={() =>
                setState((prev) => ({ ...prev, step: 3 }))
              }
              onSkip={() =>
                setState((prev) => ({ ...prev, step: 5 }))
              }
            />
          )}

          {/* Step 5: Rego Preview & Submit */}
          {state.step === 5 && (
            <RegoPreview
              regoSource={getGeneratedRego()}
              policyName={state.policyName}
              policyDescription={state.policyDescription}
              entrypoint={state.entrypoint}
              onNameChange={(name) =>
                setState((prev) => ({ ...prev, policyName: name }))
              }
              onDescriptionChange={(desc) =>
                setState((prev) => ({
                  ...prev,
                  policyDescription: desc,
                }))
              }
              onEntrypointChange={(ep) =>
                setState((prev) => ({ ...prev, entrypoint: ep }))
              }
              onSubmit={handleSubmit}
              onBack={() =>
                setState((prev) => ({ ...prev, step: 4 }))
              }
              isSubmitting={isSubmitting}
              submitError={submitError}
              isEditMode={isEditMode}
            />
          )}
        </>
      )}

      {/* Warning dialog for switching back to wizard */}
      <Dialog open={showRawWarning} onOpenChange={setShowRawWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch to Wizard Mode?</DialogTitle>
            <DialogDescription>
              Switching back to the wizard will reset all wizard state. Any
              changes made in the raw editor will be lost. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRawWarning(false)}
            >
              Cancel
            </Button>
            <Button onClick={confirmSwitchToWizard}>
              Switch to Wizard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
