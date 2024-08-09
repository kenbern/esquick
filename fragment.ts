export const enum FragmentType {
  None = 0,
  Identifier = 1 << 0,
  Literal = 1 << 1,
  Keyword = 1 << 2,
  Operator = 1 << 3,
  Punctuator = 1 << 4,
  Comment = 1 << 5,
  Whitespace = 1 << 6,
  HashbangComment = 1 << 7,
  RegularExpressionLiteral = 1 << 8,

  // Combined masks
  IdentifierOrKeyword = Identifier | Keyword,
  LiteralOrIdentifier = Literal | Identifier,
}

// Bit flags for fragment metadata
const enum FragmentFlags {
  None = 0,
  HasCommentBefore = 1 << 0,
  HasCommentAfter = 1 << 1,
  ContainsEscape = 1 << 2
}

export interface Fragment {
  type: FragmentType;
  value: string;
  start: number;
  end: number;
  loc: number;
  flags: FragmentFlags; // Combine metadata flags
  cookedContent?: string; // For template literals
}
