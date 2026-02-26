//! Request ID middleware for structured log correlation.
//!
//! Generates a UUID v4 for each request and attaches it as an
//! `x-request-id` header and tracing span field.
//!
//! Full Tower middleware implementation in Task 3.
