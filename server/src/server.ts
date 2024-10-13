import { createConnection, TextDocuments, InitializeResult, TextDocumentSyncKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClassInfo, loadClassData } from './data';
import { handleCompletion, handleCompletionResolve } from './completion';
import { handleDiagnostics } from './diagnostics';
import { scanUserDefinedClasses } from './utils';
import { URI } from 'vscode-uri';

const connection = createConnection();
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

export let userDefinedClasses: ClassInfo[];
const enforceClasses = loadClassData();
export const enforceClassNames = enforceClasses.map((cls) => cls.class_name);
let workspaceFolder: string | undefined;

let diagnosticsEnabled = false;

connection.onInitialize((params): InitializeResult => {  
  if (params.rootUri) {
    const uri = URI.parse(params.rootUri);
    workspaceFolder = uri.fsPath;
  } else {
    workspaceFolder = undefined;
  }

  if (workspaceFolder) {
    console.log('Workspace folder:', workspaceFolder);
    userDefinedClasses = scanUserDefinedClasses(workspaceFolder);
  }
  
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { resolveProvider: true },
    },
  };
});

connection.onCompletion((params) => handleCompletion(params, enforceClasses, userDefinedClasses));
connection.onCompletionResolve((item) => handleCompletionResolve(item));

documents.onDidChangeContent(async (change) => {
  if (diagnosticsEnabled) {
    if (workspaceFolder) {
      userDefinedClasses = scanUserDefinedClasses(workspaceFolder);
    }
  
    handleDiagnostics(change, connection);
  } 
});

documents.listen(connection);
connection.listen();
