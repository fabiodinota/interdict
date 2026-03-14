//! Wasmtime runtime with pooling allocator for Wasm policy module execution.
//!
//! Provides a bounded, pre-allocated Wasm execution environment for future
//! custom policy modules. Phase 2 initializes the engine with pooling allocator
//! to prove PLCY-01 success criterion (128MB RAM under 10k+ evaluations).
//!
//! Actual L1 evaluation uses Regorus directly. This engine is for future
//! custom Wasm policy modules (Phase 5+).
//!
//! CRITICAL (Pitfall 1): `max_memory_size` must be set to minimum needed
//! (1MB for policy modules) to avoid 4GB virtual memory per slot.

use crate::config::PolicyEngineConfig;

/// Wasmtime engine wrapper with pooling allocator for bounded Wasm execution.
///
/// Pre-allocates instance slots at startup for fast instantiation.
/// Configured with conservative memory limits suitable for policy modules.
pub struct WasmEngine {
    engine: wasmtime::Engine,
}

impl WasmEngine {
    /// Create a new Wasm engine with pooling allocator from config.
    ///
    /// Configures:
    /// - Pooling allocator with bounded instance slots
    /// - Conservative memory limits (1MB default per instance)
    /// - Cranelift optimizer for speed
    ///
    /// # Errors
    ///
    /// Returns error if the engine cannot be created (e.g., platform doesn't
    /// support the pooling allocator).
    pub fn new(config: &PolicyEngineConfig) -> anyhow::Result<Self> {
        let mut pool_config = wasmtime::PoolingAllocationConfig::new();

        // Policy modules are small — conservative limits
        pool_config
            .total_core_instances(config.wasm_max_instances as u32)
            .total_memories(config.wasm_max_instances as u32)
            .total_tables(config.wasm_max_instances as u32)
            .max_memory_size(config.wasm_max_memory_bytes) // 1MB default — CRITICAL: avoids 4GB virtual memory per slot
            .max_core_instance_size(1 << 16) // 64KB VMContext
            .max_memories_per_module(1)
            .max_tables_per_module(1)
            .max_unused_warm_slots(16); // Keep warm for reuse

        let mut wasm_config = wasmtime::Config::new();
        wasm_config.allocation_strategy(pool_config);
        wasm_config.cranelift_opt_level(wasmtime::OptLevel::Speed);

        let engine = wasmtime::Engine::new(&wasm_config)
            .map_err(|e| anyhow::anyhow!("failed to create wasmtime engine: {}", e))?;

        Ok(Self { engine })
    }

    /// Get a reference to the underlying Wasmtime engine.
    ///
    /// Used by downstream code to create Stores and compile Modules.
    pub fn engine(&self) -> &wasmtime::Engine {
        &self.engine
    }

    /// Compile Wasm bytes into a Module.
    ///
    /// For pre-compiled modules, use `deserialize_module` instead.
    pub fn load_module(&self, wasm_bytes: &[u8]) -> anyhow::Result<wasmtime::Module> {
        Ok(wasmtime::Module::new(&self.engine, wasm_bytes)?)
    }

    /// Load a pre-compiled module from serialized bytes.
    ///
    /// # Safety
    ///
    /// The bytes must have been produced by `Module::serialize` using the
    /// same engine configuration. Deserialization of untrusted bytes could
    /// lead to arbitrary code execution.
    #[allow(unsafe_code)]
    pub(crate) unsafe fn deserialize_module(
        &self,
        compiled_bytes: &[u8],
    ) -> anyhow::Result<wasmtime::Module> {
        // SAFETY: caller has verified bytes came from Module::serialize with the same
        // engine version and configuration. Deserializing untrusted bytes is unsound;
        // see the `# Safety` section on the enclosing `unsafe fn`.
        Ok(unsafe { wasmtime::Module::deserialize(&self.engine, compiled_bytes) }?)
    }

    /// Deserialize a pre-compiled Wasm module after verifying its SHA-256 hash.
    ///
    /// This is the safe entry point for loading pre-compiled modules. It computes
    /// the SHA-256 hash of the input bytes and compares it against the expected hash
    /// before calling the underlying unsafe deserialization.
    ///
    /// # Arguments
    /// * `compiled_bytes` - Pre-compiled module bytes from `Module::serialize`
    /// * `expected_hash` - Expected SHA-256 hex digest of `compiled_bytes`
    ///
    /// # Errors
    /// Returns error if the hash does not match or deserialization fails.
    pub(crate) fn deserialize_verified_module(
        &self,
        compiled_bytes: &[u8],
        expected_hash: &str,
    ) -> anyhow::Result<wasmtime::Module> {
        use sha2::{Digest, Sha256};
        let actual_hash = format!("{:x}", Sha256::digest(compiled_bytes));
        if actual_hash != expected_hash {
            anyhow::bail!(
                "wasm module hash mismatch: expected {}, got {}",
                expected_hash,
                actual_hash
            );
        }
        // SAFETY: hash verification confirms bytes are the expected pre-compiled module.
        // The caller is responsible for ensuring the bytes were originally produced by
        // Module::serialize with the same engine configuration.
        #[allow(unsafe_code)]
        unsafe {
            self.deserialize_module(compiled_bytes)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wasm_engine_creates_with_pooling_allocator() {
        let config = PolicyEngineConfig::default();
        let engine = WasmEngine::new(&config);
        assert!(
            engine.is_ok(),
            "WasmEngine should create successfully with default config: {:?}",
            engine.err()
        );
    }

    #[test]
    fn test_wasm_engine_custom_config() {
        let config = PolicyEngineConfig {
            wasm_max_instances: 32,
            wasm_max_memory_bytes: 512 * 1024, // 512KB
            ..PolicyEngineConfig::default()
        };
        let engine = WasmEngine::new(&config);
        assert!(
            engine.is_ok(),
            "WasmEngine should create with custom config: {:?}",
            engine.err()
        );
    }

    #[test]
    fn test_wasm_engine_exposes_engine() {
        let config = PolicyEngineConfig::default();
        let wasm = WasmEngine::new(&config).unwrap();
        // Engine reference should be usable
        let _engine: &wasmtime::Engine = wasm.engine();
    }

    #[test]
    fn test_wasm_engine_loads_minimal_module() {
        let config = PolicyEngineConfig::default();
        let wasm = WasmEngine::new(&config).unwrap();

        // Minimal valid Wasm module (empty module)
        let wat = "(module)";
        let wasm_bytes = wat::parse_str(wat).unwrap();
        let module = wasm.load_module(&wasm_bytes);
        assert!(
            module.is_ok(),
            "Should load minimal Wasm module: {:?}",
            module.err()
        );
    }

    #[test]
    fn test_wasm_engine_respects_memory_limits() {
        let config = PolicyEngineConfig {
            wasm_max_instances: 4,
            wasm_max_memory_bytes: 1 << 20, // 1MB
            ..PolicyEngineConfig::default()
        };
        let wasm = WasmEngine::new(&config).unwrap();

        // Module with a small memory (1 page = 64KB, well within 1MB limit)
        let wat = "(module (memory 1))";
        let wasm_bytes = wat::parse_str(wat).unwrap();
        let module = wasm.load_module(&wasm_bytes);
        assert!(
            module.is_ok(),
            "Module with 1 page memory should load within 1MB limit: {:?}",
            module.err()
        );

        // Verify we can instantiate it with a store
        let module = module.unwrap();
        let mut store = wasmtime::Store::new(wasm.engine(), ());
        let instance = wasmtime::Instance::new(&mut store, &module, &[]);
        assert!(
            instance.is_ok(),
            "Instance should create within pooling allocator: {:?}",
            instance.err()
        );
    }

    #[test]
    fn test_deserialize_verified_module_correct_hash() {
        let config = PolicyEngineConfig::default();
        let wasm = WasmEngine::new(&config).unwrap();

        // Compile a minimal module, serialize it, then verify deserialization with correct hash
        let wat = "(module)";
        let wasm_bytes = wat::parse_str(wat).unwrap();
        let module = wasm.load_module(&wasm_bytes).unwrap();
        let serialized = module.serialize().unwrap();

        // Compute the correct hash
        use sha2::{Digest, Sha256};
        let expected_hash = format!("{:x}", Sha256::digest(&serialized));

        let result = wasm.deserialize_verified_module(&serialized, &expected_hash);
        assert!(
            result.is_ok(),
            "correct hash should succeed: {:?}",
            result.err()
        );
    }

    #[test]
    fn test_deserialize_verified_module_wrong_hash() {
        let config = PolicyEngineConfig::default();
        let wasm = WasmEngine::new(&config).unwrap();

        // Compile a minimal module and serialize it
        let wat = "(module)";
        let wasm_bytes = wat::parse_str(wat).unwrap();
        let module = wasm.load_module(&wasm_bytes).unwrap();
        let serialized = module.serialize().unwrap();

        let wrong_hash = "0000000000000000000000000000000000000000000000000000000000000000";
        let result = wasm.deserialize_verified_module(&serialized, wrong_hash);
        assert!(result.is_err(), "wrong hash should fail");
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("hash mismatch"),
            "error should mention hash mismatch: {}",
            err_msg
        );
    }
}
