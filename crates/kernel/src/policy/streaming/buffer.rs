use bytes::Bytes;
use std::collections::VecDeque;

#[derive(Debug, Clone, Copy)]
pub enum BufferPreset {
    Small,  // 3-10 tokens (low latency)
    Medium, // 7-20 tokens (balanced) - DEFAULT
    Large,  // 10-30 tokens (high accuracy)
}

pub struct AdaptiveTokenBuffer {
    buffer: VecDeque<Bytes>,
    base_size: usize,
    max_size: usize,
    partial_match: bool,
}

impl AdaptiveTokenBuffer {
    pub fn new(preset: BufferPreset) -> Self {
        let (base_size, max_size) = match preset {
            BufferPreset::Small => (3, 10),
            BufferPreset::Medium => (7, 20),
            BufferPreset::Large => (10, 30),
        };

        Self {
            buffer: VecDeque::with_capacity(max_size),
            base_size,
            max_size,
            partial_match: false,
        }
    }

    pub fn push(&mut self, chunk: Bytes) {
        self.buffer.push_back(chunk);

        // Enforce bounded buffer (KERN-13)
        let limit = if self.partial_match {
            self.max_size
        } else {
            self.base_size
        };
        while self.buffer.len() > limit {
            self.buffer.pop_front();
        }
    }

    pub fn set_partial_match(&mut self, is_partial: bool) {
        self.partial_match = is_partial;
    }

    pub fn buffer_as_string(&self) -> String {
        let bytes: Vec<u8> = self.buffer.iter().flat_map(|b| b.iter().copied()).collect();

        // Handle UTF-8 boundary splits (Pitfall 3)
        String::from_utf8_lossy(&bytes).into_owned()
    }

    pub fn emit_oldest(&mut self) -> Option<Bytes> {
        self.buffer.pop_front()
    }

    pub fn flush_all(&mut self) -> Vec<Bytes> {
        self.buffer.drain(..).collect()
    }

    pub fn len(&self) -> usize {
        self.buffer.len()
    }

    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }

    pub fn clear(&mut self) {
        self.buffer.clear();
        self.partial_match = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_buffer_respects_base_size() {
        let mut buffer = AdaptiveTokenBuffer::new(BufferPreset::Small);

        for i in 0..10 {
            buffer.push(Bytes::from(format!("token{} ", i)));
        }

        // Base size is 3, should only have 3 chunks
        assert_eq!(buffer.len(), 3);
    }

    #[test]
    fn test_buffer_grows_on_partial_match() {
        let mut buffer = AdaptiveTokenBuffer::new(BufferPreset::Small);

        for i in 0..5 {
            buffer.push(Bytes::from(format!("token{} ", i)));
        }

        assert_eq!(buffer.len(), 3); // Base size

        buffer.set_partial_match(true);

        for i in 5..15 {
            buffer.push(Bytes::from(format!("token{} ", i)));
        }

        // Max size is 10, should now have 10 chunks
        assert_eq!(buffer.len(), 10);
    }

    #[test]
    fn test_bounded_buffer_enforcement() {
        let mut buffer = AdaptiveTokenBuffer::new(BufferPreset::Small);
        buffer.set_partial_match(true);

        for i in 0..50 {
            buffer.push(Bytes::from(format!("token{} ", i)));
        }

        // Even with partial match, max_size enforced (KERN-13)
        assert_eq!(buffer.len(), 10);
    }

    #[test]
    fn test_utf8_boundary_handling() {
        let mut buffer = AdaptiveTokenBuffer::new(BufferPreset::Small);

        // Multi-byte UTF-8: "café" split mid-codepoint
        buffer.push(Bytes::from(vec![0x63, 0x61, 0x66])); // "caf"
        buffer.push(Bytes::from(vec![0xC3, 0xA9])); // "é"

        let content = buffer.buffer_as_string();
        assert_eq!(content, "café");
    }
}
