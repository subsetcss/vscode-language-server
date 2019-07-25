# SubsetCSS VSCode Autocomplete

Adds custom VSCode autocomplete for CSS (Sass and Less as well) autocomplete by specifying a subset of values/variables.


## Functionality

This Language Server works for CSS, Sass, and Less files. It has the following language features:
- Completions

It also includes an End-to-End test.

## Structure

```
.
├── client // Language Client
│   ├── src
│   │   ├── test // End to End tests for Language Client / Server
│   │   └── extension.ts // Language Client entry point
├── package.json // The extension manifest.
└── server // Language Server
    └── src
        └── server.ts // Language Server entry point
```

## Running 

- Run `npm install` in this folder. This installs all necessary npm modules in both the client and server folder
- Open VS Code on this folder.
- Press Ctrl+Shift+B to compile the client and server.
- Switch to the Debug viewlet.
- Select `Launch Client` from the drop down.
- Run the launch config.
- If you want to debug the server as well use the launch configuration `Attach to Server`
- In the [Extension Development Host] instance of VSCode, open a CSS, Sass or Less file to try out auto completion.

See https://code.visualstudio.com/api/language-extensions/language-server-extension-guide for details