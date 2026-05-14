import * as vscode from 'vscode';
import { CudaConverterViewProvider } from './providers/CudaConverterViewProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('✅ Acceletron CUDA Converter Extension activated');

	// Register the webview view provider for the sidebar
	const provider = new CudaConverterViewProvider(context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('cudaConverterPanel', provider)
	);

	// Register the command to open the CUDA converter
	const disposable = vscode.commands.registerCommand('acceletron-extension.openCudaConverter', () => {
		vscode.commands.executeCommand('cudaConverterPanel.focus');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {
	console.log('Acceletron CUDA Converter Extension deactivated');
}

