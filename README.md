LLM Chat: Advanced Conversational AI Interface
Overview
LLM Chat is a sophisticated, feature-rich web application for interacting with large language models (LLMs) using Ollama. The application provides a seamless, user-friendly interface for managing conversations, saving threads, and switching between different AI models.
Features
🤖 Model Management

Automatic model installation
Model connection and switching
Integrated model information and status checking
Support for multiple models (DeepSeek variants)

💬 Chat Capabilities

Real-time message streaming
Markdown and code block support
Conversation history tracking
Thread saving and management

🔧 Advanced Functionality

Auto-save with configurable settings
Network troubleshooting
Responsive design
Keyboard shortcuts

Prerequisites

Python 3.8+
Ollama installed and running
Modern web browser

Technology Stack

Backend: FastAPI (Python)
Frontend: HTML5, CSS3, JavaScript
Libraries:

FastAPI
Requests
Uvicorn
Jinja2 Templates



Installation
1. Clone the Repository
git clone https://github.com/Nilesh-Pandeyy/multimodel_llm.git
cd llm-chat
2. Create Virtual Environment
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
3. Install Dependencies
pip install -r requirements.txt
4. Ensure Ollama is Running
Make sure Ollama is installed and running on your system.
5. Start the Application
uvicorn main:app --reload
Configuration
Models
Modify the MODELS list in main.py to include your preferred models:
pythonCopyMODELS = ["deepseek-r1:1.5b", "deepseek-r1:8b", "deepseek-r1:14b", "deepseek-r1:32b", "deepseek-r1:70b"]
Usage
Connecting to a Model

Select a model from the dropdown
Click "Connect"
Start chatting!

Saving Threads

Manual save: Click the "Save" button
Auto-save: Toggle the auto-save switch in the chat interface

Keyboard Shortcuts

Ctrl+Enter (or Cmd+Enter): Send message
Esc: Clear input or close modal

Troubleshooting
Model Installation Issues

Check Ollama is running
Verify internet connection
Use command line: ollama pull model-name

Network Connectivity
The app includes built-in network troubleshooting:

DNS server checks
Alternative model suggestions
Firewall configuration hints