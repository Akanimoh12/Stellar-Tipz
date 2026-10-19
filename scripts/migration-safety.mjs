const destructivePatterns = [
  { name: 'drop operation', pattern: /\bDROP\s+(?:TABLE|COLUMN|INDEX|CONSTRAINT)\b/i },
  { name: 'new NOT NULL constraint', pattern: /ALTER\s+COLUMN[\s\S]*?SET\s+NOT\s+NULL/i },
  { name: 'column type change', pattern: /ALTER\s+COLUMN[\s\S]*?\bTYPE\b/i },
];

export function inspectMigrationSql(sql, fileName) {
  const findings = [];
  for (const { name, pattern } of destructivePatterns) {
    if (pattern.test(sql)) findings.push({ fileName, kind: name });
  }
  return findings;
}