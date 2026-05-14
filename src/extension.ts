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

	const showConverterCommand = vscode.commands.registerCommand('acceletron-extension.showConverter', () => {
		chatbotProvider.showConverter();
	});

	const showHistoryCommand = vscode.commands.registerCommand('acceletron-extension.showHistory', () => {
		chatbotProvider.showHistory();
	});

	context.subscriptions.push(cudaCommand, chatbotCommand, showConverterCommand, showHistoryCommand);
}

export function deactivate() {
	console.log('Acceletron CUDA Converter Extension deactivated');
}

