import { getWebviewContent } from 'src/preview/web-view';
import * as vscode from 'vscode';


import * as openscad from '@bascanada/openscad-compiler';
import { once } from 'events';

export function previewPanelCommand(mode: openscad.EngineType, context: vscode.ExtensionContext,) {
    return (uri: vscode.Uri) => {
        const panel = vscode.window.createWebviewPanel(
            'myWebApp',
            'My Web App',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                // Restrict the webview to only loading files from the dist folder
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@bascanada', 'cad-viewer', 'dist')],
            }
        );

        let currentStlPayload = '';
        let wasPanelVisible = panel.visible;

        // Set the webview's HTML content
        panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

        // Fix with real path from config
        const executablePath = "/opt/homebrew/bin/openscad"

        const compiler = new openscad.Compiler({ engine: mode, nativePath: executablePath });

        const compileAndPost = (text: string) => {
            const emitter = compiler.compile(text);

            emitter.on('stderr', console.log);
            emitter.on('stdout', console.log);

            once(emitter, 'done').then((data: Buffer[]) => {
                const payload = data[0];
                currentStlPayload = payload.toString();
                panel.webview.postMessage({
                    stlData: currentStlPayload
                });
            }).catch((error: Error) => {
                console.log(error);
            })
        };

        vscode.workspace.fs.readFile(uri).then(content => {
            compileAndPost(new TextDecoder().decode(content));
        });

        const onDidChangeViewStateDisposable = panel.onDidChangeViewState(e => {
            const isPanelNowVisible = e.webviewPanel.visible;

            // Only post the message if the panel just became visible
            if (isPanelNowVisible && !wasPanelVisible) {
                if (currentStlPayload) {
                    panel.webview.postMessage({ stlData: currentStlPayload });
                }
            }

            // Update the visibility state for the next event
            wasPanelVisible = isPanelNowVisible; 
        });


        // ✨ Listen for file save events in the workspace
        const onDidSaveDocumentDisposable = vscode.workspace.onDidSaveTextDocument(document => {
            // Ensure the webview panel is still active and visible and it's the correct file
            if (panel.visible && document.uri.toString() === uri.toString()) {
                compileAndPost(document.getText());
            }
        });

        // Clean up the event listener when the panel is closed
        panel.onDidDispose(() => {
            onDidSaveDocumentDisposable.dispose();
            onDidChangeViewStateDisposable.dispose();
        }, null, context.subscriptions);
    }
}