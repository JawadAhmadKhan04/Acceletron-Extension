import * as vscode from 'vscode';
import { CudaConverterViewProvider } from './providers/CudaConverterViewProvider';
import { ChatbotViewProvider } from './providers/ChatbotViewProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('✅ Acceletron CUDA Converter Extension activated');

	// Register the webview view provider for the sidebar - CUDA Converter
	const cudaProvider = new CudaConverterViewProvider(context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('cudaConverterPanel', cudaProvider)
	);

	// Register the webview view provider for the sidebar - Chatbot
	const chatbotProvider = new ChatbotViewProvider(context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('chatbotPanel', chatbotProvider)
	);

	// Register the command to open the CUDA converter
	const cudaCommand = vscode.commands.registerCommand('acceletron-extension.openCudaConverter', () => {
		vscode.commands.executeCommand('cudaConverterPanel.focus');
	});

	// Register the command to open the chatbot
	const chatbotCommand = vscode.commands.registerCommand('acceletron-extension.openChatbot', () => {
		vscode.commands.executeCommand('chatbotPanel.focus');
	});

	context.subscriptions.push(cudaCommand, chatbotCommand);
}

export function deactivate() {
	console.log('Acceletron CUDA Converter Extension deactivated');
}

