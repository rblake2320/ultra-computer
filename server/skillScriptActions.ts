import type { SkillScript } from "@shared/schema";

export interface SkillScriptCopyResult {
  content: string;
  language: string;
  name: string;
  executed: false;
  operation: "copy_only";
  notice: string;
}

export function prepareSkillScriptCopy(script: SkillScript): SkillScriptCopyResult {
  return {
    content: script.content,
    language: script.language,
    name: script.name,
    executed: false,
    operation: "copy_only",
    notice: "Script execution is not performed here. The content is returned for review and copying.",
  };
}
