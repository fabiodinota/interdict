use crate::policy::patterns::{PatternRegistry, PatternRule};
use crate::policy::redaction::RedactionEngine;
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct Detection {
    pub category: String,
    pub start: usize,
    pub end: usize,
    pub confidence: f32,
}

#[derive(Debug)]
pub enum ScanResult {
    NoMatch,
    PartialMatch,
    FullMatch(Vec<Detection>),
}

pub struct StreamingDetector {
    registry: Arc<PatternRegistry>,
    redactor: Arc<RedactionEngine>,
    context_window: usize,
}

impl StreamingDetector {
    pub fn new(registry: Arc<PatternRegistry>, redactor: Arc<RedactionEngine>) -> Self {
        Self {
            registry,
            redactor,
            context_window: 3, // Words before/after for context-aware detection
        }
    }

    pub fn scan(&self, content: &str) -> ScanResult {
        let mut detections = Vec::new();
        let mut has_partial = false;

        for rule in &self.registry.patterns {
            for m in rule.pattern.find_iter(content) {
                let text = &content[m.start()..m.end()];

                // Apply validator if present
                let valid = rule.validator.as_ref().map(|v| v(text)).unwrap_or(true);

                if !valid {
                    continue;
                }

                // Context-aware confidence (user decision from CONTEXT.md)
                let confidence = self.compute_confidence(content, m.start(), m.end(), rule);

                if confidence >= rule.base_confidence {
                    detections.push(Detection {
                        category: rule.category.clone(),
                        start: m.start(),
                        end: m.end(),
                        confidence,
                    });
                }
            }

            // Check for partial matches at end of content
            // A partial match is when the pattern could continue with more input
            if self.has_partial_match_at_end(content, rule) {
                has_partial = true;
            }
        }

        if !detections.is_empty() {
            ScanResult::FullMatch(detections)
        } else if has_partial {
            ScanResult::PartialMatch
        } else {
            ScanResult::NoMatch
        }
    }

    fn compute_confidence(
        &self,
        content: &str,
        start: usize,
        end: usize,
        rule: &PatternRule,
    ) -> f32 {
        let mut confidence = rule.base_confidence;

        // Extract context words around the match
        let words: Vec<&str> = content.split_whitespace().collect();
        let match_text = &content[start..end];

        // Find position of match in word sequence
        let match_pos = words.iter().position(|w| w.contains(match_text));

        if let Some(pos) = match_pos {
            let context_start = pos.saturating_sub(self.context_window);
            let context_end = (pos + self.context_window + 1).min(words.len());
            let context_words = &words[context_start..context_end];

            // Boost confidence if context contains relevant keywords
            for booster in &rule.context_boosters {
                if context_words
                    .iter()
                    .any(|w| w.to_lowercase().contains(&booster.to_lowercase()))
                {
                    confidence = (confidence + 0.2).min(1.0);
                }
            }
        }

        confidence
    }

    fn has_partial_match_at_end(&self, content: &str, rule: &PatternRule) -> bool {
        // Check if content ends with a prefix that could be part of a pattern
        // For simplicity in Phase 3, check if last 10 chars could start a pattern
        if content.len() < 3 {
            return false;
        }

        // Get the tail of the content
        let tail_start = content.len().saturating_sub(10);
        let tail = &content[tail_start..];

        // For email patterns, check if we have partial structure like "user@" or "user@ex"
        // This is a heuristic — a more sophisticated approach would check pattern prefixes
        if rule.category == "EMAIL" {
            // Check if tail contains @ but doesn't match the full pattern
            if tail.contains('@') && rule.pattern.find(tail).is_none() {
                return true;
            }
        }

        // Generic heuristic: if pattern finds a match that touches the end, it might be partial
        if let Some(m) = rule.pattern.find(tail)
            && m.end() == tail.len()
        {
            return true;
        }

        false
    }

    pub fn apply_redaction(&self, content: &str, detections: Vec<Detection>) -> String {
        // Merge overlapping detections (user decision: tag with all matches)
        let merged = self.merge_overlapping(detections);

        // Apply redactions in reverse order to preserve indices
        let mut result = content.to_string();
        for det in merged.iter().rev() {
            let original = &content[det.start..det.end];
            let placeholder = self.redactor.create_placeholder(&det.category, original);
            result.replace_range(det.start..det.end, &placeholder);
        }

        result
    }

    fn merge_overlapping(&self, mut detections: Vec<Detection>) -> Vec<Detection> {
        if detections.is_empty() {
            return detections;
        }

        detections.sort_by_key(|d| d.start);

        let mut merged = Vec::new();
        let mut current = detections[0].clone();

        for det in detections.into_iter().skip(1) {
            if det.start <= current.end {
                // Overlapping: merge categories (user decision from CONTEXT.md)
                current.category = format!("{}|{}", current.category, det.category);
                current.end = current.end.max(det.end);
            } else {
                merged.push(current);
                current = det;
            }
        }
        merged.push(current);

        merged
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::patterns::{PatternRegistry, PatternRule};
    use regex::Regex;

    #[test]
    fn test_scan_finds_matches() {
        let registry = Arc::new(PatternRegistry {
            patterns: vec![PatternRule {
                category: "EMAIL".to_string(),
                pattern: Regex::new(r"[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}").unwrap(),
                validator: None,
                base_confidence: 0.9,
                context_boosters: vec![],
            }],
            version: 1,
        });

        let redactor = Arc::new(RedactionEngine::empty());
        let detector = StreamingDetector::new(registry, redactor);

        let result = detector.scan("Contact me at user@example.com for details");

        match result {
            ScanResult::FullMatch(detections) => {
                assert_eq!(detections.len(), 1);
                assert_eq!(detections[0].category, "EMAIL");
            }
            _ => panic!("Expected FullMatch"),
        }
    }

    #[test]
    fn test_partial_match_detection() {
        let registry = Arc::new(PatternRegistry {
            patterns: vec![PatternRule {
                category: "EMAIL".to_string(),
                pattern: Regex::new(r"[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}").unwrap(),
                validator: None,
                base_confidence: 0.9,
                context_boosters: vec![],
            }],
            version: 1,
        });

        let redactor = Arc::new(RedactionEngine::empty());
        let detector = StreamingDetector::new(registry, redactor);

        // Content ends with partial email
        let result = detector.scan("Contact me at user@exam");

        match result {
            ScanResult::PartialMatch => {}
            _ => panic!("Expected PartialMatch, got {:?}", result),
        }
    }

    #[test]
    fn test_overlapping_categories() {
        let registry = Arc::new(PatternRegistry {
            patterns: vec![
                PatternRule {
                    category: "PHONE".to_string(),
                    pattern: Regex::new(r"\d{3}-\d{4}").unwrap(),
                    validator: None,
                    base_confidence: 0.8,
                    context_boosters: vec![],
                },
                PatternRule {
                    category: "ACCOUNT".to_string(),
                    pattern: Regex::new(r"\d{3}-\d{4}").unwrap(),
                    validator: None,
                    base_confidence: 0.8,
                    context_boosters: vec![],
                },
            ],
            version: 1,
        });

        let redactor = Arc::new(RedactionEngine::empty());
        let detector = StreamingDetector::new(registry, redactor);

        let result = detector.scan("Number: 555-1234");

        match result {
            ScanResult::FullMatch(detections) => {
                // Both patterns match same text
                assert_eq!(detections.len(), 2);
            }
            _ => panic!("Expected FullMatch"),
        }
    }
}
