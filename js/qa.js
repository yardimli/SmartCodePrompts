// SmartCodePrompts/js/qa.js
import {showLoading, hideLoading, postData} from './utils.js';
import {getCurrentProject} from './state.js';

let qaModal = null;
let qaChatWindow = null;
let qaInput = null;
let qaSendButton = null;
let qaModalTitle = null;

/**
 * Initializes references to the QA modal and its elements.
 */
export function initializeQAModal() {
	qaModal = document.getElementById('qaModal');
	qaChatWindow = document.getElementById('qa-chat-window');
	qaInput = document.getElementById('qa-input');
	qaSendButton = document.getElementById('qa-send-button');
	qaModalTitle = document.getElementById('qa-modal-title');
}

/**
 * Adds a message to the chat window in the QA modal.
 * @param {string} role - 'user' or 'assistant'.
 * @param {string} content - The HTML content of the message.
 * @param {boolean} isPlaceholder - If true, returns the element for later updates.
 * @returns {HTMLElement|null} The new message element if it's a placeholder, otherwise null.
 */
function addMessageToChat(role, content, isPlaceholder = false) {
	const messageWrapper = document.createElement('div');
	messageWrapper.className = `chat ${role === 'user' ? 'chat-end' : 'chat-start'}`;
	
	const messageBubble = document.createElement('div');
	messageBubble.className = `chat-bubble ${role === 'user' ? 'chat-bubble-primary' : ''}`;
	messageBubble.innerHTML = content.replace(/\n/g, '<br>');
	
	messageWrapper.appendChild(messageBubble);
	qaChatWindow.appendChild(messageWrapper);
	
	// Scroll to the bottom
	qaChatWindow.scrollTop = qaChatWindow.scrollHeight;
	
	if (isPlaceholder) {
		return messageBubble;
	}
	return null;
}

/**
 * Handles the submission of a question from the QA modal.
 */
async function handleQuestionSubmit() {
	const userQuestion = qaInput.value.trim();
	if (!userQuestion) return;
	
	const currentProject = getCurrentProject();
	const llmId = document.getElementById('llm-dropdown').value;
	const temperature = document.getElementById('temperature-slider').value;
	
	if (!currentProject || !llmId) {
		alert('Please select a project and an LLM before asking a question.');
		return;
	}
	
	// Add user message to chat and clear input
	addMessageToChat('user', userQuestion);
	qaInput.value = '';
	qaInput.disabled = true;
	qaSendButton.disabled = true;
	
	// Add a placeholder for the assistant's response
	const thinkingPlaceholder = addMessageToChat('assistant', '<i>Thinking... finding relevant files...</i>', true);
	
	try {
		// Step 1: Get relevant files based on the question
		const relevantFilesResponse = await postData({
			action: 'get_relevant_files_from_prompt', // Re-using the smart prompt logic
			rootIndex: currentProject.rootIndex,
			projectPath: currentProject.path,
			userPrompt: userQuestion,
			llmId: llmId,
			temperature: parseFloat(temperature)
		});
		
		const relevantFiles = relevantFilesResponse.relevant_files;
		if (!relevantFiles || relevantFiles.length === 0) {
			thinkingPlaceholder.innerHTML = "I couldn't find any relevant files to answer your question. Please try rephrasing or analyzing more files in your project.";
			return;
		}
		
		thinkingPlaceholder.innerHTML = `<i>Found ${relevantFiles.length} relevant file(s). Asking the LLM...</i>`;
		
		// Step 2: Ask the LLM the question with the context of the relevant files
		const qaResponse = await postData({
			action: 'ask_question_about_code',
			rootIndex: currentProject.rootIndex,
			projectPath: currentProject.path,
			question: userQuestion,
			relevantFiles: JSON.stringify(relevantFiles),
			llmId: llmId,
			temperature: parseFloat(temperature)
		});
		
		// Replace placeholder with the actual answer
		thinkingPlaceholder.innerHTML = qaResponse.answer;
		
	} catch (error) {
		console.error('Error during QA process:', error);
		thinkingPlaceholder.innerHTML = `<span class="text-error">An error occurred: ${error.message}</span>`;
	} finally {
		qaInput.disabled = false;
		qaSendButton.disabled = false;
		qaInput.focus();
	}
}

/**
 * Sets up all event listeners for the QA modal and its trigger.
 */
export function setupQAListeners() {
	document.getElementById('qa-modal-button').addEventListener('click', () => {
		const currentProject = getCurrentProject();
		if (currentProject) {
			qaModalTitle.textContent = `Ask a Question - ${currentProject.path}`;
		} else {
			qaModalTitle.textContent = 'Ask a Question';
		}
		// Clear previous chat history
		qaChatWindow.innerHTML = '';
		addMessageToChat('assistant', 'Hello! What would you like to know about your project? I will find relevant files and use them to answer your question.');
		qaModal.showModal();
		qaInput.focus();
	});
	
	qaSendButton.addEventListener('click', handleQuestionSubmit);
	
	qaInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleQuestionSubmit();
		}
	});
}
