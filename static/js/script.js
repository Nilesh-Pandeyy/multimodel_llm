// Helper function to ensure elements exist
function ensureElementExists(element, elementName) {
    if (!element) {
        console.error(`DOM element not found: ${elementName}`);
        throw new Error(`Required DOM element not found: ${elementName}`);
    }
    return element;
}

// Auto-save state variables
let autoSaveEnabled = true;
let autoSaveTimer = null;
let lastSavedContent = '';
let autoSaveInterval = 30000; // 30 seconds
let threadModified = false;
let lastThreadListUpdate = null;

// Expose key functions to global scope for direct HTML access
window.handleSendClick = function() {
    console.log("Send button clicked (global handler)");
    if (window.sendMessage) {
        window.sendMessage();
    }
};

window.handleSaveClick = function() {
    console.log("Save button clicked (global handler)");
    if (window.openSaveModal) {
        window.openSaveModal();
    }
};

window.handleConfirmSaveClick = function() {
    console.log("Confirm save button clicked (global handler)");
    if (window.saveThread) {
        window.saveThread();
    }
};

window.handleConnectClick = function() {
    console.log("Connect button clicked (global handler)");
    if (window.connectToModel) {
        window.connectToModel();
    }
};

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM fully loaded");
    
    // DOM elements with validation
    const modelDropdown = ensureElementExists(document.getElementById('model-dropdown'), 'model-dropdown');
    const connectBtn = ensureElementExists(document.getElementById('connect-btn'), 'connect-btn');
    const currentModel = ensureElementExists(document.getElementById('current-model'), 'current-model');
    const chatMessages = ensureElementExists(document.getElementById('chat-messages'), 'chat-messages');
    const userInput = ensureElementExists(document.getElementById('user-input'), 'user-input');
    const sendBtn = ensureElementExists(document.getElementById('send-btn'), 'send-btn');
    const clearChatBtn = ensureElementExists(document.getElementById('clear-chat-btn'), 'clear-chat-btn');
    const newThreadBtn = ensureElementExists(document.getElementById('new-thread-btn'), 'new-thread-btn');
    const saveThreadBtn = ensureElementExists(document.getElementById('save-thread-btn'), 'save-thread-btn');
    const threadList = ensureElementExists(document.getElementById('thread-list'), 'thread-list');
    const currentThreadTitle = ensureElementExists(document.getElementById('current-thread-title'), 'current-thread-title');
    const threadTitleText = ensureElementExists(document.getElementById('thread-title-text'), 'thread-title-text');
    
    // Modal elements with validation
    const saveThreadModal = ensureElementExists(document.getElementById('save-thread-modal'), 'save-thread-modal');
    const threadNameInput = ensureElementExists(document.getElementById('thread-name-input'), 'thread-name-input');
    const confirmSaveBtn = ensureElementExists(document.getElementById('confirm-save-btn'), 'confirm-save-btn');
    const modalClose = ensureElementExists(document.querySelector('.close'), 'close button');
    
    // Rename thread elements
    const renameThreadBtn = ensureElementExists(document.getElementById('rename-thread-btn'), 'rename-thread-btn');
    const renameField = ensureElementExists(document.getElementById('rename-field'), 'rename-field');
    const renameInput = ensureElementExists(document.getElementById('rename-input'), 'rename-input');
    const confirmRenameBtn = ensureElementExists(document.getElementById('confirm-rename-btn'), 'confirm-rename-btn');
    const cancelRenameBtn = ensureElementExists(document.getElementById('cancel-rename-btn'), 'cancel-rename-btn');
    
    // Log successful element selection
    console.log("All required DOM elements found successfully");
    
    // Chat state
    let chatHistory = [];
    let currentThreadId = 'new';
    let isModelConnected = false; // Start with model disconnected
    let isProcessing = false;
    
    // Initialize
    loadThreads();
    initRenameThread();
    initAutoSave(); // Initialize auto-save functionality
    initDebugHelpers(); // Initialize debug helpers
    
    // Event listeners for main buttons
    // Do not add connectBtn event listener - use handleConnectClick instead
    
    sendBtn.addEventListener('click', function(e) {
        e.preventDefault();
        console.log("Send button clicked (event listener)");
        sendMessage();
    });
    
    clearChatBtn.addEventListener('click', clearChat);
    newThreadBtn.addEventListener('click', createNewThread);
    
    saveThreadBtn.addEventListener('click', function(e) {
        e.preventDefault();
        console.log("Save button clicked (event listener)");
        openSaveModal();
    });
    
    confirmSaveBtn.addEventListener('click', function(e) {
        e.preventDefault();
        console.log("Confirm save button clicked (event listener)");
        saveThread();
    });
    
    modalClose.addEventListener('click', closeModal);
    
    // Expose functions to global scope
    window.sendMessage = sendMessage;
    window.openSaveModal = openSaveModal;
    window.saveThread = saveThread;
    window.connectToModel = connectToModel;
    window.clearChat = clearChat;
    window.createNewThread = createNewThread;
    
    // Textarea enter key handler
    userInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Outside modal click to close
    window.addEventListener('click', function(e) {
        if (e.target === saveThreadModal) {
            closeModal();
        }
    });
    
    // Function to check if a model exists before connecting
    async function checkModelExists(modelName) {
        console.log(`Checking if model ${modelName} exists...`);
        
        try {
            // Make API call to check if the model exists
            const response = await fetch('/api/check_model', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ model: modelName })
            });
            
            const data = await response.json();
            return data.exists;
        } catch (error) {
            console.error('Error checking model:', error);
            return false;
        }
    }
    
    // Function to connect to the model with auto-installation
    async function connectToModel() {
        const selectedModel = modelDropdown.value;
        
        // Check if model exists
        const modelExists = await checkModelExists(selectedModel);
        
        if (!modelExists) {
            // Show the installation prompt
            const installPrompt = document.createElement('div');
            installPrompt.className = 'model-install-message';
            installPrompt.innerHTML = `
                <h4>
                    <i class="fas fa-download"></i>
                    Install Required Model
                </h4>
                <p>The model "<strong>${selectedModel}</strong>" is not currently installed but is required for this conversation.</p>
                
                <div class="install-actions">
                    <button class="btn-install-action btn-install-confirm" onclick="confirmModelInstall('${selectedModel}')">
                        <i class="fas fa-check"></i> Install Now
                    </button>
                    <button class="btn-install-action btn-install-cancel" onclick="cancelModelInstall()">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            `;
            chatMessages.appendChild(installPrompt);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return;
        }
        
        // Original connection code - runs if model exists
        currentModel.textContent = selectedModel;
        
        // Remove all previous connection messages
        const existingConnectMessages = Array.from(chatMessages.querySelectorAll('.system-message'))
            .filter(msg => msg.textContent.includes('Connected to') && 
                          msg.textContent.includes('The model is ready for your messages'));
        
        existingConnectMessages.forEach(msg => msg.remove());
        
        // Clear existing messages if the chat is empty except for welcome message
        if (chatMessages.children.length === 0 || 
            (chatMessages.children.length === 1 && chatMessages.children[0].classList.contains('welcome-message'))) {
            chatMessages.innerHTML = '';
        }
        
        // Add a professional system message to indicate connection
        const systemMessage = document.createElement('div');
        systemMessage.className = 'system-message connection-message';
        systemMessage.innerHTML = `
            <i class="fas fa-plug" style="margin-right: 8px;"></i>
            <strong>Connected to ${selectedModel}</strong>
            <div style="margin-top: 4px; font-size: 0.85rem;">
                The model is ready for your messages. Type below to begin.
            </div>
        `;
        chatMessages.appendChild(systemMessage);
        
        // Update welcome message if it exists
        const welcomeMsg = document.querySelector('.welcome-message');
        if (welcomeMsg) {
            const modelSpan = welcomeMsg.querySelector('#current-model');
            if (modelSpan) {
                modelSpan.textContent = selectedModel;
            }
        }
        
        // Set model connection state
        isModelConnected = true;
        
        // Add to chat history
        chatHistory.push({
            role: 'system',
            content: `Connected to ${selectedModel} model.`,
            timestamp: new Date().toISOString(),
            isConnection: true
        });
        
        // Mark thread as modified for auto-save
        markThreadModified();
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // If this is a new thread, make sure the title is set to "Untitled"
        if (currentThreadId === 'new' && threadTitleText) {
            threadTitleText.textContent = 'Untitled';
        }
    }
    
    // Function to handle model installation
    async function installModel(modelName) {
        console.log(`Installing model ${modelName}...`);
        
        // Show installation message
        const installMessage = document.createElement('div');
        installMessage.className = 'model-install-message';
        installMessage.innerHTML = `
            <h4>
                <i class="fas fa-spinner fa-spin"></i>
                Installing model: ${modelName}
            </h4>
            <p>This may take several minutes depending on your internet connection and the model size.</p>
            
            <div class="progress-container">
                <div class="progress-bar" style="width: 5%"></div>
            </div>
            <div class="progress-message">Starting download... Please don't close this window.</div>
        `;
        chatMessages.appendChild(installMessage);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Track progress
        let progressInterval;
        const progressBar = installMessage.querySelector('.progress-bar');
        const progressMessage = installMessage.querySelector('.progress-message');
        
        try {
            // Start a progress update simulation
            let progress = 5;
            progressInterval = setInterval(() => {
                // Simulate progress - actual progress would require backend updates
                if (progress < 95) {
                    // Randomize progress increments for more realistic feeling
                    const increment = Math.random() * 3 + 0.5;
                    progress += increment;
                    
                    // Update the progress bar
                    progressBar.style.width = `${Math.min(progress, 95)}%`;
                    
                    // Update progress message at certain points
                    if (progress > 20 && progress < 30) {
                        progressMessage.textContent = "Downloading model files...";
                    } else if (progress > 50 && progress < 60) {
                        progressMessage.textContent = "Processing model components...";
                    } else if (progress > 80) {
                        progressMessage.textContent = "Finalizing installation...";
                    }
                }
            }, 1000);
            
            // Make API call to install the model
            const response = await fetch('/api/install_model', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ model: modelName })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.detail || 'Installation failed';
                
                // Check for network/DNS errors
                if (errorMessage.includes('no such host') || 
                    errorMessage.includes('lookup') || 
                    errorMessage.includes('network')) {
                    
                    // Clear progress interval
                    clearInterval(progressInterval);
                    
                    // Update message to show error
                    installMessage.innerHTML = `
                        <h4>
                            <i class="fas fa-exclamation-circle" style="color: var(--error-color);"></i>
                            Network Error Detected
                        </h4>
                        <p>Could not download the model due to a DNS or network issue.</p>
                        <pre style="background: #1e1e1e; padding: 8px; overflow: auto; font-size: 0.8rem; color: #f44336; margin: 8px 0; border-radius: 4px; max-height: 80px;">
${errorMessage}</pre>
                        <div class="install-actions">
                            <button class="btn-install-action btn-install-confirm" onclick="showNetworkTroubleshootingDialog('${modelName}')">
                                <i class="fas fa-tools"></i> Troubleshoot
                            </button>
                            <button class="btn-install-action btn-install-cancel" onclick="tryAlternativeModel()">
                                <i class="fas fa-cube"></i> Try Smaller Model
                            </button>
                        </div>
                    `;
                    
                    return false;
                }
                
                throw new Error(errorMessage);
            }
            
            // Clear progress interval
            clearInterval(progressInterval);
            
            // Check if the model is now installed
            let isInstalled = false;
            
            // Wait a bit for the installation to progress
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check if the model is installed
            try {
                const checkResponse = await fetch('/api/check_model', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: modelName })
                });
                
                if (checkResponse.ok) {
                    const checkData = await checkResponse.json();
                    isInstalled = checkData.exists;
                }
            } catch (error) {
                console.error('Error checking if model was installed:', error);
            }
            
            if (isInstalled) {
                // Model is already installed - update UI
                progressBar.style.width = '100%';
                installMessage.innerHTML = `
                    <h4>
                        <i class="fas fa-check-circle" style="color: var(--success-color);"></i>
                        Model installed successfully: ${modelName}
                    </h4>
                    <p>The model is now ready to use.</p>
                `;
                
                return true;
            } else {
                // Model installation is still in progress - update UI with status checking button
                progressBar.style.width = '95%';
                installMessage.innerHTML = `
                    <h4>
                        <i class="fas fa-spinner fa-spin"></i>
                        Installing model: ${modelName}
                    </h4>
                    <p>Installation is in progress. This may take several minutes for large models.</p>
                    <div class="progress-container">
                        <div class="progress-bar" style="width: 95%"></div>
                    </div>
                    <div class="progress-message">Download continues in the background...</div>
                    <div class="install-actions" style="justify-content: flex-end; margin-top: 8px;">
                        <button class="btn-install-action" style="flex: 0 0 auto;" onclick="checkModelInstallation('${modelName}')">
                            <i class="fas fa-sync-alt"></i> Check Status
                        </button>
                    </div>
                `;
                
                // Return true but let the UI know installation is ongoing
                return 'in-progress';
            }
        } catch (error) {
            // Clear progress interval
            if (progressInterval) {
                clearInterval(progressInterval);
            }
            
            console.error('Error installing model:', error);
            
            // Update message to show error
            installMessage.innerHTML = `
                <h4>
                    <i class="fas fa-exclamation-circle" style="color: var(--error-color);"></i>
                    Model installation failed: ${modelName}
                </h4>
                <p>Error: ${error.message || 'Unknown error'}</p>
                <div class="install-actions">
                    <button class="btn-install-action btn-install-confirm" onclick="confirmModelInstall('${modelName}')">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                    <button class="btn-install-action btn-install-cancel" onclick="tryAlternativeModel()">
                        <i class="fas fa-cube"></i> Try Smaller Model
                    </button>
                </div>
            `;
            
            return false;
        }
    }
    
    // Function to check installation status
    async function checkModelInstallation(modelName) {
        // Find the installation message
        const installMessages = Array.from(chatMessages.querySelectorAll('.model-install-message'));
        const installMessage = installMessages.find(msg => msg.textContent.includes(modelName));
        
        if (!installMessage) return;
        
        // Update the UI
        installMessage.innerHTML = `
            <h4>
                <i class="fas fa-spinner fa-spin"></i>
                Checking installation: ${modelName}
            </h4>
            <p>Verifying if the model installation is complete...</p>
        `;
        
        try {
            // Check if the model is installed
            const response = await fetch('/api/check_model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelName })
            });
            
            if (!response.ok) {
                throw new Error('Failed to check model status');
            }
            
            const data = await response.json();
            
            if (data.exists) {
                // Model is installed!
                installMessage.innerHTML = `
                    <h4>
                        <i class="fas fa-check-circle" style="color: var(--success-color);"></i>
                        Model installed successfully: ${modelName}
                    </h4>
                    <p>The model is now ready to use.</p>
                    <div class="install-actions" style="justify-content: flex-end; margin-top: 8px;">
                        <button class="btn-install-action btn-install-confirm" onclick="connectToModel()">
                            <i class="fas fa-plug"></i> Connect Now
                        </button>
                    </div>
                `;
                
                return true;
            } else {
                // Model is still not installed
                installMessage.innerHTML = `
                    <h4>
                        <i class="fas fa-spinner fa-spin"></i>
                        Installation in progress: ${modelName}
                    </h4>
                    <p>The model is still being installed. Large models can take several minutes.</p>
                    <div class="progress-container">
                        <div class="progress-bar" style="width: 95%"></div>
                    </div>
                    <div class="progress-message">Download continues in the background...</div>
                    <div class="install-actions" style="justify-content: flex-end; margin-top: 8px;">
                        <button class="btn-install-action" style="flex: 0 0 auto;" onclick="checkModelInstallation('${modelName}')">
                            <i class="fas fa-sync-alt"></i> Check Again
                        </button>
                    </div>
                `;
                
                return false;
            }
        } catch (error) {
            console.error('Error checking model installation:', error);
            
            // Show error
            installMessage.innerHTML = `
                <h4>
                    <i class="fas fa-exclamation-circle" style="color: var(--error-color);"></i>
                    Error checking status: ${modelName}
                </h4>
                <p>Could not verify if the model is installed: ${error.message}</p>
                <div class="install-actions">
                    <button class="btn-install-action btn-install-confirm" onclick="checkModelInstallation('${modelName}')">
                        <i class="fas fa-redo"></i> Try Again
                    </button>
                    <button class="btn-install-action btn-install-cancel" onclick="cancelModelInstall()">
                        <i class="fas fa-times"></i> Dismiss
                    </button>
                </div>
            `;
            
            return false;
        }
    }
    
    // Function to confirm model installation
    async function confirmModelInstall(modelName) {
        console.log(`Starting installation of model: ${modelName}`);
        
        // Try to install the model
        const installResult = await installModel(modelName);
        
        if (installResult === true) {
            // If installation was successful, connect to the model
            setTimeout(() => {
                console.log("Installation successful, connecting to model...");
                // Update the dropdown if it's not already set
                if (modelDropdown.value !== modelName) {
                    modelDropdown.value = modelName;
                }
                connectToModel();
            }, 1000);
        } else if (installResult === 'in-progress') {
            // If installation is still in progress, show a message
            const notificationMsg = document.createElement('div');
            notificationMsg.className = 'system-message';
            notificationMsg.innerHTML = `
                <i class="fas fa-info-circle"></i>
                Model installation has started. You can check the status using the button in the installation message.
            `;
            chatMessages.appendChild(notificationMsg);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        // If installation failed, the installModel function will handle the UI
    }
    
    // Function to cancel model installation
    function cancelModelInstall() {
        // Remove the installation prompt
        const installPrompt = document.querySelector('.model-install-message');
        if (installPrompt) {
            installPrompt.remove();
        }
        
        // Show a message that installation was cancelled
        const cancelMessage = document.createElement('div');
        cancelMessage.className = 'system-message';
        cancelMessage.innerHTML = `
            <i class="fas fa-info-circle"></i>
            Model installation cancelled. Please select a different model or try again later.
        `;
        chatMessages.appendChild(cancelMessage);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Function to try a smaller model alternative
    function tryAlternativeModel() {
        // Get small models and pick the first one
        fetch('/api/list_small_models')
            .then(response => response.json())
            .then(data => {
                if (data.models && data.models.length > 0) {
                    // Find the first model that isn't installed
                    const smallModel = data.models.find(model => !model.installed) || data.models[0];
                    
                    // Close any network troubleshooting modal
                    const modal = document.getElementById('network-troubleshooting-modal');
                    if (modal) {
                        modal.remove();
                    }
                    
                    // Change the model dropdown to the specified model
                    if (modelDropdown) {
                        // Check if the option exists
                        let modelOption = Array.from(modelDropdown.options).find(option => 
                            option.value === smallModel.name
                        );
                        
                        // If not found, create a new option
                        if (!modelOption) {
                            modelOption = document.createElement('option');
                            modelOption.value = smallModel.name;
                            modelOption.textContent = smallModel.name;
                            modelDropdown.appendChild(modelOption);
                        }
                        
                        // Set the dropdown to the model
                        modelDropdown.value = smallModel.name;
                        
                        // Show notification
                        const notification = document.createElement('div');
                        notification.className = 'system-message';
                        notification.innerHTML = `
                            <i class="fas fa-info-circle"></i>
                            Switched to smaller model: <strong>${smallModel.name}</strong> (${smallModel.size}) for easier download.
                        `;
                        
                        chatMessages.appendChild(notification);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                        
                        // Try to connect to the model
                        setTimeout(() => {
                            connectToModel();
                        }, 1000);
                    }
                } else {
                    // If no small models found, show a message
                    const notification = document.createElement('div');
                    notification.className = 'system-message';
                    notification.innerHTML = `
                        <i class="fas fa-exclamation-triangle"></i>
                        No smaller models available. Please try installing a model manually using the command line:
                        <pre style="background: #1e1e1e; padding: 8px; margin-top: 10px; border-radius: 4px;">ollama pull tinyllama</pre>
                    `;
                    
                    chatMessages.appendChild(notification);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            })
            .catch(error => {
                console.error('Error getting small models:', error);
                
                // Show error message
                const notification = document.createElement('div');
                notification.className = 'system-message';
                notification.innerHTML = `
                    <i class="fas fa-exclamation-circle"></i>
                    Error getting small models: ${error.message}
                `;
                
                chatMessages.appendChild(notification);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            });
    }
    
    // Function to show network troubleshooting dialog
    function showNetworkTroubleshootingDialog(modelName) {
        // Create a modal dialog for network troubleshooting if it doesn't exist
        let modal = document.getElementById('network-troubleshooting-modal');
        if (modal) {
            modal.style.display = 'block';
            return;
        }
        
        // Create the modal
        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'network-troubleshooting-modal';
        modal.style.display = 'block';
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <span class="close" onclick="document.getElementById('network-troubleshooting-modal').remove()">&times;</span>
                <h2><i class="fas fa-network-wired"></i> Network Troubleshooting</h2>
                
                <div class="troubleshooting-content">
                    <p>There appears to be a network issue preventing model download:</p>
                    <pre style="background: #1e1e1e; padding: 10px; overflow: auto; font-size: 0.8rem; color: #f44336; margin: 10px 0; border-radius: 4px; max-height: 100px;">
Error: lookup dd20bb891979d25aebc8bec07b2b3bbc.r2.cloudflarestorage.com: no such host</pre>
                    
                    <h3>Possible solutions:</h3>
                    
                    <div style="margin-top: 15px;">
                        <h4>Option 1: Fix DNS Settings</h4>
                        <p>Try updating your DNS settings to use Google's public DNS servers:</p>
                        <ul>
                            <li>Primary DNS: 8.8.8.8</li>
                            <li>Secondary DNS: 8.8.4.4</li>
                        </ul>
                        <p><a href="https://developers.google.com/speed/public-dns/docs/using" target="_blank" style="color: var(--accent-color);">How to change DNS settings</a></p>
                    </div>
                    
                    <div style="margin-top: 15px;">
                        <h4>Option 2: Use Command Line</h4>
                        <p>Installing models through the command line sometimes works better:</p>
                        <pre style="background: #1e1e1e; padding: 10px; font-family: monospace; margin: 10px 0; border-radius: 4px;">ollama pull ${modelName}</pre>
                    </div>
                    
                    <div style="margin-top: 15px;">
                        <h4>Option 3: Use a Local Model</h4>
                        <p>You can also try using a smaller model that's easier to download:</p>
                        <div id="small-models-options">
                            <p><i class="fas fa-spinner fa-spin"></i> Loading small model options...</p>
                        </div>
                    </div>
                    
                    <div style="margin-top: 15px;">
                        <h4>Option 4: Check Firewall Settings</h4>
                        <p>Make sure your firewall allows Ollama to connect to the internet.</p>
                    </div>
                </div>
                
                <div style="margin-top: 20px; text-align: right;">
                    <button class="btn" style="background-color: var(--bg-tertiary); color: var(--text-primary);" onclick="document.getElementById('network-troubleshooting-modal').remove()">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Load small models for the troubleshooting dialog
        fetch('/api/list_small_models')
            .then(response => response.json())
            .then(data => {
                const smallModelsOptions = document.getElementById('small-models-options');
                if (!smallModelsOptions) return;
                
                if (data.models && data.models.length > 0) {
                    let html = '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;">';
                    
                    for (const model of data.models) {
                        if (!model.installed) {
                            html += `
                                <button class="modal-install-btn" onclick="trySpecificModel('${model.name}')">
                                    <i class="fas fa-cube"></i> Try ${model.name} (${model.size})
                                </button>
                            `;
                        }
                    }
                    
                    html += '</div>';
                    smallModelsOptions.innerHTML = html;
                } else {
                    smallModelsOptions.innerHTML = `
                        <button class="modal-install-btn" onclick="tryAlternativeModel()">
                            <i class="fas fa-cube"></i> Try Tiny Model Instead
                        </button>
                    `;
                }
            })
            .catch(error => {
                console.error('Error loading small models for troubleshooting:', error);
                const smallModelsOptions = document.getElementById('small-models-options');
                if (smallModelsOptions) {
                    smallModelsOptions.innerHTML = `
                        <button class="modal-install-btn" onclick="tryAlternativeModel()">
                            <i class="fas fa-cube"></i> Try Tiny Model
                        </button>
                    `;
                }
            });
    }
    
    // Function to try a specific small model
    async function trySpecificModel(modelName) {
        // Close the troubleshooting modal
        const modal = document.getElementById('network-troubleshooting-modal');
        if (modal) {
            modal.remove();
        }
        
        // Change the model dropdown to the specified model
        if (modelDropdown) {
            // Check if the option exists
            let modelOption = Array.from(modelDropdown.options).find(option => 
                option.value === modelName
            );
            
            // If not found, create a new option
            if (!modelOption) {
                modelOption = document.createElement('option');
                modelOption.value = modelName;
                modelOption.textContent = modelName;
                modelDropdown.appendChild(modelOption);
            }
            
            // Set the dropdown to the model
            modelDropdown.value = modelName;
            
            // Show notification
            const notification = document.createElement('div');
            notification.className = 'system-message';
            notification.innerHTML = `
                <i class="fas fa-info-circle"></i>
                Switched to smaller model: <strong>${modelName}</strong> for easier download.
            `;
            
            chatMessages.appendChild(notification);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            // Try to connect to the model
            setTimeout(() => {
                connectToModel();
            }, 1000);
        }
    }
    
    // Enhanced rename thread functionality
    function initRenameThread() {
        console.log("Initializing rename thread functionality");
        
        // Show rename field when clicking the rename button
        renameThreadBtn.addEventListener('click', function(e) {
            e.stopPropagation(); // Prevent event bubbling
            
            // Get current title text
            const currentTitle = threadTitleText.textContent;
            
            // Set input value to current title
            renameInput.value = currentTitle;
            
            // Show rename field
            renameField.style.display = 'flex';
            
            // Focus the input
            setTimeout(() => {
                renameInput.focus();
                renameInput.select();
            }, 50);
        });

        // Confirm rename action
        confirmRenameBtn.addEventListener('click', function() {
            applyRename();
        });

        // Cancel rename action
        cancelRenameBtn.addEventListener('click', function() {
            // Just hide the rename field without changes
            renameField.style.display = 'none';
        });

        // Also confirm on Enter key
        renameInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyRename();
            } else if (e.key === 'Escape') {
                renameField.style.display = 'none';
            }
        });
        
        // Helper function to apply rename
        function applyRename() {
            const newTitle = renameInput.value.trim();
            if (newTitle) {
                // Update the title text
                threadTitleText.textContent = newTitle;
                
                // Add a small system message about the rename
                const renameMsg = document.createElement('div');
                renameMsg.className = 'system-message';
                renameMsg.style.fontSize = '0.8rem';
                renameMsg.innerHTML = `<i class="fas fa-pencil-alt"></i> Thread renamed to <strong>${newTitle}</strong>`;
                chatMessages.appendChild(renameMsg);
                chatMessages.scrollTop = chatMessages.scrollHeight;
                
                // Update thread in sidebar if it exists
                const activeThreadItem = document.querySelector('.thread-item.active');
                if (activeThreadItem) {
                    const threadItemSpan = activeThreadItem.querySelector('span');
                    if (threadItemSpan) {
                        threadItemSpan.textContent = newTitle;
                    }
                }
                
                // Add to chat history
                chatHistory.push({
                    role: 'system',
                    content: `Thread renamed to "${newTitle}"`,
                    timestamp: new Date().toISOString()
                });
                
                // Mark thread as modified for auto-save
                markThreadModified();
                
                console.log(`Thread renamed to: ${newTitle}`);
            }
            
            // Hide rename field
            renameField.style.display = 'none';
        }
        
        // Close rename field when clicking outside
        document.addEventListener('click', function(e) {
            if (renameField.style.display === 'flex' && 
                !renameField.contains(e.target) && 
                e.target !== renameThreadBtn) {
                renameField.style.display = 'none';
            }
        });
    }
    
    // ChatGPT-style streaming response implementation
    async function sendMessage() {
        console.log("sendMessage function called");
        
        if (isProcessing || !userInput.value.trim() || !isModelConnected) {
            console.log("Exiting sendMessage early");
            
            // If model is not connected, show a hint
            if (!isModelConnected && userInput.value.trim()) {
                const hintMessage = document.createElement('div');
                hintMessage.className = 'system-message';
                hintMessage.innerHTML = `
                    <i class="fas fa-info-circle"></i>
                    Please connect to a model first by clicking the "Connect" button.
                `;
                chatMessages.appendChild(hintMessage);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
            
            return;
        }
        
        const userMessage = userInput.value.trim();
        const selectedModel = modelDropdown.value;
        
        // Add user message to UI
        appendMessage(userMessage, 'user');
        
        // Add user message to history immediately
        chatHistory.push({ 
            role: 'user', 
            content: userMessage, 
            timestamp: new Date().toISOString() 
        });
        
        // Mark thread as modified for auto-save
        markThreadModified();
        
        // Clear input
        userInput.value = '';
        
        // Set processing state
        isProcessing = true;
        sendBtn.disabled = true;
        
        // Create a div for the bot's response
        const botMessageDiv = document.createElement('div');
        botMessageDiv.className = 'message bot-message';
        chatMessages.appendChild(botMessageDiv);
        
        try {
            console.log("Making API call to /api/send_message");
            // Make API call to our backend
            const response = await fetch('/api/send_message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: selectedModel,
                    prompt: userMessage,
                    temperature: 0.7,
                    max_tokens: 2000,
                    stream_speed: 'medium'
                })
            });
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status} ${response.statusText}`);
            }
            
            // Read the streamed response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let receivedText = '';
            let displayedText = '';
            let inThinkingMode = false;
            
            // Process the stream
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    console.log("Stream done");
                    break;
                }
                
                const chunk = decoder.decode(value, { stream: true });
                receivedText += chunk;
                
                // Improved tag handling to remove all traces of think tags and associated whitespace
                
                // Check if we're in thinking mode
                if (!inThinkingMode && receivedText.includes('<think>')) {
                    inThinkingMode = true;
                    // Do not display anything while in thinking mode
                    continue;
                }
                
                // Check if we exited thinking mode
                if (inThinkingMode && receivedText.includes('</think>')) {
                    inThinkingMode = false;
                    
                    // Process all text received so far to completely remove think tags and associated content
                    const processedText = receivedText
                        .replace(/<think>[\s\S]*?<\/think>/g, '') // Remove all think tag blocks and content
                        .replace(/<\/?think\s*>/g, '')           // Remove any standalone think tags
                        .replace(/\n\s*\n+/g, '\n\n')            // Replace multiple blank lines with just one
                        .replace(/^\s+|\s+$/g, '');              // Trim whitespace from beginning and end
                    
                    // Display the processed text
                    botMessageDiv.innerHTML = formatMessage(processedText);
                    continue;
                }
                
                // If not in thinking mode, display the response in a streaming fashion
                if (!inThinkingMode) {
                    // Process the text to remove any stray think tags and normalize whitespace
                    const processedChunk = receivedText
                        .replace(/<\/?think\s*>/g, '')      // Remove any stray think tags
                        .replace(/\n\s*\n+/g, '\n\n')       // Normalize multiple blank lines
                        .trim();                            // Trim excess whitespace
                        
                    botMessageDiv.innerHTML = formatMessage(processedChunk);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            }
            
            // Final processing with improved whitespace handling
            let finalProcessedText = receivedText
                .replace(/<think>[\s\S]*?<\/think>/g, '')   // Remove all think tag blocks
                .replace(/<\/?think\s*>/g, '')              // Remove any standalone think tags
                .replace(/\n\s*\n+/g, '\n\n')               // Normalize line breaks
                .replace(/^\s+|\s+$/g, '');                 // Trim excess whitespace
            
            console.log("Final received text length after cleanup:", finalProcessedText.length);
            
            // Display the final message
            botMessageDiv.innerHTML = formatMessage(finalProcessedText);
            
            // Add assistant's response to chat history
            if (finalProcessedText.trim() && !finalProcessedText.includes('{"error":')) {
                chatHistory.push({ 
                    role: 'assistant', 
                    content: finalProcessedText,
                    timestamp: new Date().toISOString(),
                    model: selectedModel
                });
                
                // Mark thread as modified for auto-save
                markThreadModified();
                
                // Force an immediate auto-save after a complete message exchange
                setTimeout(() => {
                    autoSaveThread();
                }, 1000);
            }
            
        } catch (error) {
            console.error('Error in sendMessage:', error);
            botMessageDiv.innerHTML = `<span style="color: #e74c3c">Error: ${error.message}. Please check if the LLM service is running.</span>`;
            
            // Add error message to chat history
            chatHistory.push({ 
                role: 'system', 
                content: `Error: ${error.message}`,
                timestamp: new Date().toISOString(),
                isError: true
            });
            
            // Mark thread as modified for auto-save
            markThreadModified();
        } finally {
            isProcessing = false;
            sendBtn.disabled = false;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }
    
    function appendMessage(message, role) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        messageDiv.innerHTML = formatMessage(message);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    function formatMessage(message) {
        if (!message) return '';
        
        // Basic HTML escaping to prevent XSS
        const escapeHtml = (text) => {
            return text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };
        
        // Handle error messages in JSON format
        if (typeof message === 'string' && message.startsWith('{"error":')) {
            try {
                const errorObj = JSON.parse(message);
                return `<span style="color: #e74c3c">Error: ${errorObj.error}</span>`;
            } catch (e) {
                // Not valid JSON, continue with normal formatting
            }
        }
        
        // Simple formatting - convert newlines to <br>
        return escapeHtml(message).replace(/\n/g, '<br>');
    }
    
    function clearChat() {
        chatMessages.innerHTML = `
            <div class="welcome-message">
                <h3>Welcome to LLM Chat</h3>
                <p>Currently using: <span id="current-model">${modelDropdown.value}</span></p>
                <p>Start a conversation by typing a message below.</p>
                <p class="model-note" style="font-size: 0.8rem; margin-top: 10px;">
                    <i class="fas fa-info-circle"></i> Models will be automatically installed if needed.
                </p>
            </div>
        `;
        
        chatHistory = [];
        
        // Reset thread modified state
        threadModified = false;
        lastSavedContent = '';
        
        // Reset model connection state
        isModelConnected = false;
    }
    
    function createNewThread() {
        clearChat();
        currentThreadId = 'new';
        
        // Update thread title to "Untitled"
        threadTitleText.textContent = 'Untitled';
        
        // Update active thread in sidebar
        const threadItems = document.querySelectorAll('.thread-item');
        threadItems.forEach(item => item.classList.remove('active'));
        
        // Find and activate the "new" thread item
        const newThreadItem = document.querySelector('.thread-item[data-id="new"]');
        if (newThreadItem) {
            newThreadItem.classList.add('active');
        }
        
        // Reset thread modified state
        threadModified = false;
        lastSavedContent = '';
        
        // Reset model connection state
        isModelConnected = false;
    }
    
    function openSaveModal() {
        console.log("openSaveModal called, chat history length:", chatHistory.length);
        
        if (chatHistory.length === 0) {
            alert('Cannot save an empty thread. Start a conversation first.');
            return;
        }
        
        // Clear previous value and set default value to current thread title
        threadNameInput.value = threadTitleText.textContent;
        
        // Show the modal
        saveThreadModal.style.display = 'block';
        
        // Pre-select the text for easy editing
        setTimeout(() => {
            threadNameInput.focus();
            threadNameInput.select();
        }, 100);
    }
    
    function closeModal() {
        saveThreadModal.style.display = 'none';
    }
    
    async function saveThread() {
        console.log("saveThread function called");
        
        try {
            // Check required elements exist
            if (!threadNameInput) {
                throw new Error("threadNameInput element not found");
            }
            
            if (!confirmSaveBtn) {
                throw new Error("confirmSaveBtn element not found");
            }
            
            if (!chatMessages) {
                throw new Error("chatMessages element not found");
            }
            
            if (!threadTitleText) {
                throw new Error("threadTitleText element not found");
            }
            
            const threadName = threadNameInput.value.trim();
            
            if (!threadName) {
                alert('Please enter a name for this thread');
                return;
            }
            
            if (chatHistory.length === 0) {
                alert('Cannot save an empty thread. Start a conversation first.');
                return;
            }
            
            // Show saving indicator in the button
            confirmSaveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            confirmSaveBtn.disabled = true;
            
            console.log(`Manual save initiated for thread: ${threadName} (ID: ${currentThreadId})`);
            console.log(`Chat history contains ${chatHistory.length} messages`);
            
            // Get the current model from the DOM
            let currentModelText = "unknown";
            if (currentModel) {
                currentModelText = currentModel.textContent;
            } else {
                console.warn("Could not find current-model element, using 'unknown' as model name");
            }
            
            // Create a DEEP COPY of the chat history to avoid any reference issues
            const chatHistoryCopy = JSON.parse(JSON.stringify(chatHistory));
            
            // Add metadata to the thread
            const threadData = {
                name: threadName,
                data: chatHistoryCopy,
                saved_at: new Date().toISOString(),
                model: currentModelText
            };
            
            // IMPORTANT: Only include ID if it's not 'new'
            if (currentThreadId && currentThreadId !== 'new') {
                threadData.id = currentThreadId;
                console.log(`Including existing thread ID in request: ${currentThreadId}`);
            } else {
                console.log("Creating new thread (no ID included in request)");
            }
            
            console.log(`Save request prepared with ${chatHistoryCopy.length} messages`);
            
            const response = await fetch('/api/save_thread', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(threadData)
            });
            
            console.log(`Save API response status: ${response.status}`);
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            // Get the response text first for debugging
            const responseText = await response.text();
            console.log("Raw response:", responseText);
            
            // Parse the JSON response
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                console.error("Failed to parse response JSON:", e);
                throw new Error("Invalid JSON response from server");
            }
            
            if (result.success) {
                console.log("Thread saved successfully");
                console.log(`Server returned thread ID: ${result.thread_id}`);
                
                // Update the thread info
                threadTitleText.textContent = threadName;
                
                // Update thread ID if it's a new thread or if it changed
                if ((currentThreadId === 'new' || !currentThreadId) && result.thread_id) {
                    currentThreadId = result.thread_id;
                    console.log(`Updated currentThreadId to: ${currentThreadId}`);
                }
                
                // Show success feedback
                const savedMessage = document.createElement('div');
                savedMessage.className = 'system-message';
                savedMessage.innerHTML = `<i class="fas fa-check-circle" style="color: var(--success-color);"></i> Thread saved as "${threadName}"`;
                chatMessages.appendChild(savedMessage);
                
                // Add save confirmation to chat history
                chatHistory.push({ 
                    role: 'system', 
                    content: `Thread saved as "${threadName}"`,
                    timestamp: new Date().toISOString()
                });
                
                // Update thread modified state
                threadModified = false;
                lastSavedContent = JSON.stringify(chatHistoryCopy);
                
                chatMessages.scrollTop = chatMessages.scrollHeight;
                
                // Update threads list
                await loadThreads();
                
                // Close modal
                closeModal();
            } else {
                throw new Error(result.message || 'Unknown error');
            }
        } catch (error) {
            console.error('Error saving thread:', error);
            
            // Show error in console with stack trace
            console.error(error.stack);
            
            alert(`Failed to save thread: ${error.message}`);
        } finally {
            // Safely reset button state if it exists
            if (confirmSaveBtn) {
                confirmSaveBtn.innerHTML = 'Save Thread';
                confirmSaveBtn.disabled = false;
            }
        }
    }
    
    // Enhanced loadThreads function with silent mode
    async function loadThreads(silent = false) {
        console.log("loadThreads function called", { silent });
        try {
            // Only show loading indicator if not in silent mode
            if (!silent) {
                threadList.innerHTML = `
                    <div class="thread-item">
                        <span><i class="fas fa-spinner fa-spin"></i> Loading threads...</span>
                    </div>
                `;
            }
            
            const response = await fetch('/api/get_threads');
            console.log("Load threads response status:", response.status);
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            
            const threads = await response.json();
            console.log("Loaded threads:", threads.length);
            
            // Don't update UI if in silent mode and no threads found
            if (silent && threads.length === 0) {
                return;
            }
            
            // Store current scroll position
            const scrollPos = threadList.scrollTop;
            
            // Clear existing threads
            threadList.innerHTML = `
                <div class="thread-item ${currentThreadId === 'new' ? 'active' : ''}" data-id="new">
                    <i class="fas fa-comment-alt"></i>
                    <span>Untitled</span>
                </div>
            `;
            
            // Add threads from server
            if (threads.length === 0) {
                const emptyItem = document.createElement('div');
                emptyItem.className = 'thread-item';
                emptyItem.style.fontStyle = 'italic';
                emptyItem.style.color = 'var(--text-secondary)';
                emptyItem.innerHTML = '<span>No saved threads</span>';
                threadList.appendChild(emptyItem);
            } else {
                threads.forEach(thread => {
                    const threadItem = document.createElement('div');
                    threadItem.className = `thread-item ${currentThreadId === thread.id.toString() ? 'active' : ''}`;
                    threadItem.dataset.id = thread.id;
                    
                    // Format the thread item with name and creation date
                    const createdDate = new Date(thread.created_at).toLocaleDateString();
                    threadItem.innerHTML = `
                        <i class="fas fa-comment-alt"></i>
                        <span>${thread.name}</span>
                        <small style="display: block; font-size: 10px; color: var(--text-secondary);">${createdDate}</small>
                    `;
                    
                    threadItem.addEventListener('click', () => loadThread(thread.id, thread.name));
                    
                    threadList.appendChild(threadItem);
                });
            }
            
            // Re-add click listeners to thread items
            document.querySelectorAll('.thread-item').forEach(item => {
                if (!item.dataset.id) return; // Skip items without ID (like error messages)
                
                item.addEventListener('click', function() {
                    const threadId = this.dataset.id;
                    const threadName = this.querySelector('span').textContent;
                    
                    if (threadId === 'new') {
                        createNewThread();
                    } else {
                        loadThread(threadId, threadName);
                    }
                });
            });
            
            // Add delete buttons to threads
            addDeleteButtonToThreads();
            
            // Restore scroll position if in silent mode
            if (silent) {
                threadList.scrollTop = scrollPos;
            }
            
        } catch (error) {
            console.error('Error loading threads:', error);
            if (!silent) {
                threadList.innerHTML = `
                    <div class="thread-item active" data-id="new">
                        <i class="fas fa-comment-alt"></i>
                        <span>Untitled</span>
                    </div>
                    <div class="thread-item" style="color: var(--error-color);">
                        <i class="fas fa-exclamation-circle"></i>
                        <span>Error loading threads</span>
                    </div>
                `;
            }
        }
    }
    
    async function loadThread(threadId, threadName) {
        console.log("loadThread function called", { threadId, threadName });
        
        try {
            // First ensure chatMessages exists before using it
            if (!chatMessages) {
                console.error("chatMessages element not found");
                throw new Error("chatMessages element not found");
            }
            
            // Show loading indicator
            chatMessages.innerHTML = `
                <div class="message bot-message">
                    <i class="fas fa-spinner fa-spin"></i> Loading thread "${threadName}"...
                </div>
            `;
            
            // Make sure these elements exist before setting properties
            if (!threadTitleText) {
                console.error("threadTitleText element not found");
                throw new Error("threadTitleText element not found");
            }
            
            // Update UI state immediately
            currentThreadId = threadId.toString();
            threadTitleText.textContent = threadName;
            
            // Update active state in sidebar if threadList exists
            if (threadList) {
                const threadItems = document.querySelectorAll('.thread-item');
                threadItems.forEach(item => {
                    item.classList.remove('active');
                    if (item.dataset.id === currentThreadId) {
                        item.classList.add('active');
                    }
                });
            }
            
            // If it's a new thread, just show welcome message
            if (threadId === 'new') {
                createNewThread();
                return;
            }
            
            // Get thread data from server
            const response = await fetch(`/api/get_thread/${threadId}`);
            console.log("Load thread response status:", response.status);
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            
            const data = await response.json();
            console.log("Loaded thread data:", {
                success: data.success,
                hasMessages: data.thread && Array.isArray(data.thread.messages),
                messageCount: data.thread && data.thread.messages ? data.thread.messages.length : 0
            });
            
            // Clear current messages
            chatMessages.innerHTML = '';
            
            if (data.success && data.thread && Array.isArray(data.thread.messages)) {
                // Update the model selector if necessary
                if (data.thread.model && modelDropdown) {
                    const modelOption = Array.from(modelDropdown.options).find(option => option.value === data.thread.model);
                    if (modelOption) {
                        modelDropdown.value = data.thread.model;
                        
                        // Check if current-model exists
                        if (currentModel) {
                            currentModel.textContent = data.thread.model;
                        }
                    }
                }
                
                // Store the full thread data
                chatHistory = data.thread.messages;
                
                // Set last saved content for auto-save
                lastSavedContent = JSON.stringify(chatHistory);
                threadModified = false;
                
                // Display thread information
                const threadInfoDiv = document.createElement('div');
                threadInfoDiv.className = 'system-message';
                
                // Format dates
                const createdDate = data.thread.created_at 
                    ? new Date(data.thread.created_at).toLocaleString() 
                    : 'Unknown date';
                    
                threadInfoDiv.innerHTML = `
                    <strong>Thread:</strong> ${data.thread.name}<br>
                    <strong>Created:</strong> ${createdDate}<br>
                    ${data.thread.model ? `<strong>Model:</strong> ${data.thread.model}` : ''}
                `;
                chatMessages.appendChild(threadInfoDiv);
                
                // Display all messages
                for (const message of chatHistory) {
                    if (message.role === 'system') {
                        // System message
                        const systemMsg = document.createElement('div');
                        systemMsg.className = message.isError ? 'error-message' : 'system-message';
                        systemMsg.innerHTML = formatMessage(message.content);
                        chatMessages.appendChild(systemMsg);
                    } else if (message.role === 'user') {
                        // User message
                        appendMessage(message.content, 'user');
                    } else if (message.role === 'assistant') {
                        // Assistant message
                        appendMessage(message.content, 'bot');
                    }
                }
                
                // Set model connection state if there are model-specific messages
                isModelConnected = chatHistory.some(msg => 
                    msg.role === 'system' && 
                    msg.content.includes('Connected to') &&
                    msg.isConnection === true
                );
            } else {
                // Show a generic message if thread data is invalid
                const systemMessage = document.createElement('div');
                systemMessage.className = 'system-message';
                systemMessage.textContent = `Loaded thread: "${threadName}", but no valid messages were found.`;
                chatMessages.appendChild(systemMessage);
                
                chatHistory = [{ role: 'system', content: `Loaded thread: "${threadName}"` }];
                
                // Reset model connection state
                isModelConnected = false;
            }
            
            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
        } catch (error) {
            console.error('Error loading thread:', error);
            
            // Show error message if chatMessages exists
            if (chatMessages) {
                chatMessages.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-circle"></i> Error loading thread: ${error.message}
                    </div>
                `;
            }
            
            chatHistory = [{ 
                role: 'system', 
                content: `Error loading thread: ${error.message}`,
                isError: true
            }];
            
            // Reset model connection state
            isModelConnected = false;
        }
    }
    // Function to load small models - add this to your script.js file or update the existing function
async function loadSmallModels() {
    const smallModelsContent = document.getElementById('small-models-content');
    if (!smallModelsContent) return;
    
    smallModelsContent.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Loading small models...</p>';
    
    try {
        const response = await fetch('/api/list_small_models');
        
        if (!response.ok) {
            throw new Error('Failed to fetch small models');
        }
        
        const data = await response.json();
        
        if (data.models && data.models.length > 0) {
            let html = '<div class="small-models-grid">';
            
            for (const model of data.models) {
                const isInstalled = model.installed;
                const buttonHtml = isInstalled ?
                    `<button class="modal-install-btn" disabled><i class="fas fa-check"></i> Installed</button>` :
                    `<button class="modal-install-btn" onclick="installModelFromInfo('${model.name}')"><i class="fas fa-download"></i> Install</button>`;
                
                html += `
                    <div class="small-model-card">
                        <h4>${model.name}</h4>
                        <p>${model.description}</p>
                        <div class="size"><i class="fas fa-weight-hanging"></i> ${model.size}</div>
                        ${buttonHtml}
                    </div>
                `;
            }
            
            html += '</div>';
            smallModelsContent.innerHTML = html;
        } else {
            smallModelsContent.innerHTML = '<p>No small models available.</p>';
        }
        
        // Also update the troubleshooting modal if it's open
        updateTroubleshootingSmallModels(data.models);
        
    } catch (error) {
        smallModelsContent.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i> 
                Error loading small models: ${error.message}
            </div>
        `;
    }
}

// Update the small models options in the troubleshooting dialog
function updateTroubleshootingSmallModels(models) {
    const smallModelsOptions = document.getElementById('small-models-options');
    if (!smallModelsOptions) return;
    
    if (models && models.length > 0) {
        let html = '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;">';
        
        for (const model of models) {
            if (!model.installed) {
                html += `
                    <button class="modal-install-btn" onclick="trySpecificModel('${model.name}')">
                        <i class="fas fa-cube"></i> Try ${model.name} (${model.size})
                    </button>
                `;
            }
        }
        
        html += '</div>';
        smallModelsOptions.innerHTML = html;
    } else {
        smallModelsOptions.innerHTML = `
            <button class="modal-install-btn" onclick="tryAlternativeModel()">
                <i class="fas fa-cube"></i> Try Tiny Model Instead
            </button>
        `;
    }
}
    
    // Function to initialize auto-save with improved triggers
    function initAutoSave() {
        console.log("Initializing auto-save functionality");
        
        // Start the auto-save timer
        startAutoSaveTimer();
        
        // Add auto-save toggle to the UI
        addAutoSaveToggle();
        
        // Add additional triggers for auto-save
        addExtraAutoSaveTriggers();
    }

    // Function to add extra auto-save triggers beyond the timer
    function addExtraAutoSaveTriggers() {
        // 1. Save when window/tab is about to be closed
        window.addEventListener('beforeunload', function(e) {
            if (threadModified && chatHistory.length > 0) {
                // Attempt a synchronous save if possible
                try {
                    // Use navigator.sendBeacon for asynchronous saving before page unload
                    if (navigator.sendBeacon) {
                        const threadName = threadTitleText.textContent;
                        let currentModelText = currentModel ? currentModel.textContent : "unknown";
                        
                        const threadData = {
                            name: threadName,
                            data: chatHistory,
                            saved_at: new Date().toISOString(),
                            model: currentModelText
                        };
                        
                        if (currentThreadId && currentThreadId !== 'new') {
                            threadData.id = currentThreadId;
                        }
                        
                        navigator.sendBeacon(
                            '/api/save_thread', 
                            new Blob([JSON.stringify(threadData)], {type: 'application/json'})
                        );
                        
                        console.log("Beacon sent to save thread before unload");
                    }
                } catch (error) {
                    console.error("Error in beforeunload save:", error);
                }
            }
        });
        
        // 2. Save when browser visibility changes (user switches tabs/windows)
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'hidden' && threadModified && chatHistory.length > 0) {
                console.log("Page hidden, triggering auto-save");
                autoSaveThread();
            }
        });
        
        // 3. Save periodically when user is inactive
        let userActivityTimer;
        const userActivityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        
        // Reset the timer on user activity
        userActivityEvents.forEach(event => {
            document.addEventListener(event, function() {
                clearTimeout(userActivityTimer);
                userActivityTimer = setTimeout(() => {
                    if (threadModified && chatHistory.length > 0) {
                        console.log("User inactive, triggering auto-save");
                        autoSaveThread();
                    }
                }, 10000); // 10 seconds of inactivity
            }, true);
        });
    }

    // Modified startAutoSaveTimer with more frequent saves for new threads
    function startAutoSaveTimer() {
        // Clear any existing timer
        if (autoSaveTimer) {
            clearInterval(autoSaveTimer);
        }
        
        // Set up new timer if auto-save is enabled
        if (autoSaveEnabled) {
            // More frequent checks - every 15 seconds instead of 30
            autoSaveInterval = 15000; // 15 seconds for all threads
            
            autoSaveTimer = setInterval(() => {
                if (chatHistory.length > 0 && threadModified) {
                    console.log("Auto-save timer triggered");
                    autoSaveThread();
                }
            }, autoSaveInterval);
            
            console.log(`Auto-save timer started, interval: ${autoSaveInterval}ms`);
        }
    }

    // Function to add auto-save toggle to the UI (optional)
    function addAutoSaveToggle() {
        // This is optional - add a toggle switch to enable/disable auto-save
        const chatHeader = document.querySelector('.chat-header .chat-actions');
        
        if (chatHeader) {
            const autoSaveToggle = document.createElement('div');
            autoSaveToggle.className = 'auto-save-toggle';
            autoSaveToggle.innerHTML = `
                <label class="switch">
                    <input type="checkbox" id="auto-save-checkbox" ${autoSaveEnabled ? 'checked' : ''}>
                    <span class="slider round"></span>
                </label>
                <span class="toggle-label">Auto-save</span>
            `;
            
            chatHeader.insertBefore(autoSaveToggle, chatHeader.firstChild);
            
            // Add event listener to the checkbox
            const checkbox = document.getElementById('auto-save-checkbox');
            if (checkbox) {
                checkbox.addEventListener('change', function() {
                    autoSaveEnabled = this.checked;
                    console.log(`Auto-save ${autoSaveEnabled ? 'enabled' : 'disabled'}`);
                    
                    if (autoSaveEnabled) {
                        startAutoSaveTimer();
                        // Show a small notification
                        showNotification('Auto-save enabled');
                    } else {
                        clearInterval(autoSaveTimer);
                        autoSaveTimer = null;
                        // Show a small notification
                        showNotification('Auto-save disabled');
                    }
                });
            }
        }
    }
    
    // Enhanced markThreadModified function to be more aggressive about triggering saves
    function markThreadModified() {
        threadModified = true;
        console.log("Thread marked as modified. Current chatHistory length:", chatHistory.length);
        
        // Force an update of the last checked content to ensure comparison works
        lastCheckedContent = JSON.stringify(chatHistory);
        
        // If this is the first message in a new thread, save quickly
        if (currentThreadId === 'new' && chatHistory.length === 1) {
            // Wait a short moment to allow any other immediate changes
            setTimeout(() => {
                if (autoSaveEnabled && threadModified) {
                    console.log("First message in new thread, triggering quick auto-save");
                    autoSaveThread();
                }
            }, 2000); // 2 seconds after first message
        }
    }

    // COMPLETELY REVISED: autoSaveThread function with improved debugging and thread handling
    async function autoSaveThread() {
        // Debug log to confirm function call
        console.log("autoSaveThread called at " + new Date().toLocaleTimeString());
        
        // Skip if there's no content to save
        if (chatHistory.length === 0) {
            console.log("No chat history to save, skipping auto-save");
            return;
        }
        
        // Create a string representation of the current chat content
        const currentContent = JSON.stringify(chatHistory);
        
        // Skip if content hasn't changed since last save
        if (currentContent === lastSavedContent && currentThreadId !== 'new') {
            console.log("Content unchanged since last save, skipping auto-save");
            return;
        }
        
        console.log(`Auto-saving thread: ${threadTitleText.textContent} (ID: ${currentThreadId})`);
        console.log(`Chat history contains ${chatHistory.length} messages`);
        
        // For new threads, use the first few words of the first user message as title
        let threadName = threadTitleText.textContent;
        if (threadName === 'Untitled' && chatHistory.length > 0) {
            // Find the first user message
            const firstUserMessage = chatHistory.find(msg => msg.role === 'user');
            if (firstUserMessage) {
                // Use the first 4-5 words as the title (up to 30 chars)
                const words = firstUserMessage.content.split(' ');
                const titleWords = words.slice(0, Math.min(5, words.length));
                let autoTitle = titleWords.join(' ').trim();
                
                // Limit length and add ellipsis if needed
                if (autoTitle.length > 30) {
                    autoTitle = autoTitle.substring(0, 27) + '...';
                }
                
                // Update the thread title if we generated a valid title
                if (autoTitle && autoTitle.length > 0) {
                    threadName = autoTitle;
                    threadTitleText.textContent = threadName;
                    
                    // Update the thread in sidebar if it exists
                    const activeThreadItem = document.querySelector('.thread-item.active');
                    if (activeThreadItem) {
                        const threadItemSpan = activeThreadItem.querySelector('span');
                        if (threadItemSpan) {
                            threadItemSpan.textContent = threadName;
                        }
                    }
                }
            }
        }
        
        try {
            // Show a subtle saving indicator
            const existingIndicator = document.querySelector('.saving-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }
            
            const savingIndicator = document.createElement('div');
            savingIndicator.className = 'saving-indicator';
            savingIndicator.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Saving...';
            document.body.appendChild(savingIndicator);
            
            // Make it visible with a small delay for animation
            setTimeout(() => {
                savingIndicator.classList.add('visible');
            }, 10);
            
            // Get the current model
            let currentModelText = "unknown";
            if (currentModel) {
                currentModelText = currentModel.textContent;
            }
            
            // Create a DEEP COPY of the chat history to avoid any reference issues
            const chatHistoryCopy = JSON.parse(JSON.stringify(chatHistory));
            
            // Create thread data object with FULL chat history
            const threadData = {
                name: threadName,
                data: chatHistoryCopy,
                saved_at: new Date().toISOString(),
                model: currentModelText
            };
            
            // IMPORTANT: Only include ID if it's not 'new'
            if (currentThreadId && currentThreadId !== 'new') {
                threadData.id = currentThreadId;
                console.log(`Including existing thread ID in request: ${currentThreadId}`);
            } else {
                console.log("Creating new thread (no ID included in request)");
            }
            
            console.log(`Auto-save request prepared with ${chatHistoryCopy.length} messages`);
            
            // Make API call to save the thread
            const response = await fetch('/api/save_thread', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(threadData)
            });
            
            console.log(`Save API response status: ${response.status}`);
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            // Get the response text first for debugging
            const responseText = await response.text();
            console.log("Raw response:", responseText);
            
            // Parse the JSON response
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                console.error("Failed to parse response JSON:", e);
                throw new Error("Invalid JSON response from server");
            }
            
            if (result.success) {
                console.log("Thread auto-saved successfully");
                console.log(`Server returned thread ID: ${result.thread_id}`);
                
                // Update thread ID if it's a new thread or if it changed
                if ((currentThreadId === 'new' || !currentThreadId) && result.thread_id) {
                    currentThreadId = result.thread_id;
                    console.log(`Updated currentThreadId to: ${currentThreadId}`);
                    
                    // Show a quiet notification for new threads
                    showNotification('Thread saved automatically');
                }
                
                // Update last saved content
                lastSavedContent = currentContent;
                threadModified = false;
                
                // Silently update threads list only occasionally to avoid too many updates
                const now = Date.now();
                if (!lastThreadListUpdate || (now - lastThreadListUpdate > 60000)) { // Once a minute max
                    await loadThreads(true); // Pass true to prevent UI flashing
                    lastThreadListUpdate = now;
                }
                
                // Update saving indicator to show success
                savingIndicator.innerHTML = '<i class="fas fa-check"></i> Saved';
                setTimeout(() => {
                    savingIndicator.classList.remove('visible');
                    // Remove the element after fade out
                    setTimeout(() => {
                        savingIndicator.remove();
                    }, 300);
                }, 1000);
            } else {
                throw new Error(result.message || 'Unknown error');
            }
        } catch (error) {
            console.error('Error in auto-save:', error);
            
            // Show error in console with stack trace
            console.error(error.stack);
            
            // Update saving indicator to show error
            const savingIndicator = document.querySelector('.saving-indicator');
            if (savingIndicator) {
                savingIndicator.innerHTML = '<i class="fas fa-exclamation-circle"></i> Save failed';
                savingIndicator.style.backgroundColor = 'rgba(220, 53, 69, 0.7)'; // Error red
                setTimeout(() => {
                    savingIndicator.classList.remove('visible');
                    // Remove the element after fade out
                    setTimeout(() => {
                        savingIndicator.remove();
                    }, 300);
                }, 2000);
            }
        }
    }

    // Helper function to show a temporary notification
    function showNotification(message, duration = 2000) {
        // Create notification element if it doesn't exist
        let notification = document.querySelector('.auto-save-notification');
        
        if (!notification) {
            notification = document.createElement('div');
            notification.className = 'auto-save-notification';
            document.body.appendChild(notification);
        }
        
        // Set message and show
        notification.textContent = message;
        notification.classList.add('show');
        
        // Hide after duration
        setTimeout(() => {
            notification.classList.remove('show');
        }, duration);
    }
    
    // Function to create and show a delete confirmation modal
    function showDeleteConfirmation(threadId, threadName) {
        // Create the modal container
        const modal = document.createElement('div');
        modal.className = 'delete-confirmation-modal';
        
        // Create the modal content
        modal.innerHTML = `
            <div class="delete-confirmation-content">
                <h3><i class="fas fa-exclamation-triangle"></i> Delete Thread</h3>
                <p>Are you sure you want to delete the thread <strong>"${threadName}"</strong>?</p>
                <p>This action cannot be undone.</p>
                <div class="delete-confirmation-buttons">
                    <button class="delete-cancel-btn">Cancel</button>
                    <button class="delete-confirm-btn">Delete</button>
                </div>
            </div>
        `;
        
        // Add to body
        document.body.appendChild(modal);
        
        // Add event listeners
        const cancelBtn = modal.querySelector('.delete-cancel-btn');
        const confirmBtn = modal.querySelector('.delete-confirm-btn');
        
        // Return a promise that resolves when the user makes a choice
        return new Promise((resolve) => {
            // Cancel button
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(false);
            });
            
            // Confirm button
            confirmBtn.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(true);
            });
            
            // Click outside to cancel
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    resolve(false);
                }
            });
        });
    }

    // Function to delete thread
    async function deleteThread(threadId, threadName) {
        console.log(`Attempting to delete thread: ${threadName} (ID: ${threadId})`);
        
        // Show confirmation modal
        const confirmed = await showDeleteConfirmation(threadId, threadName);
        
        if (!confirmed) {
            console.log("Thread deletion cancelled by user");
            return false;
        }
        
        try {
            // Show loading indicator
            showNotification(`Deleting thread "${threadName}"...`, 60000); // Long timeout in case it takes time
            
            // Make API call to delete the thread
            const response = await fetch(`/api/delete_thread/${threadId}`, {
                method: 'DELETE'
            });
            
            console.log(`Delete API response status: ${response.status}`);
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            // Parse the response
            const result = await response.json();
            
            if (result.success) {
                console.log(`Thread deleted successfully: ${threadName} (ID: ${threadId})`);
                
                // Hide the loading notification
                const notification = document.querySelector('.auto-save-notification');
                if (notification && notification.classList.contains('show')) {
                    notification.classList.remove('show');
                }
                
                // Check if we're currently viewing the deleted thread
                if (currentThreadId === threadId) {
                    // Create a new thread as we just deleted the current one
                    createNewThread();
                    
                    // Show notification
                    showNotification(`Thread "${threadName}" has been deleted`, 3000);
                } else {
                    // Just reload the thread list
                    await loadThreads();
                    
                    // Show notification
                    showNotification(`Thread "${threadName}" has been deleted`, 3000);
                }
                
                return true;
            } else {
                throw new Error(result.message || 'Unknown error');
            }
        } catch (error) {
            console.error('Error deleting thread:', error);
            
            // Hide the loading notification
            const notification = document.querySelector('.auto-save-notification');
            if (notification && notification.classList.contains('show')) {
                notification.classList.remove('show');
            }
            
            // Show error notification
            showNotification(`Failed to delete thread: ${error.message}`, 5000);
            return false;
        }
    }

    // Expose delete function globally
    window.deleteThread = deleteThread;

    // Function to add delete buttons to thread items
    function addDeleteButtonToThreads() {
        // Find all thread items except "new" thread
        const threadItems = document.querySelectorAll('.thread-item:not([data-id="new"])');
        
        threadItems.forEach(item => {
            // Skip if already has delete button
            if (item.querySelector('.delete-thread-btn')) {
                return;
            }
            
            // Get thread info
            const threadId = item.dataset.id;
            const threadName = item.querySelector('span').textContent;
            
            // Create delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-thread-btn';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.title = `Delete "${threadName}"`;
            deleteBtn.setAttribute('aria-label', `Delete thread ${threadName}`);
            
            // Add event listener
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent thread from being loaded when deleting
                e.preventDefault();
                await deleteThread(threadId, threadName);
            });
            
            // Append button to thread item
            item.appendChild(deleteBtn);
        });
    }
    
    // Function to initialize debug helpers
    function initDebugHelpers() {
        console.log("Initializing debug helpers for chat history tracking");
        setupChatHistoryObserver();
        
        // Add event listener to debug potential issues with chatHistory
        window.addEventListener('storage', function(e) {
            if (e.key === 'debugChatHistory') {
                console.log("Current chat history:", chatHistory);
                console.log("Chat modified:", threadModified);
                console.log("Last saved content length:", lastSavedContent.length);
            }
        });
    }
    
    // Function to observe chat history changes
    function setupChatHistoryObserver() {
        // We'll check if chatHistory changed every 5 seconds
        setInterval(() => {
            if (chatHistory.length > 0) {
                // Create a string representation of the current chat content
                const currentContent = JSON.stringify(chatHistory);
                
                // Check if it's changed since last check
                if (currentContent !== lastCheckedContent) {
                    console.log("Chat history changed since last check. Marking as modified.");
                    markThreadModified();
                    lastCheckedContent = currentContent;
                }
            }
        }, 5000);
    }
    
    // Function to log the current state - you can call this from the console
    function debugState() {
        console.log('--- CURRENT STATE DEBUG ---');
        console.log(`Current Thread ID: ${currentThreadId}`);
        console.log(`Thread Title: ${threadTitleText.textContent}`);
        console.log(`Chat History Length: ${chatHistory.length}`);
        console.log(`Thread Modified: ${threadModified}`);
        console.log(`Last Saved Content Length: ${lastSavedContent.length}`);
        console.log(`Model Connected: ${isModelConnected}`);
        console.log('--- END STATE DEBUG ---');
    }

    // Add this to window so you can call it from the browser console
    window.debugState = debugState;

    // Function to manually trigger auto-save - you can call this from the console
    function triggerAutoSave() {
        console.log('Manually triggering auto-save...');
        
        // Force the thread to be considered modified
        threadModified = true;
        
        // Call auto-save
        autoSaveThread();
    }

    // Add this to window so you can call it from the browser console
    window.triggerAutoSave = triggerAutoSave;
    
    // Add some helpful keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl+Enter or Cmd+Enter to send message
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            if (document.activeElement === userInput) {
                sendMessage();
            }
        }
        
        // Esc to clear input
        if (e.key === 'Escape') {
            if (document.activeElement === userInput) {
                userInput.value = '';
            } else if (saveThreadModal.style.display === 'block') {
                closeModal();
            }
        }
    });
    
    // Additional debugging for button clicks
    document.body.addEventListener('click', function(e) {
        // Find closest button parent if any
        const button = e.target.closest('button');
        if (button) {
            console.log(`Button clicked: ${button.id || 'unnamed button'}`);
        }
    }, true);
    
    // Expose the network troubleshooting and model installation functions to global scope
    window.showNetworkTroubleshootingDialog = showNetworkTroubleshootingDialog;
    window.trySpecificModel = trySpecificModel;
    window.tryAlternativeModel = tryAlternativeModel;
    window.checkModelInstallation = checkModelInstallation;
    window.confirmModelInstall = confirmModelInstall;
    window.cancelModelInstall = cancelModelInstall;
});