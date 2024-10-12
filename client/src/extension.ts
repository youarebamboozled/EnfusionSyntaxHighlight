import * as vscode from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
  const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
  const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'enforce' }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
    }
  };

  client = new LanguageClient('enforceLanguageServer', 'Enforce Language Server', serverOptions, clientOptions);
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client ? client.stop() : undefined;
}
