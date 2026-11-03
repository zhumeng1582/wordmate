// Generated from contracts/word-annotations.json; run node scripts/generate-contracts.cjs.
export const wordAnnotationsSchema = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "expected_version"
  ],
  "minProperties": 2,
  "properties": {
    "expected_version": {
      "type": "integer",
      "minimum": 0
    },
    "easy": {
      "type": "boolean"
    },
    "error_prone": {
      "type": "boolean"
    },
    "favorite": {
      "type": "boolean"
    },
    "manual_needs_correction": {
      "type": "boolean"
    }
  },
  "not": {
    "required": [
      "easy",
      "error_prone"
    ],
    "properties": {
      "easy": {
        "const": true
      },
      "error_prone": {
        "const": true
      }
    }
  }
} as const;
