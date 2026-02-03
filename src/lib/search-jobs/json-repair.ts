/**
 * JSON repair utilities for handling malformed Gemini output.
 * These functions fix common issues like truncated URLs, unescaped newlines, etc.
 */

/**
 * Repair model output where direct_apply_link was truncated to "https:" and the next object was concatenated inside the string.
 * Pattern: "direct_apply_link": "https:\n  },\n  {\n    "job_title": ... → replace with "direct_apply_link": "" }, { "job_title": ...
 */
export function fixTruncatedDirectApplyLink(json: string): string {
  let out = json;
  // Match truncated direct_apply_link value containing }\s*,\s*{\s*" then next key (job_title, company, etc.)
  const re = /"direct_apply_link"\s*:\s*"https:\n[\s\S]*?\}\s*,\s*\{\s*"/g;
  out = out.replace(re, '"direct_apply_link": "" }, { "');
  const reCamel = /"directApplyLink"\s*:\s*"https:\n[\s\S]*?\}\s*,\s*\{\s*"/g;
  out = out.replace(reCamel, '"directApplyLink": "" }, { "');
  return out;
}

/**
 * Repair when a URL string was truncated and the model output a duplicate ```json block or [ inside it.
 * Pattern: "direct_apply_link": "https://...AHcx\n```json\n[ ... → close string, close object/array, drop the rest.
 * Also repairs content that ends with an unclosed URL (no following ```).
 */
export function fixTruncatedUrlThenDuplicateJson(json: string): string {
  // Truncated "direct_apply_link": "https://... (no closing ") followed by newline and ``` or newline and [
  const re = /"direct_apply_link"\s*:\s*"(?:https?:)?[^"]*?\n\s*```(?:json)?\s*[\s\S]*$/;
  if (re.test(json)) {
    return json.replace(re, '"direct_apply_link": "" } ]');
  }
  const reListing = /"listing_url"\s*:\s*"(?:https?:)?[^"]*?\n\s*```(?:json)?\s*[\s\S]*$/;
  if (reListing.test(json)) {
    return json.replace(reListing, '"listing_url": "" } ]');
  }
  // Same pattern but with duplicate [ (no backticks): "direct_apply_link": "https://...\n  [\n  { ...
  const reBracket = /"direct_apply_link"\s*:\s*"(?:https?:)?[^"]*?\n\s*\[\s*[\s\S]*$/;
  if (reBracket.test(json)) {
    return json.replace(reBracket, '"direct_apply_link": "" } ]');
  }
  // Content ends with unclosed URL (e.g. after stripping first code block, rest was truncated)
  const reUnclosed = /"direct_apply_link"\s*:\s*"(?:https?:)?[^"]*$/;
  if (reUnclosed.test(json.trim())) {
    return json.replace(reUnclosed, '"direct_apply_link": "" } ]');
  }
  return json;
}

/** Fix literal newlines/carriage returns inside double-quoted strings (JSON allows only \\n). */
export function fixUnescapedNewlinesInStrings(json: string): string {
  let out = "";
  let i = 0;
  let inDoubleString = false;
  let escape = false;
  while (i < json.length) {
    const c = json[i];
    if (inDoubleString) {
      if (escape) {
        out += c;
        escape = false;
        i++;
        continue;
      }
      if (c === "\\") {
        out += c;
        escape = true;
        i++;
        continue;
      }
      if (c === '"') {
        out += c;
        inDoubleString = false;
        i++;
        continue;
      }
      if (c === "\n") {
        out += "\\n";
        i++;
        continue;
      }
      if (c === "\r") {
        out += "\\r";
        i++;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (c === '"') {
      inDoubleString = true;
      out += c;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** If the array was truncated (e.g. token limit), try to close it at the last complete object. */
export function tryRepairTruncatedArray(raw: string): string | null {
  if (!raw.startsWith("[")) return null;
  let idx = raw.length - 1;
  while (idx >= 0) {
    const commaAt = raw.lastIndexOf("},", idx);
    if (commaAt === -1) break;
    const candidate = raw.slice(0, commaAt + 1) + "]";
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.length > 0) return candidate;
    } catch {
      idx = commaAt - 1;
      continue;
    }
    return candidate;
  }
  return null;
}

/**
 * Full JSON repair pipeline for Gemini output.
 * Takes raw model output and returns a cleaned JSON string ready for parsing.
 */
export function repairGeminiJson(rawOutput: string): string {
  let rawJson = rawOutput.trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const codeBlock = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock?.[1]) rawJson = codeBlock[1].trim();

  // Repair: truncated URL then duplicate ```json or [ or unclosed URL at end
  rawJson = fixTruncatedUrlThenDuplicateJson(rawJson);

  // Strip multi-line comments only (model sometimes adds them)
  // NOTE: We do NOT strip single-line comments (//) because they match URLs like "https://..."
  rawJson = rawJson.replace(/\/\*[\s\S]*?\*\//g, "");

  // Strip any leading text before first [ (e.g. "Here are the jobs:\n\n[...]")
  const firstBracket = rawJson.indexOf("[");
  if (firstBracket > 0) rawJson = rawJson.slice(firstBracket);

  // Repair: direct_apply_link truncated to "https:" with next object concatenated inside the string
  rawJson = fixTruncatedDirectApplyLink(rawJson);

  // Find the first complete JSON array by bracket matching (skip brackets inside strings)
  const start = rawJson.indexOf("[");
  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let quoteChar = "";
    let end = -1;
    for (let i = start; i < rawJson.length; i++) {
      const c = rawJson[i];
      if (inString) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === quoteChar) inString = false;
        continue;
      }
      if (c === '"' || c === "'") {
        inString = true;
        quoteChar = c;
        continue;
      }
      if (c === "[") depth++;
      else if (c === "]") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end !== -1) rawJson = rawJson.slice(start, end + 1);
  } else {
    const jsonMatch = rawJson.match(/\[[\s\S]*\]/);
    if (jsonMatch) rawJson = jsonMatch[0];
  }

  // Fix common non-standard JSON: trailing commas (apply repeatedly for nested structures)
  let prev = "";
  while (prev !== rawJson) {
    prev = rawJson;
    rawJson = rawJson.replace(/,(\s*[}\]])/g, "$1");
  }

  // Remove control characters that can break JSON (keep \n \r \t)
  rawJson = rawJson.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");

  // Repair: model sometimes puts a newline inside a string then the next key
  rawJson = rawJson.replace(/(.)\n\s*"(\w+)"\s*:/g, (_, before, key) =>
    /^[:\/\w]$/.test(before) ? `${before}", "${key}":` : `${before}\n    "${key}":`
  );

  // Fix unescaped newlines inside double-quoted strings (invalid in JSON)
  rawJson = fixUnescapedNewlinesInStrings(rawJson);

  return rawJson;
}

/**
 * Parse Gemini output into a job array.
 * Returns the parsed array or throws an error with details.
 */
export function parseGeminiJobsOutput(rawOutput: string): unknown[] {
  const rawJson = repairGeminiJson(rawOutput);

  let results: unknown[];
  try {
    results = JSON.parse(rawJson);
  } catch (e) {
    // Try truncation repair: model may have been cut off mid-output
    const repaired = tryRepairTruncatedArray(rawJson);
    if (repaired !== null) {
      results = JSON.parse(repaired);
    } else {
      throw e;
    }
  }

  if (!Array.isArray(results)) {
    throw new Error("Model output is not a JSON array.");
  }

  return results;
}
