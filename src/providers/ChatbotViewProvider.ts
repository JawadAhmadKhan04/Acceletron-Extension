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
		console.log('🔍 [Extension] connectToBackend() method executing');
		try {
			this.websocket = new WebSocket(this.backendUrl);

			this.websocket.on('open', () => {
				this.notifyWebviewStatus('connected');
			});

			this.websocket.on('message', (data: string) => {
				try {
					const message = JSON.parse(data);
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

	public showConverter() {
		if (this.webviewView) {
			vscode.commands.executeCommand('chatbotPanel.focus');
			this.webviewView.webview.postMessage({
				type: 'showView',
				view: 'converter-view'
			});
		}
	}

	public showHistory() {
		if (this.webviewView) {
			vscode.commands.executeCommand('chatbotPanel.focus');
			this.webviewView.webview.postMessage({
				type: 'showView',
				view: 'history-view'
			});
		} else {
			console.error('❌ [Extension] Webview is undefined!');
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
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ws://localhost:8000 http://localhost:8000; img-src data: vscode-resource:; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Acceletron CUDA Converter</title>
	<style>
		* {
			margin: 0;	
			padding: 0;
			box-sizing: border-box;
		}

		:root {
			--vscode-foreground: #e0e0e0;
			--vscode-background: #1e1e1e;
			--accent-blue: #0078d4;
			--accent-green: #107c10;
			--accent-red: #f3654a;
			--accent-yellow: #ffb900;
			--surface-secondary: #252526;
			--surface-tertiary: #2d2d30;
			--border-color: #3e3e42;
		}

		body {
			background-color: var(--vscode-background);
			color: var(--vscode-foreground);
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
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
		}

		.view-content {
			display: none;
			flex: 1;
			flex-direction: column;
			overflow: hidden;
		}

		.view-content.active {
			display: flex;
		}

		#history-list {
			flex: 1;
			overflow-y: auto;
			padding: 16px;
			display: flex;
			flex-direction: column;
			gap: 12px;
		}

		#history-list::-webkit-scrollbar {
			width: 10px;
		}

		#history-list::-webkit-scrollbar-track {
			background: transparent;
		}

		#history-list::-webkit-scrollbar-thumb {
			background: var(--border-color);
			border-radius: 5px;
		}

		#history-list::-webkit-scrollbar-thumb:hover {
			background: #555;
		}

		.history-item {
			background: var(--surface-secondary);
			border: 1px solid var(--border-color);
			border-radius: 6px;
			padding: 12px;
		}

		.history-header {
			display: flex;
			justify-content: space-between;
			margin-bottom: 8px;
			font-weight: 600;
		}

		.history-code-preview {
			font-family: 'Monaco', 'Courier New', monospace;
			font-size: 11px;
			color: #aaa;
			background: #1a1a1a;
			padding: 8px;
			border-radius: 4px;
			margin-bottom: 8px;
			max-height: 100px;
			overflow-y: hidden;
			border: 1px solid var(--border-color);
		}

		#top-bar {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 14px 16px;
			border-bottom: 1px solid var(--border-color);
			background: linear-gradient(to bottom, var(--surface-tertiary), var(--surface-secondary));
			flex-shrink: 0;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		}

		#title {
			font-weight: 600;
			font-size: 14px;
			letter-spacing: 0.3px;
			display: flex;
			align-items: center;
			gap: 8px;
		}

		#status-indicator {
			display: flex;
			align-items: center;
			gap: 6px;
			font-size: 11px;
			padding: 4px 10px;
			border-radius: 12px;
			background-color: rgba(255, 255, 255, 0.08);
			border: 1px solid rgba(255, 255, 255, 0.12);
			transition: all 0.3s ease;
		}

		#status-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background-color: var(--accent-red);
			animation: pulse 2s infinite;
		}

		#status-dot.connected {
			background-color: var(--accent-green);
			animation: none;
		}

		@keyframes pulse {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.5; }
		}

		#messages {
			flex: 1;
			overflow-y: auto;
			overflow-x: hidden;
			padding: 16px;
			display: flex;
			flex-direction: column;
			gap: 12px;
		}

		#messages::-webkit-scrollbar {
			width: 10px;
		}

		#messages::-webkit-scrollbar-track {
			background: transparent;
		}

		#messages::-webkit-scrollbar-thumb {
			background: var(--border-color);
			border-radius: 5px;
		}

		#messages::-webkit-scrollbar-thumb:hover {
			background: #555;
		}

		.section {
			background: var(--surface-secondary);
			border: 1px solid var(--border-color);
			border-radius: 6px;
			overflow: hidden;
			flex-shrink: 0;
		}

		.section-header {
			padding: 12px 14px;
			background: linear-gradient(to right, var(--surface-tertiary), rgba(0, 0, 0, 0.1));
			border-bottom: 1px solid var(--border-color);
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: space-between;
			transition: background 0.2s;
			font-weight: 500;
			user-select: none;
		}

		.section-header:hover {
			background: linear-gradient(to right, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
		}

		.section-header-title {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.toggle-icon {
			display: inline-block;
			transition: transform 0.3s ease;
			color: var(--accent-blue);
		}

		.section.collapsed .toggle-icon {
			transform: rotate(-90deg);
		}

		.section-content {
			padding: 12px 14px;
			max-height: 400px;
			overflow-y: auto;
		}

		#mcprof-section .section-content {
			max-height: 800px;
		}

		.section-content::-webkit-scrollbar {
			width: 8px;
		}

		.section-content::-webkit-scrollbar-track {
			background: transparent;
		}

		.section-content::-webkit-scrollbar-thumb {
			background: var(--border-color);
			border-radius: 4px;
		}

		.section-content::-webkit-scrollbar-thumb:hover {
			background: #555;
		}

		.section.collapsed .section-content {
			display: none;
		}

		.prompt-item {
			background: var(--surface-tertiary);
			border: 1px solid var(--border-color);
			border-radius: 4px;
			padding: 10px 12px;
			margin-bottom: 8px;
			font-size: 12px;
		}

		.prompt-item:last-child {
			margin-bottom: 0;
		}

		.prompt-item-title {
			font-weight: 600;
			color: var(--accent-blue);
			margin-bottom: 6px;
		}

		.prompt-item-text {
			color: #999;
			font-family: 'Courier New', monospace;
			max-height: 200px;
			overflow-y: auto;
			word-break: break-word;
			padding: 4px;
		}

		.prompt-item-text::-webkit-scrollbar {
			width: 6px;
		}

		.prompt-item-text::-webkit-scrollbar-track {
			background: transparent;
		}

		.prompt-item-text::-webkit-scrollbar-thumb {
			background: var(--border-color);
			border-radius: 3px;
		}

		.prompt-item-text::-webkit-scrollbar-thumb:hover {
			background: #555;
		}

		.prompt-item-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			cursor: pointer;
			user-select: none;
		}

		.prompt-item-header:hover {
			color: var(--accent-blue);
		}

		.prompt-toggle {
			display: inline-block;
			transition: transform 0.3s ease;
			font-size: 10px;
		}

		.prompt-item.collapsed .prompt-toggle {
			transform: rotate(-90deg);
		}

		.prompt-item.collapsed .prompt-item-text {
			display: none;
		}

		.copy-button {
			background: transparent;
			border: 1px solid var(--accent-blue);
			color: var(--accent-blue);
			padding: 4px 8px;
			border-radius: 3px;
			cursor: pointer;
			font-size: 11px;
			transition: all 0.2s;
			white-space: nowrap;
		}

		.copy-button:hover {
			background: var(--accent-blue);
			color: white;
		}

		.copy-button.copied {
			background: var(--accent-green);
			color: white;
			border-color: var(--accent-green);
		}

		.code-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: 10px;
			padding-bottom: 8px;
			border-bottom: 1px solid var(--border-color);
		}

		.compilation-result {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 10px 12px;
			margin-bottom: 8px;
			border-radius: 4px;
			font-size: 12px;
			word-break: break-word;
		}

		.compilation-result.success {
			background: rgba(16, 124, 16, 0.15);
			border-left: 3px solid var(--accent-green);
		}

		.compilation-result.failed {
			background: rgba(243, 101, 74, 0.15);
			border-left: 3px solid var(--accent-red);
		}

		.execution-result {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 10px 12px;
			margin-bottom: 8px;
			border-radius: 4px;
			font-size: 12px;
			word-break: break-word;
		}

		.execution-result.success {
			background: rgba(16, 124, 16, 0.15);
			border-left: 3px solid var(--accent-green);
		}

		.execution-result.failed {
			background: rgba(243, 101, 74, 0.15);
			border-left: 3px solid var(--accent-red);
		}

		.code-block {
			background: #1a1a1a;
			border: 1px solid var(--border-color);
			border-radius: 4px;
			padding: 12px;
			margin: 8px 0;
			overflow-x: auto;
			overflow-y: auto;
			font-family: 'Monaco', 'Courier New', monospace;
			font-size: 11px;
			color: #d4d4d4;
			line-height: 1.4;
			max-height: 300px;
		}

		.code-block::-webkit-scrollbar {
			width: 8px;
			height: 8px;
		}

		.code-block::-webkit-scrollbar-track {
			background: transparent;
		}

		.code-block::-webkit-scrollbar-thumb {
			background: var(--border-color);
			border-radius: 4px;
		}

		.code-block::-webkit-scrollbar-thumb:hover {
			background: #555;
		}

		.code-block pre {
			margin: 0;
			white-space: pre-wrap;
			word-break: break-all;
		}

		.status-badge {
			display: inline-block;
			padding: 2px 8px;
			border-radius: 3px;
			font-size: 11px;
			font-weight: 500;
			background: rgba(255, 255, 255, 0.1);
		}

		.status-badge.success {
			background: rgba(16, 124, 16, 0.3);
			color: var(--accent-green);
		}

		.status-badge.failed {
			background: rgba(243, 101, 74, 0.3);
			color: var(--accent-red);
		}

		.status-badge.info {
			background: rgba(0, 120, 212, 0.3);
			color: var(--accent-blue);
		}

		#welcome-message {
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			height: 100%;
			text-align: center;
			gap: 16px;
			padding: 24px;
			color: #858585;
		}

		#welcome-message h2 {
			color: var(--vscode-foreground);
			font-size: 18px;
			font-weight: 600;
			margin: 0;
		}

		#welcome-message p {
			margin: 0;
			font-size: 12px;
			color: #999;
			max-width: 300px;
		}

		#input-section {
			display: flex;
			gap: 8px;
			padding: 12px 16px;
			border-top: 1px solid var(--border-color);
			flex-shrink: 0;
			background: var(--surface-secondary);
			border-top: 1px solid var(--border-color);
		}

		#message-input {
			flex: 1;
			padding: 10px 12px;
			border: 1px solid var(--border-color);
			border-radius: 4px;
			background-color: var(--surface-tertiary);
			color: var(--vscode-foreground);
			font-size: 12px;
			font-family: 'Courier New', monospace;
			outline: none;
			min-height: 60px;
			resize: vertical;
			transition: border-color 0.2s, box-shadow 0.2s;
		}

		#message-input:focus {
			border-color: var(--accent-blue);
			box-shadow: 0 0 0 2px rgba(0, 120, 212, 0.2);
		}

		#message-input:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		#message-input::placeholder {
			color: #666;
		}

		#send-btn {
			padding: 10px 16px;
			background: linear-gradient(135deg, var(--accent-blue), #005a9e);
			color: white;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-weight: 600;
			font-size: 12px;
			transition: all 0.2s;
			align-self: flex-end;
			white-space: nowrap;
		}

		#send-btn:hover:not(:disabled) {
			box-shadow: 0 4px 12px rgba(0, 120, 212, 0.4);
			transform: translateY(-1px);
		}

		#send-btn:active:not(:disabled) {
			transform: translateY(0);
		}

		#send-btn:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.icon {
			font-size: 14px;
		}

		.loading-spinner {
			display: inline-block;
			width: 4px;
			height: 4px;
			border-radius: 50%;
			background: var(--accent-blue);
			animation: blink 1.4s infinite;
		}

		@keyframes blink {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.3; }
		}
	</style>
</head>
<body>
	<div id="chat-container">
		<div id="top-bar">
			<div id="title">
				<span class="icon">⚡</span>
				<span>Acceletron CUDA Converter</span>
			</div>
			<div id="status-indicator">
				<div id="status-dot"></div>
				<span id="status-text">Disconnected</span>
			</div>
		</div>

		<div id="converter-view" class="view-content active">
			<div id="messages">
				<div id="welcome-message">
					<h2>Welcome to Acceletron</h2>
					<p>Paste your C code below and submit to convert it to optimized CUDA</p>
				</div>
			</div>
			<div id="input-section">
				<textarea id="message-input" placeholder="Paste your C code here..."></textarea>
				<button id="send-btn">Convert</button>
			</div>
		</div>

		<div id="history-view" class="view-content">
			<div id="history-list">
				<!-- History items will be injected here -->
			</div>
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
		let currentInputCode = '';
		let state = {
			prompts: [],
			compilationResults: [],
			executionResults: [],
			finalCode: null
		};

		// No longer using local state for history, we will fetch from backend

		// View switching logic
		const views = document.querySelectorAll('.view-content');

		function switchView(targetId) {
			views.forEach(v => v.classList.remove('active'));
			const target = document.getElementById(targetId);
			if (target) {
				target.classList.add('active');
			} else {
				console.error('❌ [Webview] Target element not found:', targetId);
			}
			if (targetId === 'history-view') {
				renderHistory();
			}
		}

		async function renderHistory() {
			const list = document.getElementById('history-list');
			if (!list) {
				console.error('❌ [Webview] history-list element NOT found!');
				return;
			}
			list.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Loading history...</div>';
			try {
				
				// Add timeout to fetch
				const controller = new AbortController();
				const timeoutId = setTimeout(() => {
					console.error('❌ [Webview] Fetch timeout after 10 seconds');
					controller.abort();
				}, 10000);
				
				const response = await fetch('http://localhost:8000/history/', {
					signal: controller.signal
				});
				clearTimeout(timeoutId);
				
				if (!response.ok) {
					console.error('❌ [Webview] Response not OK:', response.status, response.statusText);
					throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
				}
				
				const items = await response.json();
				
				if (items.length === 0) {
					list.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No history yet. Convert some code to see it here.</div>';
					return;
				}
				
				list.innerHTML = items.map(item => {
					console.log('  - Rendering item:', item.id, item.name);
					return \`
					<div class="history-item">
						<div class="history-header" style="margin-bottom: 0;">
							<span style="font-size: 14px; color: var(--vscode-foreground);">\${item.name || 'Conversion'}</span>
							<span class="status-badge info">\${new Date(item.timestamp).toLocaleString()}</span>
						</div>
						<div style="margin-top: 12px;">
							<button class="copy-button" onclick="loadHistoryItem('\${item.id}')">Load in Converter</button>
						</div>
					</div>
				\`;
				}).join('');
				console.log('✅ [Webview] History items rendered successfully');
			} catch (error) {
				console.error('❌ [Webview] Error loading history:', error);
				console.error('❌ [Webview] Error name:', error?.name);
				console.error('❌ [Webview] Error message:', error?.message);
				console.error('❌ [Webview] Error stack:', error?.stack);
				
				let errorMsg = 'Failed to load history from backend';
				if (error?.name === 'AbortError') {
					errorMsg = 'Request timed out - backend not responding';
				} else if (error?.message?.includes('Failed to fetch')) {
					errorMsg = 'Network error - check if backend is running at http://localhost:8000';
				}
				
				list.innerHTML = \`<div style="padding: 20px; text-align: center; color: var(--accent-red);"><strong>❌ \${errorMsg}</strong><br/><small style="color: #999;">Check console for details</small></div>\`;
			}
		}

		window.loadHistoryItem = async function(id) {
			switchView('converter-view');
			// Clear all previous content from converter
			messagesContainer.innerHTML = '';
			console.log('🔍 [Webview] Cleared messages container for history load');
			
			const loadingEl = document.createElement('div');
			loadingEl.id = 'loading-indicator';
			loadingEl.style.cssText = 'text-align: center; padding: 16px; color: #999;';
			loadingEl.innerHTML = '<span class="loading-spinner"></span> Loading history details...';
			messagesContainer.appendChild(loadingEl);

			try {
				const response = await fetch(\`http://localhost:8000/history/\${id}\`);
				if (!response.ok) throw new Error('Failed to fetch detail');
				const detail = await response.json();
				loadingEl.remove();
				console.log('🔍 [Webview] History detail loaded:', detail);
				console.log('📊 [Webview] Detail fields:', {
					has_c_code: !!detail.c_code,
					has_timebasedprofiling: !!detail.timebasedprofiling,
					has_membasedprofiling: !!detail.membasedprofiling,
					has_prompts: detail.prompts?.length || 0,
					has_cuda_codes: detail.cuda_codes?.length || 0,
					has_best_cuda_code: !!detail.best_cuda_code,
					has_performance_metrics: !!detail.performance_metrics,
				});

				// Recreate the user message
				const userMessageEl = document.createElement('div');
				userMessageEl.style.cssText = 'background: var(--accent-blue); color: white; padding: 12px; border-radius: 4px; margin-bottom: 8px;';
				userMessageEl.innerHTML = \`<strong>📝 Your C Code:</strong><div class="code-block"><pre>\${detail.c_code}</pre></div>\`;
				messagesContainer.appendChild(userMessageEl);

				// Debug: Show what fields are available
				const debugEl = document.createElement('div');
				debugEl.style.cssText = 'background: rgba(255, 193, 7, 0.15); border-left: 3px solid #ffb900; border-radius: 4px; padding: 12px; margin-bottom: 8px; font-size: 11px;';
				debugEl.innerHTML = \`
					<strong>📋 Debug Info:</strong><br/>
					Prompts: \${detail.prompts?.length || 0} | 
					CUDA Codes: \${detail.cuda_codes?.length || 0} | 
					Time Prof: \${!!detail.timebasedprofiling} | 
					Mem Prof: \${!!detail.membasedprofiling}
				\`;
				messagesContainer.appendChild(debugEl);

				// Display time-based profiling if available
				if (detail.timebasedprofiling && detail.timebasedprofiling.execution_time) {
					const profilingSection = createSection('Serial Profiling Results', '📊', 'profiling-section-history');
					const profilingContent = \`
						<div style="background: var(--surface-tertiary); padding: 10px; border-radius: 4px; margin-bottom: 8px;">
							<div style="color: var(--accent-green); font-weight: 600; margin-bottom: 6px;">⏱️ Execution Time: \${detail.timebasedprofiling.execution_time}ms</div>
							<div class="code-block"><pre>\${detail.timebasedprofiling.flat_profile || 'No profile data'}</pre></div>
						</div>
					\`;
					profilingSection.querySelector('.section-content').innerHTML = profilingContent;
					profilingSection.classList.remove('collapsed');
					messagesContainer.appendChild(profilingSection);
				}

				// Display memory profiling if available
				if (detail.membasedprofiling) {
					const mcprofSection = createSection('Memory & Communication Profiling', '💾', 'mcprof-section-history');
					let mcprofContent = '';
					
					if (detail.membasedprofiling.memory_profile) {
						mcprofContent += \`
							<div style="margin-bottom: 12px;">
								<div style="color: var(--accent-blue); font-weight: 600; margin-bottom: 6px;">📈 Memory Profile:</div>
								<div class="code-block"><pre>\${detail.membasedprofiling.memory_profile}</pre></div>
							</div>
						\`;
					}
					
					// if (detail.membasedprofiling.call_graph_base64) {
					// 	mcprofContent += \`
					// 		<div style="margin-bottom: 12px;">
					// 			<div style="color: var(--accent-blue); font-weight: 600; margin-bottom: 6px;">📊 Call Graph:</div>
					// 			<img 
					// 				src="data:image/png;base64,\${detail.membasedprofiling.call_graph_base64}" 
					// 				style="max-width: 100%; height: auto; border-radius: 4px; border: 1px solid var(--border-color); display: block;"
					// 				onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
					// 			/>
					// 			<div style="display:none; color: var(--accent-red); font-size: 11px;">⚠️ Failed to load call graph image</div>
					// 		</div>
					// 	\`;
					// }

					// if (detail.membasedprofiling.comm_graph_base64) {
					// 	mcprofContent += \`
					// 		<div style="margin-bottom: 12px;">
					// 			<div style="color: var(--accent-blue); font-weight: 600; margin-bottom: 6px;">🔗 Communication Graph:</div>
					// 			<img 
					// 				src="data:image/png;base64,\${detail.membasedprofiling.comm_graph_base64}" 
					// 				style="max-width: 100%; height: auto; border-radius: 4px; border: 1px solid var(--border-color); display: block;"
					// 				onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
					// 			/>
					// 			<div style="display:none; color: var(--accent-red); font-size: 11px;">⚠️ Failed to load communication graph image</div>
					// 		</div>
					// 	\`;
					// }

					if (mcprofContent) {
						mcprofSection.querySelector('.section-content').innerHTML = mcprofContent;
						mcprofSection.classList.remove('collapsed');
						messagesContainer.appendChild(mcprofSection);
					}
				}

				// Display prompts if available
				if (detail.prompts && detail.prompts.length > 0) {
					const promptsSection = createSection(\`LLM Prompts (\${detail.prompts.length})\`, '✨', 'prompts-section-history');
					const promptsContent = document.createElement('div');
					
					detail.prompts.forEach((p, idx) => {
						const promptItem = document.createElement('div');
						promptItem.className = 'prompt-item collapsed';
						promptItem.style.marginBottom = '8px';
						
						const headerDiv = document.createElement('div');
						headerDiv.className = 'prompt-item-header';
						headerDiv.style.display = 'flex';
						headerDiv.style.justifyContent = 'space-between';
						headerDiv.style.alignItems = 'center';
						
						const titleDiv = document.createElement('div');
						titleDiv.style.display = 'flex';
						titleDiv.style.alignItems = 'center';
						titleDiv.style.gap = '8px';
						titleDiv.style.flex = '1';
						titleDiv.innerHTML = \`
							<span class="prompt-toggle">▶</span>
							<div class="prompt-item-title" style="margin: 0;">Prompt \${p.prompt_id}</div>
						\`;
						
						const copyBtn = document.createElement('button');
						copyBtn.className = 'copy-button';
						copyBtn.textContent = '📋 Copy';
						copyBtn.onclick = (e) => {
							e.stopPropagation();
							navigator.clipboard.writeText(p.prompt_text).then(() => {
								copyBtn.textContent = '✅ Copied';
								setTimeout(() => copyBtn.textContent = '📋 Copy', 2000);
							});
						};
						
						headerDiv.appendChild(titleDiv);
						headerDiv.appendChild(copyBtn);
						
						const textDiv = document.createElement('div');
						textDiv.className = 'prompt-item-text';
						textDiv.textContent = p.prompt_text;
						textDiv.style.marginTop = '8px';
						textDiv.style.whiteSpace = 'pre-wrap';
						
						promptItem.appendChild(headerDiv);
						promptItem.appendChild(textDiv);
						
						headerDiv.addEventListener('click', (e) => {
							if (e.target !== copyBtn) {
								promptItem.classList.toggle('collapsed');
							}
						});
						
						promptsContent.appendChild(promptItem);
					});
					
					promptsSection.querySelector('.section-content').appendChild(promptsContent);
					promptsSection.classList.remove('collapsed');
					messagesContainer.appendChild(promptsSection);
				}

				// Display all CUDA codes with their compilation/execution results
				if (detail.cuda_codes && detail.cuda_codes.length > 0) {
					const codeSection = createSection('Generated CUDA Codes', '💻', 'code-section-history');
					
					detail.cuda_codes.forEach((cudaCode) => {
						if (!cudaCode.cuda_code) return;
						
						const codeContainer = document.createElement('div');
						codeContainer.style.marginBottom = '16px';
						codeContainer.style.paddingBottom = '16px';
						codeContainer.style.borderBottom = '1px solid var(--border-color)';
						
						// Code header with prompt ID
						const codeHeader = document.createElement('div');
						codeHeader.className = 'code-header';
						codeHeader.innerHTML = \`<span class="status-badge info">Prompt \${cudaCode.prompt_id || cudaCode.candidate_id}</span>\`;
						
						const copyCodeBtn = document.createElement('button');
						copyCodeBtn.className = 'copy-button';
						copyCodeBtn.textContent = '📋 Copy Code';
						copyCodeBtn.onclick = () => {
							navigator.clipboard.writeText(cudaCode.cuda_code).then(() => {
								copyCodeBtn.textContent = '✅ Copied';
								setTimeout(() => copyCodeBtn.textContent = '📋 Copy Code', 2000);
							});
						};
						codeHeader.appendChild(copyCodeBtn);
						
						// Code block
						const codeBlock = document.createElement('div');
						codeBlock.className = 'code-block';
						const pre = document.createElement('pre');
						pre.textContent = cudaCode.cuda_code;
						codeBlock.appendChild(pre);
						
						// Compilation status
						const compilationClass = cudaCode.stats.compiled ? 'success' : 'failed';
						const compilationIcon = cudaCode.stats.compiled ? '✅' : '❌';
						const compilationText = cudaCode.stats.compiled ? 'Compiled successfully' : ('Compilation failed: ' + (cudaCode.stats.compile_error || 'Unknown error'));
						const compilationResult = \`
							<div class="compilation-result \${compilationClass}">
								<span class="icon">\${compilationIcon}</span>
								<span>\${compilationText}</span>
							</div>
						\`;
						
						// Execution status
						let executionResult = '';
						if (cudaCode.stats.compiled) {
							const executionClass = cudaCode.stats.executable ? 'success' : 'failed';
							const executionIcon = cudaCode.stats.executable ? '⚡' : '❌';
							const executionText = cudaCode.stats.executable ? \`Executed: \${cudaCode.stats.cuda_time}ms\` : 'Execution failed';
							executionResult = \`
								<div class="execution-result \${executionClass}">
									<span class="icon">\${executionIcon}</span>
									<span>\${executionText}</span>
								</div>
							\`;
						}
						
						codeContainer.appendChild(codeHeader);
						codeContainer.appendChild(codeBlock);
						codeContainer.innerHTML += compilationResult;
						if (executionResult) codeContainer.innerHTML += executionResult;
						
						codeSection.querySelector('.section-content').appendChild(codeContainer);
					});
					
					codeSection.classList.remove('collapsed');
					messagesContainer.appendChild(codeSection);
				}

				// Display final result with best CUDA code
				if (detail.best_cuda_code && detail.best_cuda_code.cuda_code) {
					const finalSection = createSection('🏆 Best CUDA Code (From History)', '🎉', 'final-section-history');
					const finalContent = document.createElement('div');
					
					if (detail.best_cuda_code.cuda_time) {
						const bestTimeDiv = document.createElement('div');
						bestTimeDiv.style.cssText = 'margin-bottom: 12px; padding: 10px; background: rgba(16, 124, 16, 0.15); border-radius: 4px; border-left: 3px solid var(--accent-green);';
						bestTimeDiv.innerHTML = \`<div style="color: var(--accent-green); font-weight: 600;">⚡ Execution Time: \${detail.best_cuda_code.cuda_time}ms</div>\`;
						if (detail.best_cuda_code.speedup) {
							bestTimeDiv.innerHTML += \`<div style="color: var(--accent-green); font-size: 12px; margin-top: 4px;">Speedup: \${detail.best_cuda_code.speedup}x</div>\`;
						}
						finalContent.appendChild(bestTimeDiv);
					}
					
					const finalHeader = document.createElement('div');
					finalHeader.className = 'code-header';
					const copyFinalBtn = document.createElement('button');
					copyFinalBtn.className = 'copy-button';
					copyFinalBtn.textContent = '📋 Copy Code';
					copyFinalBtn.onclick = () => {
						navigator.clipboard.writeText(detail.best_cuda_code.cuda_code).then(() => {
							copyFinalBtn.textContent = '✅ Copied';
							setTimeout(() => copyFinalBtn.textContent = '📋 Copy Code', 2000);
						});
					};
					finalHeader.appendChild(copyFinalBtn);
					
					const finalCodeBlock = document.createElement('div');
					finalCodeBlock.className = 'code-block';
					const finalPre = document.createElement('pre');
					finalPre.textContent = detail.best_cuda_code.cuda_code;
					finalCodeBlock.appendChild(finalPre);
					
					finalContent.appendChild(finalHeader);
					finalContent.appendChild(finalCodeBlock);
					
					finalSection.querySelector('.section-content').appendChild(finalContent);
					finalSection.classList.remove('collapsed');
					messagesContainer.appendChild(finalSection);
				} else {
					const infoEl = document.createElement('div');
					infoEl.style.cssText = 'background: rgba(0, 120, 212, 0.15); border-left: 3px solid var(--accent-blue); border-radius: 4px; padding: 12px; margin-bottom: 8px;';
					infoEl.innerHTML = \`No optimal CUDA code generated in this history item.\`;
					messagesContainer.appendChild(infoEl);
				}
			} catch (err) {
				loadingEl.remove();
				const errEl = document.createElement('div');
				errEl.style.cssText = 'background: rgba(243, 101, 74, 0.15); border-left: 3px solid var(--accent-red); border-radius: 4px; padding: 12px; color: var(--accent-red);';
				errEl.innerHTML = \`Failed to load history details.\`;
				messagesContainer.appendChild(errEl);
			}
		};

		function updateConnectionStatus(status) {
			isConnected = status === 'connected';
			statusDot.className = isConnected ? 'connected' : '';
			statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
		}

		function clearMessages() {
			if (!hasMessages) {
				messagesContainer.innerHTML = '';
				hasMessages = true;
			}
		}

		function createSection(title, icon, id) {
			const section = document.createElement('div');
			section.className = 'section collapsed';
			section.id = id;
			section.innerHTML = \`
				<div class="section-header">
					<div class="section-header-title">
						<span class="icon">\${icon}</span>
						<span>\${title}</span>
					</div>
					<span class="toggle-icon">▶</span>
				</div>
				<div class="section-content"></div>
			\`;
			
			const header = section.querySelector('.section-header');
			header.addEventListener('click', () => {
				section.classList.toggle('collapsed');
			});
			
			return section;
		}

		function updateSection(id, content) {
			let section = document.getElementById(id);
			if (!section) {
				clearMessages();
				const title = {
					'prompts-section': 'LLM Prompts',
					'compilation-section': 'Compilation Results',
					'execution-section': 'Execution Results',
					'code-section': 'Generated CUDA Code'
				}[id];
				const icon = {
					'prompts-section': '✨',
					'compilation-section': '🔨',
					'execution-section': '⚡',
					'code-section': '💻'
				}[id];
				section = createSection(title, icon, id);
				messagesContainer.appendChild(section);
			}
			
			const contentDiv = section.querySelector('.section-content');
			if (typeof content === 'string') {
				contentDiv.innerHTML += content;
			} else {
				contentDiv.appendChild(content);
			}
			
			// Auto-expand on new content
			section.classList.remove('collapsed');
		}

		function handleBackendMessage(message) {
			const { action, payload } = message;

			switch (action) {
				case 'gprof_profiling':
					messagesContainer.innerHTML = '';
					const profilingSection = createSection('Serial Profiling Results', '📊', 'profiling-section');
					const profilingContent = \`
						<div style="background: var(--surface-tertiary); padding: 10px; border-radius: 4px; margin-bottom: 8px;">
							<div style="color: var(--accent-green); font-weight: 600; margin-bottom: 6px;">⏱️ Execution Time: \${payload.c_time_str}</div>
							<div class="code-block"><pre>\${payload.time_profile}</pre></div>
						</div>
					\`;
					profilingSection.querySelector('.section-content').innerHTML = profilingContent;
					profilingSection.classList.remove('collapsed');
					messagesContainer.appendChild(profilingSection);
					break;

				case 'mcprof_profiling':
					const mcprofSection = createSection('Memory & Communication Profiling', '💾', 'mcprof-section');
					let mcprofContent = '';
					
				
				// Memory profile
				if (payload.memory_profile) {
					mcprofContent += \`
						<div style="margin-bottom: 12px;">
							<div style="color: var(--accent-blue); font-weight: 600; margin-bottom: 6px;">📈 Memory Profile:</div>
							<div class="code-block"><pre>\${payload.memory_profile}</pre></div>
						</div>
					\`;
				} else {
					console.warn('⚠️ No memory_profile received');
				}
				
		
				// Call graph
				// if (payload.call_graph) {
				// 	mcprofContent += \`
				// 		<div style="margin-bottom: 12px;">
				// 			<div style="color: var(--accent-blue); font-weight: 600; margin-bottom: 6px;">📊 Call Graph:</div>
				// 			<img 
				// 				src="data:image/png;base64,\${payload.call_graph}" 
				// 				style="max-width: 100%; height: auto; border-radius: 4px; border: 1px solid var(--border-color); display: block;"
				// 				onerror="console.error('Failed to load call graph'); this.style.display='none'; this.nextElementSibling.style.display='block';"
				// 			/>
				// 			<div style="display:none; color: var(--accent-red); font-size: 11px;">⚠️ Failed to load call graph image</div>
				// 		</div>
				// 	\`;
				// } else {
				// 	console.warn('⚠️ No call_graph received');
				// }

				// // Communication graph
				// if (payload.comm_graph) {
				// 	console.log('✅ Communication graph received, size:', payload.comm_graph.length);
				// 	mcprofContent += \`
				// 		<div style="margin-bottom: 12px;">
				// 			<div style="color: var(--accent-blue); font-weight: 600; margin-bottom: 6px;">🔗 Communication Graph:</div>
				// 			<img 
				// 				src="data:image/png;base64,\${payload.comm_graph}" 
				// 				style="max-width: 100%; height: auto; border-radius: 4px; border: 1px solid var(--border-color); display: block;"
				// 				onerror="console.error('Failed to load comm graph'); this.style.display='none'; this.nextElementSibling.style.display='block';"
				// 			/>
				// 			<div style="display:none; color: var(--accent-red); font-size: 11px;">⚠️ Failed to load communication graph image</div>
				// 		</div>
				// 	\`;
				// } else {
				// 	console.warn('⚠️ No comm_graph received');
				// }

				mcprofSection.querySelector('.section-content').innerHTML = mcprofContent;
				mcprofSection.classList.remove('collapsed');
				messagesContainer.appendChild(mcprofSection);
				break;

				case 'prompt_generation':
					messagesContainer.innerHTML = '';
					state.prompts = payload.prompts;
					const promptsSection = createSection(\`LLM Prompts (\${payload.prompts.length})\`, '✨', 'prompts-section');
					const promptsContent = document.createElement('div');
					
					payload.prompts.forEach((p, idx) => {
						const promptItem = document.createElement('div');
						promptItem.className = 'prompt-item collapsed';
						promptItem.style.marginBottom = '8px';
						
						const headerDiv = document.createElement('div');
						headerDiv.className = 'prompt-item-header';
						headerDiv.style.display = 'flex';
						headerDiv.style.justifyContent = 'space-between';
						headerDiv.style.alignItems = 'center';
						
						const titleDiv = document.createElement('div');
						titleDiv.style.display = 'flex';
						titleDiv.style.alignItems = 'center';
						titleDiv.style.gap = '8px';
						titleDiv.style.flex = '1';
						titleDiv.innerHTML = \`
							<span class="prompt-toggle">▶</span>
							<div class="prompt-item-title" style="margin: 0;">Prompt \${idx + 1}</div>
						\`;
						
						const copyBtn = document.createElement('button');
						copyBtn.className = 'copy-button';
						copyBtn.textContent = '📋 Copy';
						copyBtn.onclick = (e) => {
							e.stopPropagation();
							navigator.clipboard.writeText(p.prompt).then(() => {
								copyBtn.textContent = '✅ Copied';
								setTimeout(() => copyBtn.textContent = '📋 Copy', 2000);
							});
						};
						
						headerDiv.appendChild(titleDiv);
						headerDiv.appendChild(copyBtn);
						
						const textDiv = document.createElement('div');
						textDiv.className = 'prompt-item-text';
						textDiv.textContent = p.prompt;
						textDiv.style.marginTop = '8px';
						textDiv.style.whiteSpace = 'pre-wrap';
						
						promptItem.appendChild(headerDiv);
						promptItem.appendChild(textDiv);
						
						headerDiv.addEventListener('click', (e) => {
							if (e.target !== copyBtn) {
								promptItem.classList.toggle('collapsed');
							}
						});
						
						promptsContent.appendChild(promptItem);
					});
					
					promptsSection.querySelector('.section-content').appendChild(promptsContent);
					promptsSection.classList.remove('collapsed');
					messagesContainer.appendChild(promptsSection);
					break;

				case 'cuda_generation_chunk':
					if (payload.cuda_code) {
						let codeSection = document.getElementById('code-section');
						if (!codeSection) {
							codeSection = createSection('Generated CUDA Code', '💻', 'code-section');
							messagesContainer.appendChild(codeSection);
						}
						
						const codeContainer = document.createElement('div');
						codeContainer.style.marginBottom = '12px';
						
						const codeHeader = document.createElement('div');
						codeHeader.className = 'code-header';
						codeHeader.innerHTML = \`<span class="status-badge info">Prompt \${payload.prompt_id}</span>\`;
						
						const copyCodeBtn = document.createElement('button');
						copyCodeBtn.className = 'copy-button';
						copyCodeBtn.textContent = '📋 Copy Code';
						copyCodeBtn.onclick = () => {
							navigator.clipboard.writeText(payload.cuda_code).then(() => {
								copyCodeBtn.textContent = '✅ Copied';
								setTimeout(() => copyCodeBtn.textContent = '📋 Copy Code', 2000);
							});
						};
						codeHeader.appendChild(copyCodeBtn);
						
						const codeBlock = document.createElement('div');
						codeBlock.className = 'code-block';
						const pre = document.createElement('pre');
						pre.textContent = payload.cuda_code;
						codeBlock.appendChild(pre);
						
						codeContainer.appendChild(codeHeader);
						codeContainer.appendChild(codeBlock);
						
						codeSection.querySelector('.section-content').appendChild(codeContainer);
						codeSection.classList.remove('collapsed');
					}
					break;

				case 'cuda_compilation_chunk':
					const compilationClass = payload.compilable ? 'success' : 'failed';
					const compilationIcon = payload.compilable ? '✅' : '❌';
					const compilationText = payload.compilable ? 'Compiled successfully' : 'Compilation failed';
					const compilationResult = \`
						<div class="compilation-result \${compilationClass}">
							<span class="icon">\${compilationIcon}</span>
							<span>Prompt \${payload.prompt_id}: \${compilationText}</span>
						</div>
					\`;
					updateSection('compilation-section', compilationResult);
					break;

				case 'cuda_execution_chunk':
					const executionClass = payload.executable ? 'success' : 'failed';
					const executionIcon = payload.executable ? '⚡' : '❌';
					const executionText = payload.executable ? \`Executed: \${payload.cuda_time_str}\` : 'Execution failed';
					const executionResult = \`
						<div class="execution-result \${executionClass}">
							<span class="icon">\${executionIcon}</span>
							<span>Prompt \${payload.prompt_id}: \${executionText}</span>
						</div>
					\`;
					updateSection('execution-section', executionResult);
					break;

				case 'final_result':
					state.finalCode = payload.cuda_code;
					
					// We do not save to local VS Code state anymore
					// The backend stores it when the session completes

					const finalSection = createSection('🏆 Best CUDA Code', '🎉', 'final-section');
					const finalContent = document.createElement('div');
					
					const bestTimeDiv = document.createElement('div');
					bestTimeDiv.style.cssText = 'margin-bottom: 12px; padding: 10px; background: rgba(16, 124, 16, 0.15); border-radius: 4px; border-left: 3px solid var(--accent-green);';
					bestTimeDiv.innerHTML = \`<div style="color: var(--accent-green); font-weight: 600;">⚡ Best Execution Time: \${payload.cuda_time}ms</div>\`;
					
					const finalHeader = document.createElement('div');
					finalHeader.className = 'code-header';
					const copyFinalBtn = document.createElement('button');
					copyFinalBtn.className = 'copy-button';
					copyFinalBtn.textContent = '📋 Copy Best Code';
					copyFinalBtn.onclick = () => {
						navigator.clipboard.writeText(payload.cuda_code).then(() => {
							copyFinalBtn.textContent = '✅ Copied';
							setTimeout(() => copyFinalBtn.textContent = '📋 Copy Best Code', 2000);
						});
					};
					finalHeader.appendChild(copyFinalBtn);
					
					const finalCodeBlock = document.createElement('div');
					finalCodeBlock.className = 'code-block';
					const finalPre = document.createElement('pre');
					finalPre.textContent = payload.cuda_code;
					finalCodeBlock.appendChild(finalPre);
					
					finalContent.appendChild(bestTimeDiv);
					finalContent.appendChild(finalHeader);
					finalContent.appendChild(finalCodeBlock);
					
					finalSection.querySelector('.section-content').appendChild(finalContent);
					finalSection.classList.remove('collapsed');
					messagesContainer.appendChild(finalSection);
					break;

				case 'error':
					messagesContainer.innerHTML = '';
					const errorEl = document.createElement('div');
					errorEl.style.cssText = 'background: rgba(243, 101, 74, 0.15); border: 1px solid var(--accent-red); border-radius: 4px; padding: 12px; color: var(--accent-red);';
					errorEl.innerHTML = \`<strong>❌ Error:</strong> \${payload}\`;
					messagesContainer.appendChild(errorEl);
					break;
			}
		}

		function sendMessage() {
			const message = messageInput.value.trim();
			if (!message) return;
			if (!isConnected) {
				alert('Not connected to backend. Please start the server at ws://localhost:8000');
				return;
			}

			currentInputCode = message;
			// Clear all previous content from converter
			messagesContainer.innerHTML = '';

			// Display user message
			const userMessageEl = document.createElement('div');
			userMessageEl.style.cssText = 'background: var(--accent-blue); color: white; padding: 12px; border-radius: 4px; margin-bottom: 8px;';
			userMessageEl.innerHTML = \`<strong>📝 Your C Code:</strong><div class="code-block"><pre>\${message}</pre></div>\`;
			messagesContainer.appendChild(userMessageEl);

			// Send to extension
			vscode.postMessage({ type: 'userMessage', text: message });

			// Clear input
			messageInput.value = '';
			messageInput.focus();

			// Show loading state
			const loadingEl = document.createElement('div');
			loadingEl.id = 'loading-indicator';
			loadingEl.style.cssText = 'text-align: center; padding: 16px; color: #999;';
			loadingEl.innerHTML = '<span class="loading-spinner"></span> Processing...';
			messagesContainer.appendChild(loadingEl);

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
			const { type, data, status, view } = event.data;

			if (type === 'connectionStatus') {
				updateConnectionStatus(status);
			} else if (type === 'backendMessage') {
				const loading = document.getElementById('loading-indicator');
				if (loading) loading.remove();
				handleBackendMessage(data);
			} else if (type === 'showView') {
				switchView(view);
			} else {
				console.warn('⚠️ [Webview] Unknown message type:', type);
			}
		});

		// Initial status
		updateConnectionStatus('disconnected');
	</script>
</body>
</html>`;
	}
}
