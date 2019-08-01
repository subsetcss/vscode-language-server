/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import {
	Position,
	Range,
	createConnection,
	TextDocuments,
	TextDocument,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	InitializedParams
} from 'vscode-languageserver';
import * as postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import * as path from 'path';
import { URI } from 'vscode-uri';

let subsetConfig: SubsetConfig;

interface SubsetConfig {
	subsets: Subsets,
	['@media']?: AtMediaConfig[]
	[key: string]: any;
}

interface Subsets {
	[key: string]: string[]
}
interface AtMediaConfig {
	params?: {
		'max-width'?: string[]
	}
	subsets: Subsets;
}


// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
	// Initially load the config
	// TODO: get the path from the stylelintrc config
	if (params.rootPath) {
		subsetConfig = require(path.join(params.rootPath, '.subsetcss.js'));
	}
	let capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we will fall back using global settings
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
			// Tell the client that the server supports code completion
			completionProvider: {
				resolveProvider: true
			}
		}
	};
});

connection.onInitialized((_params: InitializedParams) => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
interface Settings {
	configPath: string;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: Settings = { configPath: '.subsetcss.js' };
let globalSettings: Settings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<Settings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <Settings>(
			(change.settings.subsetcss || defaultSettings)
		);
	}

	// Revalidate all open text documents
	documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<Settings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'subsetcss'
		});
		debugger;
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	// validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	// In this simple example we get the settings for every validate run.
	let _settings = await getDocumentSettings(textDocument.uri);

	// // The validator creates diagnostics for all uppercase words length 2 and more
	// let text = textDocument.getText();
	// let pattern = /\b[A-Z]{2,}\b/g;
	// let m: RegExpExecArray | null;

	// let problems = 0;
	// let diagnostics: Diagnostic[] = [];
	// while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
	// 	problems++;
	// 	let diagnostic: Diagnostic = {
	// 		severity: DiagnosticSeverity.Warning,
	// 		range: {
	// 			start: textDocument.positionAt(m.index),
	// 			end: textDocument.positionAt(m.index + m[0].length)
	// 		},
	// 		message: `${m[0]} is all uppercase.`,
	// 		source: 'ex'
	// 	};
	// 	if (hasDiagnosticRelatedInformationCapability) {
	// 		diagnostic.relatedInformation = [
	// 			{
	// 				location: {
	// 					uri: textDocument.uri,
	// 					range: Object.assign({}, diagnostic.range)
	// 				},
	// 				message: 'Spelling matters'
	// 			},
	// 			{
	// 				location: {
	// 					uri: textDocument.uri,
	// 					range: Object.assign({}, diagnostic.range)
	// 				},
	// 				message: 'Particularly for names'
	// 			}
	// 		];
	// 	}
	// 	diagnostics.push(diagnostic);
	// }

	// // Send the computed diagnostics to VSCode.
	// connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(async _change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
	try {
		let document = _change.changes[0];
		let p = uriToPath(document.uri);
		if (p) {
			subsetConfig = require(p);
		}
	} catch(e) {
		debugger;
	}
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	async (_textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
		const document = documents.get(_textDocumentPosition.textDocument.uri);

		if (document) {
			let lineNumber = _textDocumentPosition.position.line;
			let line = getLine(document, lineNumber);

			if (!line) {
				return [];
			}

			let text = document.getText();
			let parsed = postcss.parse(text);
		
			let result = await new Promise((resolve) => {
				parsed.walkRules((node) => {
					if (!node.source) {
						return;
					}

					let startLine = node.source.start && node.source.start.line;
					let endLine = node.source.end && node.source.end.line;

					if (!startLine || !endLine) {
						return;
					}

					if (lineNumber >= startLine && lineNumber <= endLine) {
						node.walkDecls(decl => {
							let rootConfig = getSubsetConfig(decl);
							// TODO: make a func to handle configs, since they need matching
							let config = rootConfig ? rootConfig.subsets[decl.prop] : [];

							if (config) {
								resolve(config.map((label: string, index: number) => {
									return {
										label,
										kind: decl.prop.includes('color') ? CompletionItemKind.Color : CompletionItemKind.Value,
										data: 0,
										sortText: '0' + index
									};
								}));
							}
						});
					}
				});
			});

			return result as CompletionItem[];

			// let trimmed = line.trim();
			// let split = trimmed.includes(':') ? trimmed.split(':')[0] : trimmed;
			// let value = split.trim();
			// let config = subsetConfig.subsets[value];

			// if (config) {
			// 	return config.map((label: string, index: number) => {
			// 		return {
			// 			label,
			// 			kind: value.includes('color') ? CompletionItemKind.Color : CompletionItemKind.Value,
			// 			data: 0,
			// 			sortText: '0' + index
			// 		};
			// 	})
			// }
		}

		return [];
	}
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.data === 1) {
			item.detail = 'TypeScript details';
			item.documentation = 'TypeScript documentation';
		} else if (item.data === 2) {
			item.detail = 'JavaScript details';
			item.documentation = 'JavaScript documentation';
		}
		return item;
	}
);

/*
connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.text the initial full content of the document.
	connection.console.log(`${params.textDocument.uri} opened.`);
});
connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});
connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.uri uniquely identifies the document.
	connection.console.log(`${params.textDocument.uri} closed.`);
});
*/

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

function uriToPath(stringUri: string): string | undefined {
	const uri = URI.parse(stringUri);
	if (uri.scheme !== 'file') {
			return undefined;
	}
	return uri.fsPath;
}

function getLine(doc: TextDocument, line: number): string {
	const lineRange = getLineRange(doc, line);
	return doc.getText(lineRange);
}

function getLineRange(doc: TextDocument, line: number): Range {
	const lineStart = getLineStart(line);
	const lineEnd = getLineEnd(doc, line);
	return Range.create(lineStart, lineEnd);
}

function getLineEnd(doc: TextDocument, line: number): Position {
	const nextLineOffset = getLineOffset(doc, line + 1);
	return doc.positionAt(nextLineOffset - 1);
}

function getLineOffset(doc: TextDocument, line: number): number {
	const lineStart = getLineStart(line);
	return doc.offsetAt(lineStart);
}

function getLineStart(line: number): Position {
	return Position.create(line, 0);
}

function getSubsetConfig(decl: postcss.Declaration) {
	let grandParent = decl.parent.parent;
	if (!grandParent || grandParent.type !== 'atrule') {
		return subsetConfig;
	}
	let inAtRule = grandParent && grandParent.type === 'atrule';
	let rootConfig = grandParent && inAtRule ? subsetConfig[`@${grandParent.name}`] : subsetConfig;

	if (!Array.isArray(rootConfig)) {
		return subsetConfig;
	}

	let { nodes } = valueParser(grandParent.params);
        
	if (nodes.length) {
		let words: string[] = [];
		nodes[0].nodes.forEach((node: ValueParserNode) => {
			if (node.type === 'word') {
				words.push(node.value);
			}
		});

		if (words.length === 2) {
			let [prop, value] = words;

			let config = rootConfig.find(conf => {
				let param = conf.params[prop];

				return param && param.includes(value);
			});

			return config || subsetConfig;
		}
	}

}

interface ValueParserNode {
  type: string;
  value: string;
}