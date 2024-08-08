// lexer.ts

// ... (FragmentType enum, Fragment interface, charFlags, lookup tables, etc.)

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

  // 1. Handle Line Breaks and Whitespace (optimized loop)
  while (end < source.length) {
    const charCode = source.charCodeAt(end);
    if (charCode < 128) {
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
        break; // Not whitespace, stop the loop
      }
    } else {
      // Handle Unicode whitespace characters if needed
      // ... (You'll need to implement this based on Unicode character categories)
      break; // For now, assume non-ASCII characters are not whitespace
    }
  }

  const startLoc = (line << COLUMN_BITS) | column;

  // 2. Handle Hashbang Comment (#!)
  if (start === 0 && source.startsWith("#!", end)) {
    type = FragmentType.HashbangComment;
    while (end < source.length && source.charCodeAt(end) !== 10) { // 10 is the charCode for '\n'
      value += source[end];
      end++;
    }
  }
  // 3. Handle Comments (including HTML-like comments)
  else if (source.startsWith("//", end)) {
    // ... (handle single-line comment - similar to before)
  } else if (source.startsWith("/*", end)) {
    // ... (handle multi-line comment - similar to before)
  } else if (source.startsWith("
    // HTML-like comment
    type = FragmentType.Comment;
    value += "", end)) {
        value += "-->";
        end += 3;
        break;
      } else {
        value += source[end];
        if (source[end] === "\n") {
          line++;
          column = 1;
        } else {
          column++;
        }
        end++;
      }
    }
    if (end >= source.length) {
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
    }

    // Update line and column
    updateLineAndColumn(source, start, end, line, column);
  }
  // 5. Numeric Literals
  else if (firstCharFlags & kIsDecimalDigit || (source[end] === "." && isDecimalDigit(source.charCodeAt(end + 1)))) {
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

    // Parse integer part (before decimal point or exponent)
    let hasDigits = false; // Track if any digits were encountered
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

    if (!hasDigits) {
      reportLexerError("Expected digits in numeric literal");
      return null;
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
    // ... (same as before)
  }
  // 4. Template Literals (with cooked and raw content)
  else if (source[end] === "`") {
    // ... (same as before)
  }
  // 5. Operators and Punctuators
  else {
    const tokenType = getOneCharTokenType(source[end]);
    if (tokenType !== null) {
      type = tokenType;
      value += source[end];
      end++;

      // Handle multi-character operators/punctuators 
      while (
        end < source.length &&
        (operatorsTable.has(value + source[end]) ||
          punctuatorsTable.has(value + source[end]))
      ) {
        value += source[end];
        end++;
      }

      // Update line and column
      updateLineAndColumn(source,
      source, start, end, line, column); 
    }
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
    cookedContent: type === FragmentType.Literal && source[start] === '`' ? cookedContent : undefined 
  };
}

function isDigitForNumberType(charCode: number, numberType: number): boolean {
  if (numberType & NUMBER_DECIMAL) {
    return isDecimalDigit(charCode);
  } else if (numberType & NUMBER_HEX) {
    return isHexDigit(charCode);
  } else if (numberType & NUMBER_OCTAL) {
    return isOctalDigit(charCode);
  } else if (numberType & NUMBER_BINARY) {
    return isBinaryDigit(charCode);
  }
  return false; 
}

function isWhitespace(charCode: number): boolean {
  if (charCode < 128) {
    return !!(charFlags[charCode] & kIsWhitespace);
  }

  // Handle Unicode whitespace characters if needed
  // ... (You'll need to implement this based on Unicode character categories)

  return false; // For now, assume non-ASCII characters are not whitespace
}

function isASCIIIdentifierStart(char: string): boolean {
  return /[a-zA-Z$_]/.test(char);
}

function isIdentifierStart(charCode: number): boolean {
  if (charCode < 128) {
    return !!(charFlags[charCode] & kIsAsciiIdentifierStart);
  }

  // Handle Unicode identifier start characters
  // ... (You'll need to implement this based on Unicode character categories)

  return false; // Placeholder 
}

function isIdentifierPart(charCode: number): boolean {
  if (charCode < 128) {
    return !!(charFlags[charCode] & kIsAsciiIdentifierPart);
  }

  // Handle Unicode identifier part characters
  // ... (You'll need to implement this based on Unicode character categories)

  return false; // Placeholder
}

function reportLexerError(message: string): void {
  const { line, column } = getLineAndColumnFromMask(locationMask);
  lintingErrors.push({
    message,
    line,
    column,
    ruleId: "lexer-error", // Or a more specific rule ID
  });
}

// Helper function to get the next non-whitespace fragment
function getNextNonWhitespaceFragment(code: string, start: number): Fragment | null {
  let pos = start;
  while (pos < code.length) {
    const fragment = getNextFragment(code, pos, [], new Map());
    if (!fragment) return null;
    if (!(fragment.type & FragmentType.Whitespace)) {
      return fragment;
    }
    pos = fragment.end;
  }
  return null;
}

// Helper function to get the previous comment fragment
function getPreviousCommentFragment(code: string, start: number): Fragment | null {
  // ... (implementation from previous response)
}

// Helper function to get the next comment fragment
function getNextCommentFragment(code: string, start: number): Fragment | null {
  // ... (implementation from previous response)
}

// ... (rest of the code in parser.ts)

// defaultPrettyPrint function (enhanced for comment handling)
function defaultPrettyPrint(ast: ASTNode, options: PrettyPrintOptions): string {
  let formattedCode = "";
  let indentLevel = 0;
  let currentLineLength = 0;
  let shouldBreakLine = false; 
  let previousFragment: Fragment | null = null;

  function printNode(node: ASTNode | null | undefined) {
    if (!node) return;

    // Handle comments associated with the node
    if (node.hasComment && !options.minify) {
      // ... (insert comments before the node, considering indentation)
    }

    switch (node.type) {
      // ... (other cases)

      case ASTNodeType.TemplateLiteral: {
        const templateLiteral = node as TemplateLiteral;
        let result = "";
        for (let i = 0; i < templateLiteral.quasis.length; i++) {
          const quasi = templateLiteral.quasis[i];
          result += quasi.value.cooked; // Use cooked content for default printing

          if (i < templateLiteral.expressions.length) {
            const expr = templateLiteral.expressions[i];
            result += "${";
            printNode(expr);
            result += "}";

            // Handle comments between "${" and the expression
            const nextFragment = getNextNonWhitespaceFragment(result, result.lastIndexOf("${") + 2);
            if (nextFragment && nextFragment.hasCommentBefore) {
              const commentFragment = getPreviousCommentFragment(result, nextFragment.start);
              if (commentFragment) {
                result = result.slice(0, nextFragment.start) + commentFragment.value + " " + result.slice(nextFragment.start);
              }
            }
          }
        }
        formattedCode += result;
        break;
      }

      // ... (other cases)
    }

    // ... (handle comments associated with the node (after the node))

    // ... (check if a line break is needed after this node)
  }

  // Start printing from the AST root
  printNode(ast);

  return formattedCode;
}

// ... (rest of the code in parser.ts)
