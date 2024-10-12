import {
  createConnection,
  TextDocuments,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  InitializeResult,
  TextDocumentSyncKind,
  DiagnosticSeverity,
  Diagnostic,
  TextDocumentChangeEvent,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';

const connection = createConnection();

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

const classData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/classes.json'), 'utf8')
);

const enumsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/enums.json'), 'utf8')
);


interface ClassInfo {
  class_name: string;
  methods: string[];
}

const enforceClasses: ClassInfo[] = classData.classes;
const enforceClassNames: String[] = enforceClasses.map((classInfo: ClassInfo) => classInfo.class_name);


connection.onInitialize((): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
      },
    },
  };
});

connection.onCompletion(
  (params: TextDocumentPositionParams): CompletionItem[] => {
    const completions: CompletionItem[] = [];
    enforceClasses.forEach((cls) => {
      completions.push({
        label: cls.class_name,
        kind: CompletionItemKind.Class,
      });

      cls.methods.forEach((method) => {
        completions.push({
          label: method,
          kind: CompletionItemKind.Method,
        });
      });
    });
    return completions;
  }
);

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  item.detail = `Details for ${item.label}`;
  item.documentation = `Documentation for ${item.label}`;
  return item;
});

let timeoutId: NodeJS.Timeout;
documents.onDidChangeContent(async (change) => {
  clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      const diagnostics: Diagnostic[] = [];

      diagnostics.push(...checkMissingSemicolons(change));
      diagnostics.push(...checkUnmatchedBrackets(change));
      diagnostics.push(...checkUnusedVariables(change));
      diagnostics.push(...checkUndeclaredVariables(change));
    
      connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
    }, 500);
});

function checkMissingSemicolons(
  change: TextDocumentChangeEvent<TextDocument>
): Diagnostic[] {
  const textDocument = change.document;
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  const lines = text.split(/\r?\n/g);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (line.includes('//')) {
      line = line.split('//')[0].trim(); 
    }

    if (line === '' || line.startsWith('[')) {
      continue;
    }

    const noSemicolonNeeded = [
      /^.*\{$/,             // Lines ending with {
      /^.*\}$/,             // Lines ending with }
      /^if\s*\(.*\)$/,      // if statement
      /^else$/,             // else statement
      /^for\s*\(.*\)$/,     // for loop
      /^while\s*\(.*\)$/,   // while loop
      /^switch\s*\(.*\)$/,  // switch statement
      /^class\s+\w+/,       // class definition
      /^#/,                 // Preprocessor directives
    ];

    if (noSemicolonNeeded.some((pattern) => pattern.test(line))) {
      continue;
    }

    if (!line.endsWith(';')) {
      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: lines[i].length },
        },
        message: 'Missing semicolon at the end of the statement.',
        source: 'Enforce Language Server',
      };
      diagnostics.push(diagnostic);
    }
  }

  return diagnostics;
}


function checkUnmatchedBrackets(
  change: TextDocumentChangeEvent<TextDocument>
): Diagnostic[] {
  const textDocument = change.document;
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  const stack: { char: string; position: number }[] = [];
  const bracketPairs: { [key: string]: string } = { '(': ')', '{': '}', '[': ']' };
  const openingBrackets = Object.keys(bracketPairs);
  const closingBrackets = Object.values(bracketPairs);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (openingBrackets.includes(char)) {
      stack.push({ char, position: i });
    } else if (closingBrackets.includes(char)) {
      const expectedOpening = Object.keys(bracketPairs).find(
        (key) => bracketPairs[key] === char
      );
      if (stack.length === 0 || stack[stack.length - 1].char !== expectedOpening) {
        const diagnostic: Diagnostic = {
          severity: DiagnosticSeverity.Error,
          range: {
            start: textDocument.positionAt(i),
            end: textDocument.positionAt(i + 1),
          },
          message: `Unmatched closing bracket '${char}'.`,
          source: 'Enforce Language Server',
        };
        diagnostics.push(diagnostic);
      } else {
        stack.pop();
      }
    }
  }

  while (stack.length > 0) {
    const unmatched = stack.pop()!;
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: {
        start: textDocument.positionAt(unmatched.position),
        end: textDocument.positionAt(unmatched.position + 1),
      },
      message: `Unmatched opening bracket '${unmatched.char}'.`,
      source: 'Enforce Language Server',
    };
    diagnostics.push(diagnostic);
  }

  return diagnostics;
}

function checkUnusedVariables(
  change: TextDocumentChangeEvent<TextDocument>
): Diagnostic[] {
  const textDocument = change.document;
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  const variableUsagePattern = /\b(\w+)\b/g;

  const declaredVariables: {
    [varName: string]: { line: number; character: number; used: boolean };
  } = {};

  const lines = text.split(/\r?\n/g);

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    let line = lines[lineNumber].trim();

    if (line === '' || line.startsWith('[')) {
      continue;
    }

    const variableDeclarationPattern = /^(?:private|protected|static|const|ref|autoptr|inout|out|\s)*\s*(\w+)\s+(\w+)(?:\s*=\s*[^;]+)?\s*;/;

    const match = variableDeclarationPattern.exec(line);

    if (match && !isClassOrMethodDefinition(line)) {
      const varName = match[2];
      declaredVariables[varName] = {
        line: lineNumber,
        character: lines[lineNumber].indexOf(varName),
        used: false,
      };
    }
  }

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    let line = lines[lineNumber];

    if (line.trim().startsWith('//') || line.trim().startsWith('[')) {
      continue;
    }

    if (line.includes('//')) {
      line = line.split('//')[0].trim();
    }

    let match: RegExpExecArray | null;
    variableUsagePattern.lastIndex = 0;
    while ((match = variableUsagePattern.exec(line))) {
      const varName = match[1];

      if (isKeywordOrClass(varName) || isType(varName) || isClassOrMethodDefinition(line)) {
        continue;
      }

      if (declaredVariables[varName]) {
        declaredVariables[varName].used = true;
      }
    }
  }

  for (const varName in declaredVariables) {
    if (!declaredVariables[varName].used) {
      const variable = declaredVariables[varName];
      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Information,
        range: {
          start: { line: variable.line, character: variable.character },
          end: {
            line: variable.line,
            character: variable.character + varName.length,
          },
        },
        message: `Variable '${varName}' is declared but never used.`,
        source: 'Enforce Language Server',
        tags: [1], // DiagnosticTag.Unnecessary
      };
      diagnostics.push(diagnostic);
    }
  }

  return diagnostics;
}

function isClassOrMethodDefinition(line: string): boolean {
  const classPattern = /^\s*class\s+\w+/;
  const methodPattern = /^\s*(?:public|private|protected|static|const|override|\s)*\s*\w+\s+\w+\s*\(.*\)\s*\{/;

  return classPattern.test(line) || methodPattern.test(line);
}


function checkUndeclaredVariables(
  change: TextDocumentChangeEvent<TextDocument>
): Diagnostic[] {
  const textDocument = change.document;
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  const variableDeclarationPattern =
    /^(?:\s*(?:private|protected|static|const|ref|autoptr|inout|out))*\s*(\w+)\s+(\w+)(?:\s*=\s*[^;]+)?\s*;/;
  const variableUsagePattern = /\b(\w+)\b/g;

  const declaredVariables = new Set<string>();
  const lines = text.split(/\r?\n/g);

  const functionParameterPattern = /\(([^)]+)\)/;

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    let line = lines[lineNumber].trim();

    if (line === '' || line.startsWith('[')) {
      continue;
    }

    if (isClassOrMethodDefinition(line)) {
      const paramMatch = functionParameterPattern.exec(line);
      if (paramMatch) {
        const params = paramMatch[1].split(',').map(p => p.trim().split(' ').pop());
        params.forEach(param => declaredVariables.add(param!));
      }
      continue;
    }

    let match = variableDeclarationPattern.exec(line);
    if (match) {
      const varName = match[2];
      declaredVariables.add(varName);
    }
  }

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    let line = lines[lineNumber];

    if (line.trim().startsWith('//') || line.trim().startsWith('[') || isClassOrMethodDefinition(line)) {
      continue;
    }

    line = removeStringLiterals(line);

    let match: RegExpExecArray | null;
    variableUsagePattern.lastIndex = 0;
    while ((match = variableUsagePattern.exec(line))) {
      const varName = match[1];

      if (line.includes('//')) {
        line = line.split('//')[0].trim();
      }

      if (
        isKeywordOrClass(varName) ||
        isType(varName) ||
        isConstant(varName) ||
        isMethodOrPropertyInChain(line, varName) ||
        isEnumAccess(line, varName)
      ) {
        continue;
      }

      if (!declaredVariables.has(varName)) {
        const charIndex = match.index;
        const diagnostic: Diagnostic = {
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: lineNumber, character: charIndex },
            end: { line: lineNumber, character: charIndex + varName.length },
          },
          message: `Variable '${varName}' is used but not declared.`,
          source: 'Enforce Language Server',
        };
        diagnostics.push(diagnostic);
      }
    }
  }

  return diagnostics;
}

function isMethodOrPropertyInChain(line: string, varName: string): boolean {
  const methodOrPropertyPattern = new RegExp(`\\b(\\w+\\.)*${varName}\\s*\\(`);
  return methodOrPropertyPattern.test(line);
}

function isConstant(varName: string): boolean {
  return !isNaN(Number(varName)) || ['true', 'false'].includes(varName) || ['g_Game', 'g_ARGame'].includes(varName);
}

function removeStringLiterals(line: string): string {
  return line.replace(/"[^"]*"/g, '');
}

function isEnumAccess(line: string, varName: string): boolean {
  const enumPattern = new RegExp(`\\b\\w+\\.\\b${varName}\\b`);
  return enumPattern.test(line) || isKnownEnum(varName);
}

function isKnownEnum(varName: string): boolean {
  return enumsData.includes(varName);
}


function isKeywordOrClass(word: string): boolean {
  const keywords = [
    'class',
    'void',
    'int',
    'float',
    'string',
    'bool',
    'if',
    'else',
    'for',
    'while',
    'switch',
    'case',
    'return',
    'break',
    'continue',
    'private',
    'protected',
    'static',
    'const',
    'new',
    'delete',
    'this',
    'super',
    'auto',
    'vector',
    'ref',
    'vanilla',
    'extends',
  ];
  return keywords.includes(word) || enforceClassNames.includes(word);
}

function isType(word: string): boolean {
  const types = ['int', 'float', 'string', 'bool', 'vector', 'void'];
  return types.includes(word);
}

documents.listen(connection);
connection.listen();
