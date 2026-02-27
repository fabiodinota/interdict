//! Validators for pattern matching beyond simple regex.
//!
//! These validators provide additional checks to reduce false positives:
//! - Luhn checksum for credit card numbers
//! - IBAN checksum validation
//!
//! Source: Phase 3 research + financial data validation standards

/// Validate a credit card number using the Luhn algorithm.
///
/// The Luhn algorithm (mod-10 checksum) detects single-digit errors and
/// most transposition errors in credit card numbers. It's used by all
/// major card networks (Visa, Mastercard, Amex, etc.).
///
/// # Algorithm
/// 1. Starting from the rightmost digit, double every second digit
/// 2. If doubling results in a number > 9, subtract 9
/// 3. Sum all digits
/// 4. If sum % 10 == 0, the number is valid
///
/// # Example
/// ```
/// # use kernel::policy::patterns::validators::luhn_check;
/// assert!(luhn_check("4532015112830366"));  // Valid Visa test card
/// assert!(!luhn_check("1234567812345678")); // Invalid checksum
/// ```
pub fn luhn_check(number: &str) -> bool {
    // Remove spaces and dashes
    let digits: String = number.chars().filter(|c| c.is_ascii_digit()).collect();

    if digits.is_empty() {
        return false;
    }

    let mut sum = 0;
    let mut double = false;

    // Process digits from right to left
    for digit in digits.chars().rev() {
        let mut n = match digit.to_digit(10) {
            Some(d) => d,
            None => return false,
        };

        if double {
            n *= 2;
            if n > 9 {
                n -= 9;
            }
        }

        sum += n;
        double = !double;
    }

    sum % 10 == 0
}

/// Validate an IBAN (International Bank Account Number) checksum.
///
/// IBAN uses mod-97 checksum validation per ISO 13616.
///
/// # Algorithm
/// 1. Move first 4 characters to end
/// 2. Replace letters with numbers (A=10, B=11, ..., Z=35)
/// 3. Calculate mod 97 of the resulting number
/// 4. Valid if mod 97 == 1
///
/// # Example
/// ```
/// # use kernel::policy::patterns::validators::validate_iban;
/// assert!(validate_iban("GB82WEST12345698765432"));  // Valid UK IBAN
/// assert!(!validate_iban("GB82WEST12345698765433")); // Invalid checksum
/// ```
pub fn validate_iban(iban: &str) -> bool {
    // Remove spaces
    let iban = iban.replace(' ', "");

    // IBAN length constraints: 15-34 characters
    if iban.len() < 15 || iban.len() > 34 {
        return false;
    }

    // Must start with 2 letters (country code)
    if !iban.chars().take(2).all(|c| c.is_ascii_alphabetic()) {
        return false;
    }

    // Move first 4 characters to end
    let rearranged = format!("{}{}", &iban[4..], &iban[..4]);

    // Replace letters with numbers (A=10, B=11, ..., Z=35)
    let mut numeric = String::new();
    for c in rearranged.chars() {
        if c.is_ascii_alphabetic() {
            let value = c.to_ascii_uppercase() as u32 - 'A' as u32 + 10;
            numeric.push_str(&value.to_string());
        } else if c.is_ascii_digit() {
            numeric.push(c);
        } else {
            return false; // Invalid character
        }
    }

    // Calculate mod 97 using chunks to avoid overflow
    let mut remainder = 0u32;
    for chunk in numeric.chars().collect::<Vec<_>>().chunks(7) {
        let chunk_str: String = chunk.iter().collect();
        let num = match format!("{}{}", remainder, chunk_str).parse::<u64>() {
            Ok(n) => n,
            Err(_) => return false,
        };
        remainder = (num % 97) as u32;
    }

    remainder == 1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_luhn_check_valid_cards() {
        // Valid test credit card numbers (common test numbers, not real)
        assert!(luhn_check("4532015112830366")); // Visa
        assert!(luhn_check("5425233430109903")); // Mastercard
        assert!(luhn_check("374245455400126")); // Amex (15 digits)
        assert!(luhn_check("6011000991300009")); // Discover
    }

    #[test]
    fn test_luhn_check_invalid_cards() {
        assert!(!luhn_check("4532015112830367")); // Last digit wrong
        assert!(!luhn_check("1234567812345678")); // Random digits
                                                  // Note: "0000000000000000" actually passes Luhn check (mathematically valid)
    }

    #[test]
    fn test_luhn_check_with_spaces_and_dashes() {
        assert!(luhn_check("4532 0151 1283 0366")); // Spaces
        assert!(luhn_check("4532-0151-1283-0366")); // Dashes
        assert!(luhn_check("4532 0151-1283 0366")); // Mixed
    }

    #[test]
    fn test_luhn_check_empty_and_invalid() {
        assert!(!luhn_check(""));
        assert!(!luhn_check("not-a-number"));
        assert!(!luhn_check("123")); // Too short but invalid checksum
    }

    #[test]
    fn test_validate_iban_valid() {
        // Valid IBANs from various countries
        assert!(validate_iban("GB82WEST12345698765432")); // UK
        assert!(validate_iban("DE89370400440532013000")); // Germany
        assert!(validate_iban("FR1420041010050500013M02606")); // France
        assert!(validate_iban("IT60X0542811101000000123456")); // Italy
    }

    #[test]
    fn test_validate_iban_invalid_checksum() {
        assert!(!validate_iban("GB82WEST12345698765433")); // Last digit wrong
        assert!(!validate_iban("DE89370400440532013001")); // Last digit wrong
    }

    #[test]
    fn test_validate_iban_with_spaces() {
        assert!(validate_iban("GB82 WEST 1234 5698 7654 32")); // Spaces (common formatting)
    }

    #[test]
    fn test_validate_iban_invalid_format() {
        assert!(!validate_iban("1234567890")); // Must start with letters
        assert!(!validate_iban("XX")); // Too short
        assert!(!validate_iban("GB82WEST")); // Too short
        assert!(!validate_iban("GB82WEST123456987654321234567890123")); // Too long (>34)
    }

    #[test]
    fn test_validate_iban_invalid_characters() {
        assert!(!validate_iban("GB82WEST!@#$%^&*()")); // Special characters
    }
}
