import { Fragment, FragmentType } from "./fragment"; 

// Bitmasks for fragment types
const fragmentTypeMasks = {
  Identifier: 1 << 0,
  Literal: 1 << 1,
  Keyword: 1 << 2,
  Operator: 1 << 3,
  Punctuator: 1 << 4,
  Comment: 1 << 5,
  Whitespace: 1 << 6,
  HashbangComment: 1 << 7,

  // Combined masks for common checks
  IdentifierOrKeyword: (1 << 0) | (1 << 2), // Identifier | Keyword
  LiteralOrIdentifier: (1 << 1) | (1 << 0), // Literal | Identifier
};

// Bitmasks for number literal types
const NUMBER_DECIMAL = 1 << 0;
const NUMBER_HEX = 1 << 1;
const NUMBER_OCTAL = 1 << 2;
const NUMBER_BINARY = 1 << 3;
const NUMBER_BIGINT = 1 << 4;

// Character classification lookup table (optimized with Uint8Array)
const charTypes = new Uint8Array(128);
for (let i = 0; i < 128; i++) {
  const char = String.fromCharCode(i);
  if (/\s/.test(char)) {
    charTypes[i] = FragmentType.Whitespace;
  } else if (isASCIIIdentifierStart(char)) {
    charTypes[i] = FragmentType.Identifier; 
  } else if (/[0-9]/.test(char)) {
    charTypes[i] = FragmentType.Literal; 
  } else if ("+-*/%=&|^!?:;,.<>{}[]()".includes(char)) {
    charTypes[i] = /[+\-*/%=&|^!]/.test(char)
      ? FragmentType.Operator
      : FragmentType.Punctuator;
  }
 }

// Lookup tables for keywords, operators, and punctuators
// ... (keywordsTable, operatorsTable, punctuatorsTable)

// Sets for reserved words (strict mode and module code)
const strictModeReservedWords = new Set([
  // ... (strict mode reserved words)
]);

const moduleCodeReservedWords = new Set([
  // ... (module code reserved words)
]);

// Bitmask for tracking line and column information
// 20 bits for line, 12 bits for column (assuming max line/column won't exceed these)
const LINE_BITS = 20;
const COLUMN_BITS = 12;
const LINE_MASK = (1 << LINE_BITS) - 1;
const COLUMN_MASK = (1 << COLUMN_BITS) - 1;

let locationMask = 0; // Initialize locationMask

export function getNextFragment(
  source: string,
  start: number,
  previousFragments: Fragment[],
  fragmentCache: Map<string, Fragment>
): Fragment | null {
  // ... (memoization logic)

  if (
    parserOptions.enableIncrementalParsing &&
    start < previousFragments.length &&
    previousFragments[start].end > start
  ) {
    // Reuse the previous fragment if it covers the current position
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

  // 1. Handle Line Breaks and Whitespace
  while (end < source.length && isWhitespace(source.charCodeAt(end))) {
    const char = source[end];
    if (char === "\n" || char === "\r" || char === "\u2028" || char === "\u2029") { 
      // Handle all line terminators
      line++;
      column = 0;
      type |= FragmentType.Whitespace; // Include newline as Whitespace
    } 
    column++;
    end++;
  }

  const startLoc = (line << COLUMN_BITS) | column;

  // 2. Handle Hashbang Comment (#!)
  if (start === 0 && source.startsWith("#!")) {
    type = FragmentType.HashbangComment;
    while (end < source.length && source[end] !== "\n") {
      value += source[end];
      end++;
    }
  }
  // 3. Handle Comments (including HTML-like comments)
  else if (source.startsWith("//", end)) {
    // Single-line comment
    type = FragmentType.Comment;
    while (end < source.length && source[end] !== "\n") {
      value += source[end];
      end++;
    }

    // Check if there's another comment immediately after on the same line
    let tempEnd = end + 1; // Skip the newline
    while (tempEnd < source.length && charTypes[source.charCodeAt(tempEnd)] & FragmentType.Whitespace) {
      tempEnd++;
    }
    if (source.startsWith("//", tempEnd)) {
      hasCommentAfter = true;
    }
  } else if (source.startsWith("/*", end)) {
    // Multi-line comment
    type = FragmentType.Comment;
    value += "/*";
    end += 2;
    while (end < source.length && !(source[end - 1] === "*" && source[end] === "/")) {
      value += source[end];
      if (source[end] === "\n") {
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
  } else if (source.startsWith("";
      end++;
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
      fragmentCache.set(`<span class="math-inline">\{nextNonWhitespaceFragment\.start\}\-</span>{source.slice(nextNonWhitespaceFragment.start)}`, nextNonWhitespaceFragment); 
    }

    currentPos = end;
    return getNextFragment(source, currentPos, previousFragments, fragmentCache); 
  }

  // 4. Handle Identifiers and Keywords
  if (isIdentifierStart(source.charCodeAt(end)) || (end > 0 && source[end - 1] === "\\")) {
    containsEscape = end > 0 && source[end - 1] === "\\";
    if (containsEscape) {
      end++; // Skip the backslash
      value += "\\"; 
    }

    type |= FragmentType.Identifier; 
    value += source[end++];

    while (end < source.length) {
      const charCode = source.charCodeAt(end);
      if (isIdentifierPart(charCode)) {
        value += source[end++];
      } else if (charCode >= 0xd800 && charCode <= 0xdbff) {
        // Handle potential surrogate pair
        const nextCharCode = source.charCodeAt(end + 1);
        if (
        nextCharCode >= 0xdc00 && nextCharCode <= 0xdfff) {
          // It's a valid surrogate pair, include both code units
          value += source[end] + source[end + 1];
          end += 2;
        } else {
          // Invalid surrogate pair, report an error
          reportLexerError("Invalid Unicode escape sequence");
          return null;
        }
      } else {
        break;
      }
    }

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
    }

    // Update line and column
    updateLineAndColumn(source, start, end, line, column);
  }
  // 2. Numeric Literals 
  else if (isDecimalDigit(firstCharCode) || (source[end] === "." && isDecimalDigit(source.charCodeAt(end + 1)))) {
    // Numeric Literal
    type = FragmentType.Literal;
    let numberType = NUMBER_DECIMAL;

    // Handle potential leading zero for hex, octal, or binary
    if (source[end] === "0") {
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

    // Parse the rest of the number based on its type
    let seenDecimalPoint = false;
    let seenExponent = false;
    let lastWasSeparator = false;

    while (end < source.length) {
      const char = source[end];
      const charCode = source.charCodeAt(end);

      if (char === "_") {
        // Numeric separator
        if (lastWasSeparator || value === "" || value.endsWith(".") || (seenExponent && !isDecimalDigit(charCode + 1))) {
          reportLexerError("Invalid numeric separator");
          return null;
        }
        lastWasSeparator = true;
      } else if (numberType === NUMBER_DECIMAL) {
        if (isDecimalDigit(charCode)) {
          value += char;
          lastWasSeparator = false;
        } else if (char === ".") {
          if (seenDecimalPoint || seenExponent) {
            reportLexerError("Unexpected number");
            return null;
          }
          seenDecimalPoint = true;
          value += char;
          lastWasSeparator = false;
        } else if (char.toLowerCase() === "e") {
          // Exponent part
          if (seenExponent || lastWasSeparator || value === "") {
            reportLexerError("Unexpected number");
            return null;
          }
          seenExponent = true;
          value += char;
          end++;
          if (source[end] === "+" || source[end] === "-") {
            value += source[end];
            end++;
          }
          if (!isDecimalDigit(source.charCodeAt(end))) {
            reportLexerError("Expected digits after exponent");
            return null;
          }
          while (end < source.length && isDecimalDigit(source.charCodeAt(end))) {
            value += source[end];
            end++;
          }
          if (value.endsWith("_")) {
            reportLexerError("Unexpected number");
            return null;
          }
          continue; // Continue the outer loop
        } else {
          break;
        }
      } else if (numberType === NUMBER_HEX) {
        if (isHexDigit(charCode)) {
          value += char;
          lastWasSeparator = false;
        } else {
          break;
        }
      } else if (numberType === NUMBER_OCTAL) {
        if (isOctalDigit(charCode)) {
          value += char;
          lastWasSeparator = false;
        } else {
          break;
        }
      } else if (numberType === NUMBER_BINARY) {
        if (isBinaryDigit(charCode)) {
          value += char;
          lastWasSeparator = false;
        } else {
          break;
        }
      }

      end++;
    }

    // Check for BigInt suffix
    if (source[end] === "n") {
      if (lastWasSeparator || numberType !== NUMBER_DECIMAL) {
        // Separator before BigInt suffix or invalid BigInt literal
        reportLexerError("Unexpected number");
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
      } else if (source[end] === source[end + 1] === "{") cookedContent += "{";
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
  else if (operatorsTable.has(source[end]) || punctuatorsTable.has(source[end])) {
    type = operatorsTable.has(source[end])
      ? FragmentType.Operator
      : FragmentType.Punctuator;
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

    // Update line and column
    updateLineAndColumn(source, start, end, line, column);
  }

  // No valid fragment found or lexer error occurred
  if (type === FragmentType.None) {
    return null;
  }

  const endLoc = (line << COLUMN_BITS) | column;
  return {
    type,
    value,
    start,
    end,
    loc: (startLoc << 12) | endLoc,
    hasCommentBefore,
    hasCommentAfter,
    containsEscape,
  };
}

// Helper function to check if escape sequence decoding is needed
function needsEscapeDecoding(options: ParserOptions): boolean {
  // we need escape decoding for constant folding, linting, or other transformations
  return options.minify || options.enableDCE || lintingPlugins.length > 0;
}

// Helper function to handle string escape sequences (slow path)
function handleStringEscape(source: string, start: number): [string | null, number] {
  let end = start + 1; // Skip the backslash

  if (end >= source.length) {
    return [null, start]; // Unterminated escape sequence
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
      end++; // Single-character escape sequence
      return [escapedChar, end];
    case "x":
      // Hexadecimal escape sequence (\xHH)
      if (
        end + 2 < source.length &&
        isHexDigit(source.charCodeAt(end + 1)) &&
        isHexDigit(source.charCodeAt(end + 2))
      ) {
        const hexValue = source.slice(end + 1, end + 3);
        end += 3;
        return [String.fromCharCode(parseInt(hexValue, 16)), end];
      } else {
        return [null, start]; // Invalid hexadecimal escape sequence
      }
    case "u":
      // Unicode escape sequence (\uHHHH or \u{H...H})
      if (source[end + 1] === "{") {
        // \u{H...H} format
        let codePoint = 0;
        end += 2; // Skip \u{
        while (end < source.length && source[end] !== "}") {
          if (isHexDigit(source.charCodeAt(end))) {
            codePoint = codePoint * 16 + parseInt(source[end], 16);
            if (codePoint > 0x10ffff) {
              return [null, start]; // Invalid Unicode code point
            }
            end++;
          } else {
            return [null, start]; // Invalid Unicode escape sequence
          }
        }
        if (end >= source.length) {
          return [null, start]; // Unterminated Unicode escape sequence
        }
        end++; // Skip }
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
          return [null, start]; // Invalid Unicode escape sequence
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
      // ... (parse up to 3 octal digits)
      return [null, start]; // TODO
    case "\n":
    case "\r":
    case "\u2028":
    case "\u2029":
      // Line continuation - ignore the backslash and line terminator
      end++; // Skip the line terminator
      return ["", end];
    default:
      // Other escape sequences or invalid escapes
      // TODO! handle specific cases or report errors here
      end++; 
      return [escapedChar, end];
  }
}

