import {
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
} from "vscode-languageserver/node";
import { ClassInfo } from "./data";

export function handleCompletion(
  params: TextDocumentPositionParams,
  enforceClasses: ClassInfo[],
  userDefinedClasses: ClassInfo[]
): CompletionItem[] {
  const completions: CompletionItem[] = [];

  const allClasses = [...enforceClasses, ...userDefinedClasses];

  allClasses.forEach((cls) => {
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

export function handleCompletionResolve(item: CompletionItem): CompletionItem {
  item.detail = `Details for ${item.label}`;
  item.documentation = `Documentation for ${item.label}`;
  return item;
}
