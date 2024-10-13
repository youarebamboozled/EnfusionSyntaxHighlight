import { Diagnostic, DiagnosticSeverity, TextDocumentChangeEvent } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkMissingSemicolons, checkUndeclaredVariables, checkUnmatchedBrackets, checkUnusedVariables } from './utils';

export async function handleDiagnostics(change: TextDocumentChangeEvent<TextDocument>, connection: any): Promise<void> {
  const diagnostics: Diagnostic[] = [];

  diagnostics.push(...checkMissingSemicolons(change));
  diagnostics.push(...checkUnmatchedBrackets(change));
  diagnostics.push(...checkUnusedVariables(change));
  diagnostics.push(...checkUndeclaredVariables(change));

  connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
}
