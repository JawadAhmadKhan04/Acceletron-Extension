import * as vscode from 'vscode';
import WebSocket from 'ws';

export class ChatbotViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'chatbotPanel';
	private webviewView?: vscode.WebviewView;
	private websocket?: WebSocket;
	private backendUrl = 'ws://localhost:8000/c_to_cuda'; // Configure this as needed

	constructor(private readonly context: vscode.ExtensionContext) {
		this.connectToBackend();
	}

	private connectToBackend() {
		try {
			this.websocket = new WebSocket(this.backendUrl);

			this.websocket.on('open', () => {
				console.log('✅ WebSocket connected to backend');
				this.notifyWebviewStatus('connected');
			});

			this.websocket.on('message', (data: string) => {
				try {
					const message = JSON.parse(data);
					console.log('📨 Backend message:', message);
					this.handleBackendMessage(message);
				} catch (error) {
					console.error('Error parsing backend message:', error);
				}
			});

			this.websocket.on('error', (error) => {
				console.error('❌ WebSocket error:', error);
				this.notifyWebviewStatus('error');
			});

			this.websocket.on('close', () => {
				console.log('🔌 WebSocket disconnected');
				this.notifyWebviewStatus('disconnected');
				// Attempt to reconnect after 5 seconds
				setTimeout(() => this.connectToBackend(), 5000);
			});
		} catch (error) {
			console.error('Failed to connect to backend:', error);
			this.notifyWebviewStatus('error');
		}
	}

	private handleBackendMessage(message: any) {
		if (this.webviewView) {
			this.webviewView.webview.postMessage({
				type: 'backendMessage',
				data: message,
			});
		}
	}

	private notifyWebviewStatus(status: 'connected' | 'disconnected' | 'error') {
		if (this.webviewView) {
			this.webviewView.webview.postMessage({
				type: 'connectionStatus',
				status,
			});
		}
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		token: vscode.CancellationToken,
	) {
		this.webviewView = webviewView;

		// Configure the webview
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		};

		// Load the webview HTML
		webviewView.webview.html = this.getWebviewContent(webviewView.webview);

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage((message) => {
			console.log('💬 Webview sent message:', message);

			if (message.type === 'userMessage' && this.websocket?.readyState === WebSocket.OPEN) {
				// Forward user message to backend
				this.websocket.send(JSON.stringify({
					c_code: message.text,
				}));
			}
		});

		// Notify webview of current connection status
		if (this.websocket?.readyState === WebSocket.OPEN) {
			this.notifyWebviewStatus('connected');
		}
	}

	private getWebviewContent(webview: vscode.Webview): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Acceletron</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		:root {
			--vscode-foreground: #e0e0e0;
			--vscode-background: #1e1e1e;
			--accent-blue: #007acc;
			--accent-green: #13a10e;
			--accent-red: #f14c4c;
		}

		body {
			background-color: var(--vscode-background);
			color: var(--vscode-foreground);
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
			font-size: 13px;
			line-height: 1.5;
			height: 100vh;
			display: flex;
			flex-direction: column;
			overflow: hidden;
		}

		#chat-container {
			display: flex;
			flex-direction: column;
			height: 100%;
			padding: 0;
		}

		#top-bar {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 12px 16px;
			border-bottom: 1px solid #3e3e42;
			background-color: rgba(0, 0, 0, 0.2);
			flex-shrink: 0;
		}

		#title {
			font-weight: 600;
			font-size: 14px;
			letter-spacing: 0.5px;
		}

		#status-indicator {
			display: flex;
			align-items: center;
			gap: 6px;
			font-size: 11px;
			padding: 4px 8px;
			border-radius: 4px;
			background-color: rgba(255, 255, 255, 0.05);
		}

		#status-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background-color: var(--accent-red);
		}

		#status-dot.connected {
			background-color: var(--accent-green);
		}

		#messages {
			flex: 1;
			overflow-y: auto;
			padding: 16px;
			display: flex;
			flex-direction: column;
			gap: 12px;
		}

		.message {
			padding: 10px 12px;
			border-radius: 6px;
			max-width: 90%;
			word-wrap: break-word;
			font-family: 'Courier New', monospace;
			font-size: 12px;
		}

		.message.user {
			align-self: flex-end;
			background-color: var(--accent-blue);
			color: white;
		}

		.message.bot {
			align-self: flex-start;
			background-color: #3e3e42;
			color: var(--vscode-foreground);
		}

		.message.bot.info {
			font-size: 11px;
			color: #858585;
		}

		.message.bot.error {
			color: var(--accent-red);
		}

		#input-section {
			display: flex;
			gap: 8px;
			padding: 12px 16px;
			border-top: 1px solid #3e3e42;
			flex-shrink: 0;
			background-color: rgba(0, 0, 0, 0.1);
		}

		#message-input {
			flex: 1;
			padding: 8px 12px;
			border: 1px solid #3e3e42;
			border-radius: 4px;
			background-color: #252526;
			color: var(--vscode-foreground);
			font-size: 13px;
			font-family: 'Courier New', monospace;
			outline: none;
			min-height: 80px;
			resize: vertical;
		}

		#message-input:focus {
			border-color: var(--accent-blue);
		}

		#message-input:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		#send-btn {
			padding: 8px 12px;
			background-color: var(--accent-blue);
			color: white;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-weight: 500;
			transition: background-color 0.2s;
			align-self: flex-end;
		}

		#send-btn:hover:not(:disabled) {
			background-color: #005a9e;
		}

		#send-btn:active:not(:disabled) {
			background-color: #004578;
		}

		#send-btn:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		#welcome-message {
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			height: 100%;
			text-align: center;
			gap: 12px;
			padding: 24px;
			color: #858585;
		}

		#welcome-message h2 {
			color: var(--vscode-foreground);
			font-size: 16px;
			font-weight: 600;
		}

		.code-block {
			background-color: #1e1e1e;
			border: 1px solid #3e3e42;
			border-radius: 4px;
			padding: 8px;
			margin: 8px 0;
			overflow-x: auto;
		}
	</style>
</head>
<body>
	<div id="chat-container">
		<div id="top-bar">
			<div id="title">💬 Acceletron CUDA Converter</div>
			<div id="status-indicator">
				<div id="status-dot"></div>
				<span id="status-text">Disconnected</span>
			</div>
		</div>
		<div id="messages">
			<div id="welcome-message">
				<h2>Welcome to Acceletron</h2>
				<p>Paste your C code below and submit to convert it to optimized CUDA code</p>
			</div>
		</div>
		<div id="input-section">
			<textarea id="message-input" placeholder="Paste your C code here..."></textarea>
			<button id="send-btn">Convert to CUDA</button>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		const messagesContainer = document.getElementById('messages');
		const messageInput = document.getElementById('message-input');
		const sendBtn = document.getElementById('send-btn');
		const statusDot = document.getElementById('status-dot');
		const statusText = document.getElementById('status-text');
		let hasMessages = false;
		let isConnected = false;

		// Update UI based on connection status
		function updateConnectionStatus(status) {
			isConnected = status === 'connected';
			statusDot.className = isConnected ? 'connected' : '';
			statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
			messageInput.disabled = !isConnected;
			sendBtn.disabled = !isConnected;
		}

		// Display a message in the chat
		function displayMessage(type, content, className = '') {
			if (!hasMessages) {
				messagesContainer.innerHTML = '';
				hasMessages = true;
			}

			const messageEl = document.createElement('div');
			messageEl.className = \`message bot \${className}\`;

			if (typeof content === 'string') {
				messageEl.textContent = content;
			} else {
				// For JSON content, display formatted
				messageEl.innerHTML = \`<pre>\${JSON.stringify(content, null, 2)}</pre>\`;
				messageEl.style.maxWidth = '100%';
			}

			messagesContainer.appendChild(messageEl);
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}

		// Handle backend messages
		function handleBackendMessage(message) {
			const { action, payload } = message;

			switch (action) {
				case 'gprof_profiling':
					displayMessage('backend', \`⏱️ Serial Execution Time: \${payload.c_time_str}\\n\\n\${payload.time_profile}\`, 'info');
					break;
				case 'mcprof_profiling':
					displayMessage('backend', \`📊 Memory Profiling:\\n\${payload.memory_profile}\`, 'info');
					break;
				case 'prompt_generation':
					displayMessage('backend', \`✨ Generated \${payload.prompts.length} prompts for LLM\`, 'info');
					break;
				case 'cuda_generation_chunk':
					if (payload.cuda_code) {
						displayMessage('backend', \`🚀 CUDA Code Generated (Prompt \${payload.prompt_id}):\\n\${payload.cuda_code}\`);
					}
					break;
				case 'cuda_compilation_chunk':
					const compileSatus = payload.compilable ? '✅ Compiled successfully' : '❌ Compilation failed';
					displayMessage('backend', \`\${compileSatus} (Prompt \${payload.prompt_id})\`, 'info');
					break;
				case 'cuda_execution_chunk':
					if (payload.executable) {
						displayMessage('backend', \`⚡ Execution Time: \${payload.cuda_time_str} (Prompt \${payload.prompt_id})\`, 'info');
					} else {
						displayMessage('backend', \`❌ Execution failed (Prompt \${payload.prompt_id})\`, 'error');
					}
					break;
				case 'final_result':
					displayMessage('backend', \`🎉 Best CUDA Code (Time: \${payload.cuda_time}ms):\\n\${payload.cuda_code}\`);
					break;
				case 'error':
					displayMessage('backend', \`❌ Error: \${payload}\`, 'error');
					break;
				default:
					displayMessage('backend', \`Unknown action: \${action}\`);
			}
		}

		function sendMessage() {
			const message = messageInput.value.trim();
			if (!message || !isConnected) return;

			// Display user message
			const userMessageEl = document.createElement('div');
			userMessageEl.className = 'message user';
			userMessageEl.innerHTML = \`<pre>\${message}</pre>\`;
			messagesContainer.appendChild(userMessageEl);

			// Send to extension
			vscode.postMessage({ type: 'userMessage', text: message });

			// Clear input
			messageInput.value = '';
			messageInput.focus();

			// Scroll to bottom
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}

		sendBtn.addEventListener('click', sendMessage);
		messageInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter' && e.ctrlKey) {
				sendMessage();
			}
		});

		// Listen for messages from the extension
		window.addEventListener('message', (event) => {
			const { type, data, status } = event.data;

			if (type === 'connectionStatus') {
				updateConnectionStatus(status);
			} else if (type === 'backendMessage') {
				handleBackendMessage(data);
			}
		});

		// Initial status
		updateConnectionStatus('disconnected');
	</script>
</body>
</html>`;
	}
}
