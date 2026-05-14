import * as vscode from 'vscode';
import * as path from 'path';

export class CudaConverterViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'cudaConverterPanel';
	private webviewView?: vscode.WebviewView;

	constructor(private readonly context: vscode.ExtensionContext) {}

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
			console.log('📨 Extension received message:', message);
		});
	}

	private getWebviewContent(webview: vscode.Webview): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>CUDA Converter Chat</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		:root {
			--vscode-foreground: #e0e0e0;
			--vscode-background: #1e1e1e;
			--vscode-activityBar-background: #333333;
			--vscode-sideBar-background: #252526;
			--accent-blue: #007acc;
			--accent-green: #13a10e;
			--accent-yellow: #e5e510;
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

		#status-badge {
			display: flex;
			align-items: center;
			gap: 6px;
			font-size: 11px;
			padding: 4px 8px;
			border-radius: 4px;
			background-color: rgba(255, 255, 255, 0.05);
			border: 1px solid rgba(255, 255, 255, 0.1);
		}

		.status-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			animation: pulse 2s infinite;
		}

		.status-dot.connected {
			background-color: var(--accent-green);
			animation: none;
		}

		.status-dot.connecting {
			background-color: var(--accent-yellow);
		}

		.status-dot.disconnected {
			background-color: var(--accent-red);
			animation: none;
		}

		@keyframes pulse {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.5; }
		}

		#new-chat-btn {
			background: transparent;
			border: 1px solid #3e3e42;
			color: var(--vscode-foreground);
			padding: 6px 12px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 11px;
			font-weight: 500;
			transition: all 0.2s;
		}

		#new-chat-btn:hover:not(:disabled) {
			background-color: rgba(255, 255, 255, 0.1);
			border-color: var(--accent-blue);
		}

		#new-chat-btn:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		#messages {
			flex: 1;
			overflow-y: auto;
			padding: 12px 16px;
			display: flex;
			flex-direction: column;
			gap: 12px;
		}

		.message {
			display: flex;
			gap: 8px;
			animation: slideIn 0.3s ease-out;
		}

		@keyframes slideIn {
			from {
				opacity: 0;
				transform: translateY(10px);
			}
			to {
				opacity: 1;
				transform: translateY(0);
			}
		}

		.message.user {
			justify-content: flex-end;
		}

		.message.assistant {
			justify-content: flex-start;
		}

		.message-content {
			max-width: 85%;
			padding: 10px 12px;
			border-radius: 8px;
			word-wrap: break-word;
			white-space: pre-wrap;
		}

		.message.user .message-content {
			background-color: var(--accent-blue);
			color: white;
			border-bottom-right-radius: 2px;
		}

		.message.assistant .message-content {
			background-color: rgba(255, 255, 255, 0.05);
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-bottom-left-radius: 2px;
		}

		.message.system .message-content {
			background-color: rgba(57, 173, 181, 0.15);
			border: 1px solid rgba(57, 173, 181, 0.3);
			color: #39adb5;
			font-size: 12px;
		}

		.message.progress .message-content {
			background-color: rgba(229, 229, 16, 0.1);
			border: 1px solid rgba(229, 229, 16, 0.3);
			color: #e5e510;
			font-size: 12px;
		}

		.message.error .message-content {
			background-color: rgba(241, 76, 76, 0.15);
			border: 1px solid rgba(241, 76, 76, 0.3);
			color: #f14c4c;
			font-size: 12px;
		}

		code-block {
			display: block;
			background-color: rgba(0, 0, 0, 0.3);
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 6px;
			overflow-x: auto;
			margin: 8px 0;
			padding: 0;
		}

		code-block-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 8px 12px;
			background-color: rgba(0, 0, 0, 0.5);
			border-bottom: 1px solid rgba(255, 255, 255, 0.1);
			font-size: 11px;
			color: rgba(255, 255, 255, 0.6);
		}

		code-block-content {
			display: block;
			padding: 12px;
			font-family: 'Courier New', Courier, monospace;
			font-size: 12px;
			line-height: 1.4;
			overflow-x: auto;
			color: #d4d4d4;
		}

		copy-button {
			background: transparent;
			border: 1px solid rgba(255, 255, 255, 0.2);
			color: rgba(255, 255, 255, 0.7);
			padding: 4px 8px;
			border-radius: 3px;
			cursor: pointer;
			font-size: 10px;
			transition: all 0.2s;
		}

		copy-button:hover {
			background-color: rgba(0, 122, 204, 0.2);
			border-color: var(--accent-blue);
			color: var(--accent-blue);
		}

		#input-container {
			padding: 12px 16px;
			border-top: 1px solid #3e3e42;
			background-color: rgba(0, 0, 0, 0.2);
			flex-shrink: 0;
		}

		#input-wrapper {
			display: flex;
			gap: 8px;
			align-items: flex-end;
		}

		#c-code-input {
			flex: 1;
			background-color: rgba(255, 255, 255, 0.05);
			border: 1px solid #3e3e42;
			color: var(--vscode-foreground);
			padding: 10px 12px;
			border-radius: 4px;
			font-family: 'Courier New', Courier, monospace;
			font-size: 12px;
			resize: none;
			max-height: 120px;
			min-height: 40px;
			transition: all 0.2s;
		}

		#c-code-input:focus {
			outline: none;
			border-color: var(--accent-blue);
			background-color: rgba(255, 255, 255, 0.08);
		}

		#c-code-input:disabled {
			background-color: rgba(255, 255, 255, 0.02);
			opacity: 0.6;
			cursor: not-allowed;
		}

		#convert-btn {
			background-color: var(--accent-blue);
			color: white;
			border: none;
			padding: 8px 16px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
			font-weight: 500;
			transition: all 0.2s;
			white-space: nowrap;
			height: 36px;
		}

		#convert-btn:hover:not(:disabled) {
			background-color: #1084d7;
			box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.3);
		}

		#convert-btn:disabled {
			background-color: rgba(0, 122, 204, 0.4);
			cursor: not-allowed;
		}

		#convert-btn:active:not(:disabled) {
			transform: scale(0.98);
		}

		.spinner {
			display: inline-block;
			width: 12px;
			height: 12px;
			border: 2px solid rgba(255, 255, 255, 0.3);
			border-top: 2px solid white;
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
			margin-right: 6px;
		}

		@keyframes spin {
			to { transform: rotate(360deg); }
		}

		.timestamp {
			font-size: 11px;
			color: rgba(255, 255, 255, 0.4);
			margin-top: 4px;
		}

		/* Scrollbar styling */
		::-webkit-scrollbar {
			width: 8px;
		}

		::-webkit-scrollbar-track {
			background: transparent;
		}

		::-webkit-scrollbar-thumb {
			background: rgba(255, 255, 255, 0.2);
			border-radius: 4px;
		}

		::-webkit-scrollbar-thumb:hover {
			background: rgba(255, 255, 255, 0.3);
		}

		.empty-state {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			height: 100%;
			color: rgba(255, 255, 255, 0.4);
			text-align: center;
			padding: 20px;
		}

		.empty-state-icon {
			font-size: 32px;
			margin-bottom: 8px;
		}

		.empty-state-text {
			font-size: 12px;
			line-height: 1.6;
		}

		metrics-panel {
			background-color: rgba(57, 173, 181, 0.1);
			border: 1px solid rgba(57, 173, 181, 0.3);
			border-radius: 4px;
			padding: 8px 12px;
			margin-top: 8px;
			font-size: 11px;
			line-height: 1.6;
		}

		metrics-item {
			display: flex;
			justify-content: space-between;
			margin: 4px 0;
		}

		metrics-label {
			color: rgba(255, 255, 255, 0.6);
		}

		metrics-value {
			color: var(--accent-green);
			font-weight: 500;
			font-family: 'Courier New', Courier, monospace;
		}
	</style>
</head>
<body>
	<div id="chat-container">
		<div id="top-bar">
			<div id="title">CUDA Converter</div>
			<div style="display: flex; gap: 8px; align-items: center;">
				<div id="status-badge">
					<div class="status-dot disconnected"></div>
					<span id="status-text">Disconnected</span>
				</div>
				<button id="new-chat-btn" disabled>New Chat</button>
			</div>
		</div>

		<div id="messages">
			<div class="empty-state">
				<div class="empty-state-icon">🚀</div>
				<div class="empty-state-text">
					<strong>CUDA Converter</strong><br>
					Paste your C code below to convert it to optimized CUDA
				</div>
			</div>
		</div>

		<div id="input-container">
			<div id="input-wrapper">
				<textarea
					id="c-code-input"
					placeholder="Paste your C code here..."
					rows="3"
				></textarea>
				<button id="convert-btn" disabled>Convert</button>
			</div>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		// UI Elements
		const messagesDiv = document.getElementById('messages');
		const input = document.getElementById('c-code-input');
		const convertBtn = document.getElementById('convert-btn');
		const newChatBtn = document.getElementById('new-chat-btn');
		const statusText = document.getElementById('status-text');
		const statusDot = document.querySelector('.status-dot');

		// State
		let ws = null;
		let isConnected = false;
		let isProcessing = false;
		let canSendMessage = true;

		// WebSocket Connection
		function connectWebSocket() {
			try {
				console.log('🔌 Attempting to connect to WebSocket...');
				ws = new WebSocket('ws://localhost:8000/c_to_cuda');

				ws.onopen = () => {
					console.log('✅ WebSocket connected');
					isConnected = true;
					updateStatus('Connected', 'connected');
					convertBtn.disabled = !input.value.trim();
				};

				ws.onmessage = (event) => {
					console.log('📨 WebSocket message received:', event.data);
					const data = JSON.parse(event.data);
					handleWebSocketMessage(data);
				};

				ws.onerror = (error) => {
					console.error('❌ WebSocket error:', error);
					updateStatus('Error', 'disconnected');
					addSystemMessage('Connection error. Is the backend running?', 'error');
				};

				ws.onclose = () => {
					console.log('⚠️ WebSocket disconnected');
					isConnected = false;
					updateStatus('Disconnected', 'disconnected');
					convertBtn.disabled = true;
				};
			} catch (error) {
				console.error('❌ Failed to create WebSocket:', error);
				updateStatus('Disconnected', 'disconnected');
				addSystemMessage('Failed to create WebSocket connection', 'error');
			}
		}

		function updateStatus(text, status) {
			statusText.textContent = text;
			statusDot.className = 'status-dot ' + status;
		}

		function handleWebSocketMessage(data) {
			const { action, payload } = data;

			switch (action) {
				case 'gprof_profiling':
					addSystemMessage(
						\`⏱️ C Code Profiling Complete\n\nExecution Time: \${payload.c_time_str}\`,
						'progress'
					);
					break;

				case 'mcprof_profiling':
					addSystemMessage('💾 Memory Profiling Complete', 'progress');
					break;

				case 'prompt_generation':
					addSystemMessage(
						\`📝 Generated \${payload.prompts.length} optimization prompts\`,
						'progress'
					);
					break;

				case 'cuda_generation_chunk':
					if (payload.cuda_code) {
						addAssistantMessage(
							\`Generated CUDA Code (Prompt \${payload.prompt_id})\`,
							payload.cuda_code
						);
					} else {
						addSystemMessage(
							\`❌ Failed to generate code for Prompt \${payload.prompt_id}\`,
							'error'
						);
					}
					break;

				case 'cuda_compilation_chunk':
					const compilable = payload.compilable;
					addSystemMessage(
						compilable
							? \`✅ CUDA Code \${payload.prompt_id} compiled successfully\`
							: \`❌ CUDA Code \${payload.prompt_id} failed to compile\`,
						compilable ? 'progress' : 'error'
					);
					break;

				case 'cuda_execution_chunk':
					if (payload.executable) {
						let metrics = \`⚡ CUDA Code \${payload.prompt_id} executed\n\`;
						metrics += \`Execution Time: \${payload.cuda_time_str}\`;

						if (payload.metrics && Object.keys(payload.metrics).length > 0) {
							metrics += createMetricsPanel(payload.metrics);
						}

						addSystemMessage(metrics, 'progress');
					} else {
						addSystemMessage(
							\`❌ CUDA Code \${payload.prompt_id} execution failed\`,
							'error'
						);
					}
					break;

				case 'final_result':
					isProcessing = false;
					updateStatus('Connected', 'connected');
					
					let resultMsg = \`🎉 Best CUDA Code Selected\n\`;
					if (payload.cuda_time && payload.cuda_time !== Infinity) {
						resultMsg += \`Execution Time: \${formatTime(payload.cuda_time)}\`;
					}

					addSystemMessage(resultMsg, 'progress');

					if (payload.cuda_code) {
						addAssistantMessage('Final Optimized CUDA Code', payload.cuda_code);
					}

					if (payload.performance_metrics) {
						addSystemMessage(
							createPerformancePanel(payload.performance_metrics),
							'progress'
						);
					}

					// Re-enable UI
					input.disabled = false;
					input.value = '';
					canSendMessage = true;
					updateConvertButtonState();
					break;

				case 'error':
					isProcessing = false;
					updateStatus('Connected', 'connected');
					addSystemMessage('❌ Error: ' + payload, 'error');
					input.disabled = false;
					canSendMessage = true;
					updateConvertButtonState();
					break;

				default:
					console.log('Unknown action:', action);
			}

			// Auto-scroll to bottom
			setTimeout(() => {
				messagesDiv.scrollTop = messagesDiv.scrollHeight;
			}, 100);
		}

		function addUserMessage(text) {
			const msgDiv = document.createElement('div');
			msgDiv.className = 'message user';

			const contentDiv = document.createElement('div');
			contentDiv.className = 'message-content';
			contentDiv.textContent = text;

			msgDiv.appendChild(contentDiv);
			messagesDiv.appendChild(msgDiv);
		}

		function addAssistantMessage(title, code) {
			const msgDiv = document.createElement('div');
			msgDiv.className = 'message assistant';

			const contentDiv = document.createElement('div');
			contentDiv.className = 'message-content';
			contentDiv.style.padding = '0';
			contentDiv.innerHTML = \`
				<div style="padding: 10px 12px;">
					<strong>\${title}</strong>
				</div>
			\`;

			const codeBlock = document.createElement('code-block');
			const header = document.createElement('code-block-header');
			header.textContent = 'CUDA Code';

			const copyBtn = document.createElement('copy-button');
			copyBtn.textContent = 'Copy';
			copyBtn.onclick = (e) => {
				e.stopPropagation();
				navigator.clipboard.writeText(code).then(() => {
					const original = copyBtn.textContent;
					copyBtn.textContent = '✓ Copied';
					setTimeout(() => copyBtn.textContent = original, 2000);
				});
			};

			header.appendChild(copyBtn);
			codeBlock.appendChild(header);

			const codeContent = document.createElement('code-block-content');
			codeContent.textContent = code;
			codeBlock.appendChild(codeContent);

			contentDiv.appendChild(codeBlock);
			msgDiv.appendChild(contentDiv);
			messagesDiv.appendChild(msgDiv);
		}

		function addSystemMessage(text, type = 'system') {
			const msgDiv = document.createElement('div');
			msgDiv.className = 'message ' + type;

			const contentDiv = document.createElement('div');
			contentDiv.className = 'message-content';
			contentDiv.textContent = text;

			msgDiv.appendChild(contentDiv);
			messagesDiv.appendChild(msgDiv);
		}

		function createMetricsPanel(metrics) {
			let html = '\n';
			if (metrics.runs && Array.isArray(metrics.runs)) {
				html += '📊 Performance Runs: ' + metrics.runs.join(', ') + 'ms\n';
			}
			return html;
		}

		function createPerformancePanel(metrics) {
			let html = '📊 Performance Summary:\n';
			if (metrics.timers) {
				html += 'Candidate Times: ' + metrics.timers.map(t => t >= 0 ? t.toFixed(2) + 'ms' : 'N/A').join(', ') + '\n';
			}
			return html;
		}

		function formatTime(ms) {
			if (ms >= 1000) {
				return (ms / 1000).toFixed(3) + 's';
			}
			return ms.toFixed(3) + 'ms';
		}

		function updateConvertButtonState() {
			const hasText = input.value.trim().length > 0;
			convertBtn.disabled = !hasText || !isConnected || isProcessing || !canSendMessage;
		}

		// Event Listeners
		input.addEventListener('input', updateConvertButtonState);

		convertBtn.addEventListener('click', async () => {
			const code = input.value.trim();
			if (!code || !isConnected || isProcessing || !canSendMessage) return;

			// Clear empty state
			if (messagesDiv.querySelector('.empty-state')) {
				messagesDiv.innerHTML = '';
			}

			// Disable input and show user message
			addUserMessage(code);
			isProcessing = true;
			canSendMessage = false;
			input.disabled = true;
			updateConvertButtonState();

			updateStatus('Processing', 'connecting');

			// Send message via WebSocket
			try {
				ws.send(JSON.stringify({ c_code: code }));
				console.log('📤 Sent C code to backend');
			} catch (error) {
				console.error('❌ Failed to send message:', error);
				addSystemMessage('Failed to send code to backend', 'error');
				isProcessing = false;
				canSendMessage = true;
				input.disabled = false;
				updateConvertButtonState();
			}
		});

		newChatBtn.addEventListener('click', () => {
			// Clear messages and reset UI
			messagesDiv.innerHTML = \`
				<div class="empty-state">
					<div class="empty-state-icon">🚀</div>
					<div class="empty-state-text">
						<strong>CUDA Converter</strong><br>
						Paste your C code below to convert it to optimized CUDA
					</div>
				</div>
			\`;

			input.value = '';
			input.disabled = false;
			isProcessing = false;
			canSendMessage = true;
			updateConvertButtonState();
			newChatBtn.disabled = true;
			input.focus();
		});

		// Initialize
		connectWebSocket();

		// Attempt to reconnect on WebSocket close
		setInterval(() => {
			if (!isConnected && (ws === null || ws.readyState === WebSocket.CLOSED)) {
				console.log('🔄 Attempting to reconnect...');
				connectWebSocket();
			}
		}, 5000);
	</script>
</body>
</html>
`;
	}
}
