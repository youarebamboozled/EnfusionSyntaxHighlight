"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Create a connection for the server
const connection = (0, node_1.createConnection)();
// Create a manager for open text documents
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
// Load class data from JSON file
const classData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/classes.json'), 'utf8'));
const enumsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/enums.json'), 'utf8'));
const enforceClasses = classData.classes;
const enforceClassNames = enforceClasses.map((classInfo) => classInfo.class_name);
// Initialize the language server
connection.onInitialize(() => {
    return {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
            },
        },
    };
});
// Provide completion items for Enforce classes and methods
connection.onCompletion((params) => {
    const completions = [];
    enforceClasses.forEach((cls) => {
        completions.push({
            label: cls.class_name,
            kind: node_1.CompletionItemKind.Class,
        });
        cls.methods.forEach((method) => {
            completions.push({
                label: method,
                kind: node_1.CompletionItemKind.Method,
            });
        });
    });
    return completions;
});
// Provide additional details for a completion item when it is selected
connection.onCompletionResolve((item) => {
    item.detail = `Details for ${item.label}`;
    item.documentation = `Documentation for ${item.label}`;
    return item;
});
// Single handler for content changes that runs multiple diagnostic checks
documents.onDidChangeContent((change) => __awaiter(void 0, void 0, void 0, function* () {
    const diagnostics = [];
    // Run each diagnostic check and collect diagnostics
    diagnostics.push(...checkMissingSemicolons(change));
    diagnostics.push(...checkUnmatchedBrackets(change));
    diagnostics.push(...checkUnusedVariables(change));
    diagnostics.push(...checkUndeclaredVariables(change));
    // Send the collected diagnostics to the client
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
}));
function checkMissingSemicolons(change) {
    const textDocument = change.document;
    const text = textDocument.getText();
    const diagnostics = [];
    const lines = text.split(/\r?\n/g);
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        // Remove comments from the line
        if (line.includes('//')) {
            line = line.split('//')[0].trim(); // Remove everything after '//' (the comment)
        }
        // Ignore empty lines and attributes
        if (line === '' || line.startsWith('[')) {
            continue;
        }
        // Patterns that do not require semicolons
        const noSemicolonNeeded = [
            /^.*\{$/, // Lines ending with {
            /^.*\}$/, // Lines ending with }
            /^if\s*\(.*\)$/, // if statement
            /^else$/, // else statement
            /^for\s*\(.*\)$/, // for loop
            /^while\s*\(.*\)$/, // while loop
            /^switch\s*\(.*\)$/, // switch statement
            /^class\s+\w+/, // class definition
            /^#/, // Preprocessor directives
        ];
        if (noSemicolonNeeded.some((pattern) => pattern.test(line))) {
            continue;
        }
        // Check if the remaining code (after removing the comment) ends with a semicolon
        if (!line.endsWith(';')) {
            const diagnostic = {
                severity: node_1.DiagnosticSeverity.Error,
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
// Check for unmatched opening and closing brackets
function checkUnmatchedBrackets(change) {
    const textDocument = change.document;
    const text = textDocument.getText();
    const diagnostics = [];
    const stack = [];
    const bracketPairs = { '(': ')', '{': '}', '[': ']' };
    const openingBrackets = Object.keys(bracketPairs);
    const closingBrackets = Object.values(bracketPairs);
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (openingBrackets.includes(char)) {
            stack.push({ char, position: i });
        }
        else if (closingBrackets.includes(char)) {
            const expectedOpening = Object.keys(bracketPairs).find((key) => bracketPairs[key] === char);
            if (stack.length === 0 || stack[stack.length - 1].char !== expectedOpening) {
                // Unmatched closing bracket
                const diagnostic = {
                    severity: node_1.DiagnosticSeverity.Error,
                    range: {
                        start: textDocument.positionAt(i),
                        end: textDocument.positionAt(i + 1),
                    },
                    message: `Unmatched closing bracket '${char}'.`,
                    source: 'Enforce Language Server',
                };
                diagnostics.push(diagnostic);
            }
            else {
                stack.pop();
            }
        }
    }
    // Any remaining unmatched opening brackets
    while (stack.length > 0) {
        const unmatched = stack.pop();
        const diagnostic = {
            severity: node_1.DiagnosticSeverity.Error,
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
function checkUnusedVariables(change) {
    const textDocument = change.document;
    const text = textDocument.getText();
    const diagnostics = [];
    const variableUsagePattern = /\b(\w+)\b/g;
    const declaredVariables = {};
    const lines = text.split(/\r?\n/g);
    // Collect variable declarations
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
        let line = lines[lineNumber].trim();
        // Skip empty lines and attributes
        if (line === '' || line.startsWith('[')) {
            continue;
        }
        // Match variable declaration, avoiding class/method/function definitions
        const variableDeclarationPattern = /^(?:public|private|protected|static|const|ref|autoptr|inout|out|\s)*\s*(\w+)\s+(\w+)(?:\s*=\s*[^;]+)?\s*;/;
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
    // Check variable usage
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
        let line = lines[lineNumber];
        // Skip comments and attributes
        if (line.trim().startsWith('//') || line.trim().startsWith('[')) {
            continue;
        }
        if (line.includes('//')) {
            line = line.split('//')[0].trim();
        }
        let match;
        variableUsagePattern.lastIndex = 0;
        while ((match = variableUsagePattern.exec(line))) {
            const varName = match[1];
            // Skip keywords, types, and class/method definitions
            if (isKeywordOrClass(varName) || isType(varName) || isClassOrMethodDefinition(line)) {
                continue;
            }
            if (declaredVariables[varName]) {
                declaredVariables[varName].used = true;
            }
        }
    }
    // Report unused variables
    for (const varName in declaredVariables) {
        if (!declaredVariables[varName].used) {
            const variable = declaredVariables[varName];
            const diagnostic = {
                severity: node_1.DiagnosticSeverity.Information,
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
function isClassOrMethodDefinition(line) {
    // Check if the line is a class or method definition
    const classPattern = /^\s*class\s+\w+/;
    const methodPattern = /^\s*(?:public|private|protected|static|const|override|\s)*\s*\w+\s+\w+\s*\(.*\)\s*\{/;
    return classPattern.test(line) || methodPattern.test(line);
}
function checkUndeclaredVariables(change) {
    const textDocument = change.document;
    const text = textDocument.getText();
    const diagnostics = [];
    const variableDeclarationPattern = /^(?:\s*(?:private|protected|static|const|ref|autoptr|inout|out))*\s*(\w+)\s+(\w+)(?:\s*=\s*[^;]+)?\s*;/;
    const variableUsagePattern = /\b(\w+)\b/g;
    const declaredVariables = new Set();
    const lines = text.split(/\r?\n/g);
    // Collect function/method parameters as declared variables
    const functionParameterPattern = /\(([^)]+)\)/;
    // Collect variable declarations, skipping class and method definitions
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
        let line = lines[lineNumber].trim();
        // Skip empty lines and attributes
        if (line === '' || line.startsWith('[')) {
            continue;
        }
        // Skip class and method definitions
        if (isClassOrMethodDefinition(line)) {
            // Extract method parameters and add them as declared variables
            const paramMatch = functionParameterPattern.exec(line);
            if (paramMatch) {
                const params = paramMatch[1].split(',').map(p => p.trim().split(' ').pop());
                params.forEach(param => declaredVariables.add(param));
            }
            continue;
        }
        let match = variableDeclarationPattern.exec(line);
        if (match) {
            const varName = match[2];
            declaredVariables.add(varName);
        }
    }
    // Check variable usage
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
        let line = lines[lineNumber];
        // Skip comments and attributes
        if (line.trim().startsWith('//') || line.trim().startsWith('[') || isClassOrMethodDefinition(line)) {
            continue;
        }
        // Remove string literals from the line to avoid false flags
        line = removeStringLiterals(line);
        let match;
        variableUsagePattern.lastIndex = 0;
        while ((match = variableUsagePattern.exec(line))) {
            const varName = match[1];
            if (line.includes('//')) {
                line = line.split('//')[0].trim();
            }
            // Skip keywords, types, constants (like 0, 1), and method calls in chains
            if (isKeywordOrClass(varName) ||
                isType(varName) ||
                isConstant(varName) ||
                isMethodOrPropertyInChain(line, varName) ||
                isEnumAccess(line, varName)) {
                continue;
            }
            // If variable is not declared, report an error
            if (!declaredVariables.has(varName)) {
                const charIndex = match.index;
                const diagnostic = {
                    severity: node_1.DiagnosticSeverity.Error,
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
// Helper function to identify method calls or properties in object chains
function isMethodOrPropertyInChain(line, varName) {
    // This regex looks for method/property chains like g_Game.GetWorkspace().CreateWidgets() or g_Game.someProperty
    // We specifically look for function calls like CreateWidgets()
    const methodOrPropertyPattern = new RegExp(`\\b(\\w+\\.)*${varName}\\s*\\(`);
    return methodOrPropertyPattern.test(line);
}
// Helper function to identify constants
function isConstant(varName) {
    // Match numbers, booleans, etc.
    return !isNaN(Number(varName)) || ['true', 'false'].includes(varName) || ['g_Game', 'g_ARGame'].includes(varName);
}
// Helper function to remove string literals from the line
function removeStringLiterals(line) {
    // Replace anything inside double quotes with empty space
    return line.replace(/"[^"]*"/g, '');
}
// Helper function to ignore enum accesses like EntityEvent.INIT
function isEnumAccess(line, varName) {
    // Check if the variable is part of an enum access (EntityEvent.INIT)
    const enumPattern = new RegExp(`\\b\\w+\\.\\b${varName}\\b`);
    return enumPattern.test(line) || isKnownEnum(varName);
}
function isKnownEnum(varName) {
    return enumsData.includes(varName);
}
// Helper functions to identify keywords and types
function isKeywordOrClass(word) {
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
function isType(word) {
    const types = ['int', 'float', 'string', 'bool', 'vector', 'void'];
    return types.includes(word);
}
// Listen to documents and start the server
documents.listen(connection);
connection.listen();
//# sourceMappingURL=server.js.map