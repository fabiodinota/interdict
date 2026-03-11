/**
 * Rego Syntax Validator
 *
 * Pre-validates Rego source using OPA CLI (`opa check --strict --format json`).
 * Returns structured error messages with line/column information on failure.
 * If OPA is not installed, returns a descriptive error.
 */

import { $ } from "bun";

export interface ValidationError {
  message: string;
  line?: number;
  column?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

/**
 * Validate Rego source syntax using OPA CLI.
 *
 * Writes Rego to a temp file, runs `opa check --strict --format json`,
 * and parses the output into structured errors.
 */
export async function validateRego(
  regoSource: string
): Promise<ValidationResult> {
  // Empty source is always invalid
  if (!regoSource || regoSource.trim().length === 0) {
    return {
      valid: false,
      errors: [{ message: "Rego source is empty" }],
    };
  }

  const tmpFile = `/tmp/opa-validate-${crypto.randomUUID()}.rego`;

  try {
    await Bun.write(tmpFile, regoSource);

    const result = await $`opa check --strict --format json ${tmpFile}`
      .quiet()
      .nothrow();

    if (result.exitCode === 0) {
      return { valid: true };
    }

    // Parse OPA check output for structured errors
    const stderr = result.stderr.toString().trim();
    const stdout = result.stdout.toString().trim();

    // OPA may output to either stdout or stderr depending on version
    const output = stderr || stdout;

    if (!output) {
      return {
        valid: false,
        errors: [
          { message: "OPA check failed with no output (exit code: " + result.exitCode + ")" },
        ],
      };
    }

    try {
      const parsed = JSON.parse(output);
      // OPA JSON format: { errors: [{ message, location: { file, row, col } }] }
      if (parsed.errors && Array.isArray(parsed.errors)) {
        return {
          valid: false,
          errors: parsed.errors.map((error: unknown): ValidationError => {
            const record =
              typeof error === "object" && error !== null
                ? (error as {
                    message?: unknown;
                    location?: { row?: unknown; col?: unknown };
                  })
                : {};

            return {
              message:
                typeof record.message === "string"
                  ? record.message
                  : String(error),
              line:
                typeof record.location?.row === "number"
                  ? record.location.row
                  : undefined,
              column:
                typeof record.location?.col === "number"
                  ? record.location.col
                  : undefined,
            };
          }),
        };
      }
      return {
        valid: false,
        errors: [{ message: output }],
      };
    } catch (error: unknown) {
      console.warn("[compiler] Failed to parse OPA validation JSON output", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Could not parse as JSON -- return raw error text
      // Strip temp file paths from error messages for cleaner output
      const cleanedOutput = output.replace(
        new RegExp(tmpFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
        "<input>"
      );
      return {
        valid: false,
        errors: [{ message: cleanedOutput }],
      };
    }
  } catch (err: unknown) {
    // OPA binary not found or other system error
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("not found") ||
      message.includes("ENOENT") ||
      message.includes("No such file")
    ) {
      return {
        valid: false,
        errors: [
          {
            message:
              "OPA binary not found. Install from https://www.openpolicyagent.org/docs/latest/#running-opa",
          },
        ],
      };
    }
    return {
      valid: false,
      errors: [{ message: `Validation error: ${message}` }],
    };
  } finally {
    // Clean up temp file
    try {
      await $`rm -f ${tmpFile}`.quiet().nothrow();
    } catch (error: unknown) {
      console.warn("[compiler] Failed to remove temporary Rego validation file", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
