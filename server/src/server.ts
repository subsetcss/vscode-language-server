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
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	InitializedParams
} from 'vscode-languageserver';
import * as path from 'path';
import { URI } from 'vscode-uri';
import postcss from 'postcss';
import { parser } from '@subsetcss/parser';


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

connection.onInitialize(async (params: InitializeParams) => {
	// Initially load the config
	let settings = await getDocumentSettings();
	if (params.rootPath) {
		subsetConfig = require(path.join(params.rootPath, settings.configPath));
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

async function getDocumentSettings(): Promise<Settings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}

	return connection.workspace.getConfiguration({
		section: 'subsetcss'
	});
}


connection.onDidChangeWatchedFiles(async _change => {
	// Monitored files have change in VSCode
	try {
		let document = _change.changes[0];
		
		// bust require cache
		try {
			let settings = await getDocumentSettings();
			if (document.uri.includes(settings.configPath)) {
				let cacheKey = Object.keys(require.cache).find(key => {
					return key.includes(settings.configPath);
				});

				if (cacheKey) {
					console.log(`Clearing require cache for '${ cacheKey }`);
					delete require.cache[cacheKey];
				}
			}
		} catch(e) {
			// noop
		}
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
			let result: {
				config: string[],
				decl: postcss.Declaration
			};

			try {
				result = (await parser(subsetConfig, text, lineNumber) as typeof result);
				if (result) {
					return getPropConfig(result.config, result.decl.prop);
				}
			} catch(e) {
				// Simple fallback
				let trimmed = line.trim();
				let split = trimmed.includes(':') ? trimmed.split(':')[0] : trimmed;
				let value = split.trim();
				let config = subsetConfig.subsets[value];

				if (config) {
					return getPropConfig(config, value);
				}

				return [];
			}
		}

		return [];
	}
);

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

function getPropConfig(config: string[], prop: string) {
	return config.map((label: string, index: number) => {
		return {
			label,
			kind: prop.includes('color') ? CompletionItemKind.Color : CompletionItemKind.Value,
			data: index,
			sortText: '0' + index
		};
	})
}