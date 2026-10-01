// verify-doc-code-examples.ts
// This script scans markdown files for fenced code blocks and attempts to execute them.
// Supported languages: TypeScript/JavaScript (node), Rust (cargo), Bash (bash).

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const ROOT = path.resolve(__dirname, "..", "..");
const DOCS = ["README.md", "docs"]; // markdown locations

function* walk(dir: string): IterableIterator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield full;
    }
  }
}

function extractBlocks(content: string): { lang: string; code: string }[] {
  const blocks: { lang: string; code: string }[] = [];
  const regex = /```(\w+)?\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const lang = match[1] || "text";
    const code = match[2];
    blocks.push({ lang, code });
  }
  return blocks;
}

function runBlock(block: { lang: string; code: string }, filePath: string, index: number) {
  try {
    switch (block.lang) {
      case "typescript":
      case "javascript": {
        const tmp = path.join(ROOT, "tmp", `code_${index}.js`);
        fs.mkdirSync(path.dirname(tmp), { recursive: true });
        fs.writeFileSync(tmp, block.code);
        execSync(`node ${tmp}`, { stdio: "inherit" });
        break;
      }
      case "rust": {
        const tmp = path.join(ROOT, "tmp", `code_${index}.rs`);
        fs.mkdirSync(path.dirname(tmp), { recursive: true });
        fs.writeFileSync(tmp, block.code);
        execSync(`rustc ${tmp} -o ${tmp}.out && ${tmp}.out`, { stdio: "inherit" });
        break;
      }
      case "bash": {
        const tmp = path.join(ROOT, "tmp", `code_${index}.sh`);
        fs.mkdirSync(path.dirname(tmp), { recursive: true });
        fs.writeFileSync(tmp, block.code);
        execSync(`bash ${tmp}`, { stdio: "inherit" });
        break;
      }
      default:
        // ignore unsupported languages
        break;
    }
  } catch (e) {
    console.error(`\n❌ Failure in ${filePath} block #${index} (${block.lang}):`, e.message);
    process.exit(1);
  }
}

let failures = 0;
for (const base of DOCS) {
  const startPath = path.join(ROOT, base);
  for (const mdPath of walk(startPath)) {
    const rel = path.relative(ROOT, mdPath);
    const content = fs.readFileSync(mdPath, "utf8");
    const blocks = extractBlocks(content);
    blocks.forEach((b, i) => runBlock(b, rel, i));
  }
}

console.log("✅ All documentation code examples executed successfully.");
