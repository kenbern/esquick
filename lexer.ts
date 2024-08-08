// PORT OF PRIVATE CODE TO TYPESCRIPT 
//
// DO NOT USE!!

import { Fragment, FragmentType } from "./fragment";

// ... (operator precedence, fragmentTypeMasks, bitmasks for number literal types)

// Character classification bit flags
const kIsAsciiIdentifierStart = 1 << 0;
const kIsAsciiIdentifierPart = 1 << 1;
const kIsDecimalDigit = 1 << 2;
const kIsHexDigit = 1 << 3;
const kIsOctalDigit = 1 << 4;
const kIsBinaryDigit = 1 << 5;
const kIsWhitespace = 1 << 6;
const kIsLineTerminator = 1 << 7;

// Character flags lookup table
const charFlags = new Uint8Array(128);
for (let i = 0; i < 128; i++) {
  const char = String.fromCharCode(i);
  let flags = 0;

  if (/[a-zA-Z$_]/.test(char)) flags |= kIsAsciiIdentifierStart | kIsAsciiIdentifierPart;
  if (/[0-9]/.test(char)) flags |= kIsDecimalDigit | kIsHexDigit | kIsOctalDigit;
  if (/[0-1]/.test(char)) flags |= kIsBinaryDigit;
  if (/\s/.test(char)) flags |= kIsWhitespace;
  if (/\n|\r|\u2028|\u2029/.test(char)) flags |= kIsLineTerminator;

  charFlags[i] = flags;
}

// Sets for reserved words (strict mode and module code)
const strictModeReservedWords = new Set([
  "implements", "interface", "package", "private", "protected", "public", "static", 
  "let", "yield", "await" // These are reserved in strict mode if not used as identifiers
]);

const moduleCodeReservedWords = new Set([
  "await", "implements", "interface", "package", "private", "protected", "public", "static"
  // ... other module code reserved words
]);

// Bitmask for tracking line and column information
const LINE_BITS = 20;
const COLUMN_BITS = 12;
const LINE_MASK = (1 << LINE_BITS) - 1;
const COLUMN_MASK = (1 << COLUMN_BITS) - 1;

let locationMask = 0; 

// Helper function to get one char token type 
function getOneCharTokenType(char: string): FragmentType | null {
  if (operatorsTable.has(char)) return FragmentType.Operator;
  if (punctuatorsTable.has(char)) return FragmentType.Punctuator;
  return null; 
}

export function getNextFragment(
  source: string,
  start: number,
  previousFragments: Fragment[],
): Fragment | null { 

  if (parserOptions.enableIncrementalParsing && start < previousFragments.length && previousFragments[start].end > start) {
    return previousFragments[start];
  }

  let end = start;
  let type = FragmentType.None;
  let value = "";
  let line = 1;
  let column = 1;
  let hasCommentBefore = false;
  let hasCommentAfter = false;
  let containsEscape = false;

  // 1. Handle Line Breaks and Whitespace (optimized loop)
  while (end < source.length) {
    const charCode = source.charCodeAt(end);
    if (charCode < 128) {
      // Fast path for ASCII characters
      const flags = charFlags[charCode];
      if (flags & kIsWhitespace) {
        if (flags & kIsLineTerminator) {
          line++;
          column = 0;
          type |= FragmentType.Whitespace; 
        }
        column++;
        end++;
      } else {
        break; 
      }
    } else {
      // Slow path for Unicode characters
      if (isUnicodeWhitespace(charCode)) {
        if (isUnicodeLineTerminator(charCode)) {
          line++;
          column = 0;
          type |= FragmentType.Whitespace;
        }
        column++;
        end++;
      } else {
        break; 
      }
    }
  }

  const startLoc = (line << COLUMN_BITS) | column;

  // 2. Handle Hashbang Comment (#!)
  if (start === 0 && source.charCodeAt(0) === 35 && source.charCodeAt(1) === 33) { 
    type = FragmentType.HashbangComment;
    while (end < source.length && source.charCodeAt(end) !== 10) { // 10 is the charCode for '\n'
      value += source[end];
      end++;
    }
  }
  // 3. Handle Comments (including HTML-like comments)
  else if (source.charCodeAt(end) === 47) { 
    if (source.charCodeAt(end + 1) === 47) { // Single-line comment
      type = FragmentType.Comment;
      end += 2; // Skip '//'
      while (end < source.length && source.charCodeAt(end) !== 10) {
        value += source[end];
        end++;
      }

      // Check if there's another comment immediately after on the same line
      let tempEnd = end + 1; // Skip the newline
      while (tempEnd < source.length && charFlags[source.charCodeAt(tempEnd)] & kIsWhitespace) {
        tempEnd++;
      }
      if (source.charCodeAt(tempEnd) === 47 && source.charCodeAt(tempEnd + 1) === 47) {
        hasCommentAfter = true;
      }
    } else if (source.charCodeAt(end + 1) === 42) { // Multi-line comment
      type = FragmentType.Comment;
      value += "/*";
      end += 2;
      while (end < source.length && !(source.charCodeAt(end - 1) === 42 && source.charCodeAt(end) === 47)) {
        value += source[end];
        if (source.charCodeAt(end) === 10) {
          line++;
          column = 1;
        } else {
          column++;
        }
        end++;
      }
      if (end < source.length) {
        value += "*/";
        end++;
      } else {
        // Handle unterminated comment (error)
        reportLexerError("Unterminated multi-line comment");
        return null;
      }
    }
  } else if (
    source.charCodeAt(end) === 60 && 
    source.charCodeAt(end + 1) === 33 && 
    source.charCodeAt(end + 2) === 45 && 
    source.charCodeAt(end + 3) === 45
  ) { 
    // HTML-like comment
    if (!parserOptions.enableAnnexB) {
      reportLexerError("HTML-like comments are not allowed in non-Annex B mode");
      return null;
    }

    type = FragmentType.Comment;
    value += "";
      end += 3;
    } else {
      // Handle unterminated comment (error)
      reportLexerError("Unterminated HTML-like comment");
      return null;
    }
  }

  // If it was a comment or hashbang, skip it and continue to the next token
  if (type & (FragmentType.Comment | FragmentType.HashbangComment)) {
    // Update the 'hasCommentBefore' flag of the next non-whitespace fragment
    let nextNonWhitespaceFragment = getNextNonWhitespaceFragment(source, end);

    if (nextNonWhitespaceFragment) {
      nextNonWhitespaceFragment.hasCommentBefore = true;
    }

    currentPos = end;
    return getNextFragment(source, currentPos, previousFragments); 
  }

  // 4. Handle Identifiers and Keywords
  const firstCharFlags = charFlags[source.charCodeAt(end)];
  if (firstCharFlags & kIsAsciiIdentifierStart || (end > 0 && source[end - 1] === "\\")) {
    containsEscape = end > 0 && source[end - 1] === "\\";
    if (containsEscape) {
      end++; // Skip the backslash
      value += "\\"; 
    }

    type |= FragmentType.Identifier; 
    let currentCharFlags = firstCharFlags;

    do {
      value += source[end];
      end++;
      if (end >= source.length) break; // End of input
      currentCharFlags = charFlags[source.charCodeAt(end)];
    } while (currentCharFlags & kIsAsciiIdentifierPart);

    // Check if it's a keyword (only if not escaped)
    if (!containsEscape && keywordsTable.has(value)) {
      type = FragmentType.Keyword;

      // Check for restricted keywords in strict/module mode
      if (
        (currentScope?.isStrict && strictModeReservedWords.has(value)) ||
        (parserOptions.parseModuleCode && moduleCodeReservedWords.has(value))
      ) {
        reportLexerError(`Unexpected reserved word: '${value}'`);
        return null;
      }
    } else if (containsEscape && keywordsTable.has(value.slice(1))) { 
      // If it's an escaped keyword, throw an error
      reportLexerError(`Unexpected escaped keyword: '${value}'`);
      return null;
    }

    // Update line and column
    updateLineAndColumn(source, start, end, line, column);
  }
  // 5. Numeric Literals 
  else if (firstCharFlags & kIsDecimalDigit || (source[end] === "." && isDecimalDigit(source.charCodeAt(end + 1)))) {
    type = FragmentType.Literal;
    let numberType = NUMBER_DECIMAL;

    // Handle fractional numbers starting with '.'
    let startsWithDecimal = false;
    if (source[end] === ".") {
      startsWithDecimal = true;
      value += ".";
      end++;
    }

    // Handle potential leading zero for hex, octal, or binary (only if not starting with '.')
    if (!startsWithDecimal && source[end] === "0") {
      const nextChar = source[end + 1]?.toLowerCase();
      if (nextChar === "x") {
        numberType = NUMBER_HEX;
        value += "0x";
        end += 2;
      } else if (nextChar === "o") {
        numberType = NUMBER_OCTAL;
        value += "0o";
        end += 2;
      } else if (nextChar === "b") {
        numberType = NUMBER_BINARY;
        value += "0b";
        end += 2;
      } else if (nextChar >= "0" && nextChar <= "7") {
        // Legacy octal (disallowed in strict mode)
        if (currentScope?.isStrict) {
          reportLexerError("Octal literals are not allowed in strict mode");
          return null;
        }
        numberType = NUMBER_OCTAL;
      }
    }

    // Parse integer/fractional part 
    let hasDigits = false; 
    while (end < source.length) {
      const charCode = source.charCodeAt(end);
      if (isDigitForNumberType(charCode, numberType)) {
        value += source[end];
        hasDigits = true;
      } else if (char === "_" && !value.endsWith("_")) {
        // Allow numeric separators in all number types
        value += "_";
      } else {
        break;
      }
      end++;
    }

    if (!hasDigits && !startsWithDecimal) {
      reportLexerError("Expected digits in numeric literal");
      return null;
    } else if (!hasDigits && startsWithDecimal) {
      // If it starts with '.' and has no digits, it's not a number
      // Rewind to the '.' and return it as a punctuator
      end = start; 
      type = FragmentType.Punctuator;
      value = ".";
      break; 
    }

    // Parse fractional part (after decimal point)
    if (source[end] === ".") {
      if (numberType !== NUMBER_DECIMAL) {
        reportLexerError("Unexpected decimal point in non-decimal literal");
        return null;
      }
      value += ".";
      end++;
      hasDigits = false;
      while (end < source.length) {
        const charCode = source.charCodeAt(end);
        if (isDecimalDigit(charCode)) {
          value += source[end];
          hasDigits = true;
        } else if (char === "_"
        ) {
          // Allow numeric separators
          if (value.endsWith("_") || !isDecimalDigit(source.charCodeAt(end + 1))) {
            reportLexerError("Invalid numeric separator");
            return null;
          }
          value += "_";
        } else {
          break;
        }
        end++;
      }
      if (!hasDigits) {
        reportLexerError("Expected digits after decimal point");
        return null;
      }
    }

    // Parse exponent part (if any)
    if (source[end]?.toLowerCase() === "e") {
      if (numberType !== NUMBER_DECIMAL) {
        reportLexerError("Unexpected exponent in non-decimal literal");
        return null;
      }
      value += "e";
      end++;
      if (source[end] === "+" || source[end] === "-") {
        value += source[end];
        end++;
      }
      hasDigits = false;
      while (end < source.length && isDecimalDigit(source.charCodeAt(end))) {
        value += source[end];
        hasDigits = true;
        end++;
      }
      if (!hasDigits) {
        reportLexerError("Expected digits after exponent");
        return null;
      }
    }

    // Check for BigInt suffix
    if (source[end] === "n") {
      if (numberType !== NUMBER_DECIMAL) {
        // BigInt suffix is only allowed for decimal literals
        reportLexerError("Unexpected 'n' in non-decimal literal");
        return null;
      }
      numberType |= NUMBER_BIGINT;
      value += "n";
      end++;
    } else if (isIdentifierStart(source.charCodeAt(end))) {
      // Identifier start immediately after a numeric literal is not allowed
      reportLexerError("Unexpected identifier");
      return null;
    }

    // Update line and column
    updateLineAndColumn(source, start, end, line, column);
  }
  // 3. String Literals (with lazy escape sequence decoding)
  else if (source[end] === '"' || source[end] === "'") {
    type = FragmentType.Literal;
    const quote = source[end];
    end++;
    while (end < source.length && source[end] !== quote) {
      if (source[end] === "\\") {
        // Lazily decode escape sequences only if needed (e.g., for constant folding or linting)
        if (needsEscapeDecoding(parserOptions)) {
          const [escapedChar, newEnd] = handleStringEscape(source, end);
          if (escapedChar === null) {
            // Invalid escape sequence
            reportLexerError("Invalid escape sequence in string literal");
            return null;
          }
          value += escapedChar;
          end = newEnd;
        } else {
          // If escape decoding is not needed, keep the escape sequence as is
          value += "\\" + source[end + 1];
          end += 2;
        }
      } else if (source[end] === "\n") {
        reportLexerError("Unterminated string literal");
        return null;
      } else {
        value += source[end];
        end++;
      }
    }
    if (end >= source.length) {
      reportLexerError("Unterminated string literal");
      return null;
    }
    end++; // Include the closing quote
    value += quote;

    // Update
    // Update line and column
    updateLineAndColumn(source, start, end, line, column);
  }
  // 4. Template Literals (with cooked and raw content)
  else if (source[end] === "`") {
    type = FragmentType.Literal;
    let inExpression = false;
    let cookedContent = "";
    let rawContent = "`";
    end++;

    while (end < source.length) {
      if (source[end] === "`") {
        cookedContent += "`";
        rawContent += "`";
        end++;
        break;
      } else if (source[end] === "<span class="math-inline">" && source\[end \+ 1\] \=\=\= "\{"\) \{
cookedContent \+\= "</span>{";
        rawContent += "${";
        end += 2;
        inExpression = true;
      } else if (source[end] === "}" && inExpression) {
        cookedContent += "}";
        rawContent += "}";
        end++;
        inExpression = false;
      } else if (source[end] === "\\") {
        // Handle escape sequences (lazily decode if needed)
        if (needsEscapeDecoding(parserOptions)) {
          const [escapedChar, newEnd] = handleStringEscape(source, end);
          if (escapedChar === null) {
            reportLexerError("Invalid escape sequence in template literal");
            return null;
          }
          cookedContent += escapedChar;
          rawContent += source.slice(end, newEnd); // Keep the raw escape sequence
          end = newEnd;
        } else {
          cookedContent += "\\" + source[end + 1];
          rawContent += "\\" + source[end + 1];
          end += 2;
        }
      } else {
        cookedContent += source[end];
        rawContent += source[end];
        end++;
      }
    }

    if (end >= source.length) {
      reportLexerError("Unterminated template literal");
      return null;
    }

    // Update line and column
    updateLineAndColumn(source, start, end, line, column);

    return {
      type,
      value: rawContent, // Store the raw content for potential transformations
      start,
      end,
      loc: (startLoc << 12) | endLoc,
      hasCommentBefore,
      hasCommentAfter,
      cookedContent, // Store the cooked content for evaluation or other purposes
    };
  }
  // 5. Operators and Punctuators
  else {
    const tokenType = getOneCharTokenType(source[end]);
    if (tokenType !== null) {
      type = tokenType;
      value += source[end];
      end++;

      // Handle multi-character operators/punctuators (e.g., '++', '===', '...')
      while (
        end < source.length &&
        (operatorsTable.has(value + source[end]) ||
          punctuatorsTable.has(value + source[end]))
      ) {
        value += source[end];
        end++;
      }

      // Special case for '?.' - check if it's followed by a digit
      if (value === "?." && isDecimalDigit(source.charCodeAt(end))) {
        // If followed by a digit, it's part of an optional chaining call, not a separate operator
        type = FragmentType.None; 
        value = "";
        end = start; // Rewind to the start position
      }

      // Update line and column
      updateLineAndColumn(source, start, end, line, column);
    }
  }

  // No valid fragment found or lexer error occurred
  if (type === FragmentType.None) {
    return null; 
  }

  const endLoc = (line << COLUMN_BITS) | column;

  // Check for comment immediately after the fragment on the same line
  let tempEnd = end;
  while (tempEnd < source.length && charFlags[source.charCodeAt(tempEnd)] & kIsWhitespace) {
    if (charFlags[source.charCodeAt(tempEnd)] & kIsLineTerminator) {
      break; // Stop if we encounter a line terminator
    }
    tempEnd++;
  }
  if (
    (source.charCodeAt(tempEnd) === 47 && source.charCodeAt(tempEnd + 1) === 47) || // '//'
    (source.charCodeAt(tempEnd) === 47 && source.charCodeAt(tempEnd + 1) === 42)    // '/*'
  ) {
    hasCommentAfter = true;
  }

  return {
    type,
    value,
    start,
    end,
    loc: (startLoc << 12) | endLoc,
    hasCommentBefore,
    hasCommentAfter,
    containsEscape,
    cookedContent: type === FragmentType.Literal && source[start] === "`" ? cookedContent : undefined,
  };
}

// Helper functions

function isDigitForNumberType(charCode: number, numberType: number): boolean {
  // ... (same as before)
}

function isWhitespace(charCode: number): boolean {
  if (charCode < 128) {
    return !!(charFlags[charCode] & kIsWhitespace);
  }

  // Handle Unicode whitespace characters 
  return (
    charCode === 0x20 || // Space
    charCode === 0x09 || // Tab
    charCode === 0x0b || // Vertical Tab
    charCode === 0x0c || // Form Feed
    charCode === 0xa0 || // No-break space
    (charCode >= 0x1680 && charCode <= 0x180e) || // Ogham space mark, etc.
    (charCode >= 0x2000 && charCode <= 0x200a) || // En quad, hair space, etc.
    charCode === 0x202f || // Narrow no-break space
    charCode === 0x205f || // Medium mathematical space
    charCode === 0x3000 || // Ideographic space
    charCode === 0xfeff    // Byte Order Mark
  );
}

function isUnicodeWhitespace(charCode: number): boolean {
  // TODO: Check if the character is a Unicode whitespace character

  return false;
}

function isUnicodeLineTerminator(charCode: number): boolean {
  // Check if the character is a Unicode line terminator
  return charCode === 0x0a || charCode === 0x0d || charCode === 0x2028 || charCode === 0x2029;
}

function isASCIIIdentifierStart(char: string): boolean {
  return /[a-zA-Z$_]/.test(char);
}

function isIdentifierStart(charCode: number): boolean {
  if (charCode < 128) {
    return !!(charFlags[charCode] & kIsAsciiIdentifierStart);
  }

  // TODO: Handle Unicode identifier start characters
  
  return false; 
}

function isIdentifierPart(charCode: number): boolean {
  if (charCode < 128) {
    return !!(charFlags[charCode] & kIsAsciiIdentifierPart);
  }

  // TODO: Handle Unicode identifier part characters

  return false; 
}

function reportLexerError(message: string): void {
  const { line, column } = getLineAndColumnFromMask(locationMask);
  lintingErrors.push({
    message,
    line,
    column,
    ruleId: "lexer-error", 
  });
}

// Helper function to get the next non-whitespace fragment
function getNextNonWhitespaceFragment(code: string, start: number): Fragment | null {
  // ... 
}

// Helper function to get the previous comment fragment
function getPreviousCommentFragment(code: string, start: number): Fragment | null {
  // ... 
}

// Helper function to get the next comment fragment
function getNextCommentFragment(code: string, start: number): Fragment | null {
  // ... 
}

// Helper function to update line and column
function updateLineAndColumn(
  source: string,
  start: number,
  end: number,
  line: number,
  column: number
) {
  for (let i = start; i < end; i++) {
    const charCode = source.charCodeAt(i);
    if (isUnicodeLineTerminator(charCode)) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
}

// Helper function to handle string escape sequences (slow path)
function handleStringEscape(source: string, start: number): [string | null, number] {
  let end = start + 1; // Skip the backslash

  if (end >= source.length) {
    reportLexerError("Unterminated string/template literal");
    return [null, start]; 
  }

  const escapedChar = source[end];

  switch (escapedChar) {
    case "'":
    case '"':
    case "\\":
    case "b":
    case "f":
    case "n":
    case "r":
    case "t":
    case "v":
      end++; 
      return [escapedChar, end];

    case "x":
      // Hexadecimal escape sequence (\xHH)
      if (end + 2 < source.length && isHexDigit(source.charCodeAt(end + 1)) && isHexDigit(source.charCodeAt(end + 2))) {
        const hexValue = source.slice(end + 1, end + 3);
        end += 3;
        return [String.fromCharCode(parseInt(hexValue, 16)), end];
      } else {
        reportLexerError("Invalid hexadecimal escape sequence");
        return [null, start];
      }

    case "u":
      // Unicode escape sequence (\uHHHH or \u{H...H})
      if (source[end + 1] === "{") {
        // \u{H...H} format
        let codePoint = 0;
        end += 2; 
        while (end < source.length && source[end] !== "}") {
          if (isHexDigit(source.charCodeAt(end))) {
            codePoint = codePoint * 16 + parseInt(source[end], 16);
            if (codePoint > 0x10ffff) {
              reportLexerError("Invalid Unicode code point");
              return [null, start];
            }
            end++;
          } else {
            reportLexerError("Invalid Unicode escape sequence");
            return [null, start];
          }
        }
        if (end >= source.length) {
          reportLexerError("Unterminated Unicode escape sequence");
          return [null, start];
        }
        end++; 
        return [String.fromCodePoint(codePoint), end];
      } else {
        // \uHHHH format
        if (
          end + 4 < source.length &&
          isHexDigit(source.charCodeAt(end + 1)) &&
          isHexDigit(source.charCodeAt(end + 2)) &&
          isHexDigit(source.charCodeAt(end + 3)) &&
          isHexDigit(source.charCodeAt(end + 4))
        ) {
          const hexValue = source.slice(end + 1, end + 5);
          end += 5;
          return [String.fromCharCode(parseInt(hexValue, 16)), end];
        } else {
          reportLexerError("Invalid Unicode escape sequence");
          return [null, start]; 
        }
      }

    case "0":
    case "1":
    case "2":
    case "3":
    case "4":
    case "5":
    case "6":
    case "7":
      // Legacy octal escape sequence (disallowed in strict mode)
      if (currentScope?.isStrict) {
        reportLexerError("Octal escape sequences are not allowed in strict mode");
        return [null, start];
      }

      // Parse up to 3 octal digits
      let octalValue = parseInt(escapedChar);
      end++;
      if (end < source.length && isOctalDigit(source.charCodeAt(end))) {
        octalValue = octalValue * 8 + parseInt(source[end]);
        end++;
        if (end < source.length && isOctalDigit(source.charCodeAt(end))) {
          octalValue = octalValue * 8 + parseInt(source[end]);
          end++;
        }
      }

      // Octal escape sequences cannot represent code points greater than 255 (0xff)
      if (octalValue > 255) {
        reportLexerError("Invalid octal escape sequence");
        return [null, start];
      }

      return [String.fromCharCode(octalValue), end];

    case "8":
    case "9":
      // Disallowed in strict mode
      if (currentScope?.isStrict) {
        reportLexerError(`Invalid escape sequence in strict mode: '\\${escapedChar}'`);
        return [null, start];
      }
      // In non-strict mode, treat them as identity escapes
      end++;
      return [escapedChar, end];

    case "\n":
    case "\r":
    case "\u2028":
    case "\u2029":
      // Line continuation - ignore the backslash and line terminator
      end++; // Skip the line terminator
      return ["", end];
    default:
      // Other escape sequences or invalid escapes
      reportLexerError(`Invalid escape sequence: '\\${escapedChar}'`);
      return [null, start];
  }
}
