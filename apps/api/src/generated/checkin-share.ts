// Generated from contracts/checkin-share.json; run node scripts/generate-contracts.cjs.
export const checkinShareSchema = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "date"
  ],
  "properties": {
    "date": {
      "type": "string",
      "format": "date"
    },
    "local_poster": {
      "type": "boolean"
    }
  }
} as const;
