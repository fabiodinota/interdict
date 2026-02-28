use sha2::{Digest, Sha256};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct ChainState {
    previous_hash: [u8; 32],
    sequence_number: u64,
}

impl ChainState {
    pub fn new() -> Self {
        Self {
            previous_hash: [0u8; 32],
            sequence_number: 0,
        }
    }

    pub fn previous_hash(&self) -> [u8; 32] {
        self.previous_hash
    }

    pub fn sequence_number(&self) -> u64 {
        self.sequence_number
    }

    pub fn link(&mut self, bundle_content: &[u8]) -> ([u8; 32], u64) {
        let mut hasher = Sha256::new();
        hasher.update(self.previous_hash);
        hasher.update(bundle_content);
        let hash: [u8; 32] = hasher.finalize().into();

        self.previous_hash = hash;
        self.sequence_number += 1;

        (hash, self.sequence_number)
    }
}

impl Default for ChainState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Default)]
pub struct ChainManager {
    states: HashMap<String, ChainState>,
}

impl ChainManager {
    pub fn new() -> Self {
        Self {
            states: HashMap::new(),
        }
    }

    pub fn link(&mut self, kernel_id: &str, content: &[u8]) -> ([u8; 32], u64, [u8; 32]) {
        let state = self.states.entry(kernel_id.to_owned()).or_default();
        let previous_hash = state.previous_hash();
        let (chain_hash, sequence_number) = state.link(content);
        (chain_hash, sequence_number, previous_hash)
    }
}

#[cfg(test)]
mod tests {
    use super::{ChainManager, ChainState};
    use sha2::{Digest, Sha256};

    #[test]
    fn genesis_block_has_zero_previous_hash() {
        let state = ChainState::new();
        assert_eq!(state.previous_hash(), [0u8; 32]);
        assert_eq!(state.sequence_number(), 0);
    }

    #[test]
    fn sequential_bundles_form_a_verifiable_chain() {
        let mut state = ChainState::new();
        let b1 = b"bundle-1";
        let b2 = b"bundle-2";

        let (h1, s1) = state.link(b1);
        assert_eq!(s1, 1);

        let mut expected_1 = Sha256::new();
        expected_1.update([0u8; 32]);
        expected_1.update(b1);
        assert_eq!(h1, <[u8; 32]>::from(expected_1.finalize()));

        let (h2, s2) = state.link(b2);
        assert_eq!(s2, 2);

        let mut expected_2 = Sha256::new();
        expected_2.update(h1);
        expected_2.update(b2);
        assert_eq!(h2, <[u8; 32]>::from(expected_2.finalize()));
    }

    #[test]
    fn tampering_with_bundle_breaks_chain() {
        let mut state = ChainState::new();
        let (h1, _) = state.link(b"bundle-1");
        let (h2, _) = state.link(b"bundle-2");

        let mut tampered = Sha256::new();
        tampered.update(h1);
        tampered.update(b"bundle-2-tampered");
        let tampered_hash: [u8; 32] = tampered.finalize().into();

        assert_ne!(h2, tampered_hash);
    }

    #[test]
    fn kernel_ids_have_independent_chains() {
        let mut manager = ChainManager::new();

        let (h1a, s1a, p1a) = manager.link("kernel-a", b"event-a-1");
        let (h1b, s1b, p1b) = manager.link("kernel-b", b"event-b-1");
        let (_h2a, s2a, p2a) = manager.link("kernel-a", b"event-a-2");

        assert_eq!(p1a, [0u8; 32]);
        assert_eq!(p1b, [0u8; 32]);
        assert_eq!(s1a, 1);
        assert_eq!(s1b, 1);
        assert_eq!(s2a, 2);
        assert_eq!(p2a, h1a);
        assert_ne!(h1a, h1b);
    }
}
