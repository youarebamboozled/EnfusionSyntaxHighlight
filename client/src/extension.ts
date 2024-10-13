import * as vscode from "vscode";
import * as path from "path";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext) {
  const serverModule = context.asAbsolutePath(
    path.join("server", "out", "server.js")
  );

  const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "enforce" }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/.clientrc"),
    }
  };

  client = new LanguageClient(
    "enforceLanguageServer",
    "Enforce Language Server",
    serverOptions,
    clientOptions
  );

  try {
    client.start();
    console.log("Language client started successfully.");
  } catch (error) {
    console.error("Failed to start language client:", error);
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    console.warn("Language client is not initialized, nothing to stop.");
    return undefined;
  }

  try {
    console.log("Stopping language client...");
    return client.stop();
  } catch (error) {
    console.error("Error stopping language client:", error);
    return undefined;
  }
}
