
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import requests
import json
import platform
import logging
import os
import socket
import subprocess
from datetime import datetime
import uvicorn
from pydantic import BaseModel
from typing import Optional, Dict, Any, Union, List
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
app = FastAPI(title="LLM Streaming API and Chat Interface")

# Add CORS middleware to allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files directory
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="templates")

# Available models
MODELS = ["deepseek-r1:1.5b", "deepseek-r1:8b", "deepseek-r1:14b", "deepseek-r1:32b","deepseek-r1:70b"]

# Request models
class GenerateRequest(BaseModel):
    model: str
    prompt: str
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 2000
    stream_speed: Optional[str] = "medium"  # "slow", "medium", "fast"
    additional_params: Optional[Dict[str, Any]] = None
'''
class ThreadSaveRequest(BaseModel):
    name: str
    data: List[Dict[str, str]]'
'''
class ThreadSaveRequest(BaseModel):
    name: str
    data: List[Dict[str, Any]]
    saved_at: Optional[str] = None
    model: Optional[str] = None
    id: Optional[str] = None 

class ModelCheckRequest(BaseModel):
    model: str

class ModelInstallRequest(BaseModel):
    model: str


    
# Main route for HTML interface
@app.get("/", response_class=HTMLResponse)
async def get_chat_interface(request: Request):
    """Serve the main chat interface."""
    return templates.TemplateResponse(
        "index.html", 
        {"request": request, "models": MODELS, "default_model": "deepseek-r1:1.5b"}
    )

# Original API endpoints from your FastAPI application
@app.post("/api/generate")
async def generate(request: GenerateRequest):
    """
    Stream responses from the LLM API with controlled pacing.
    """
    # Define the target LLM API endpoint
    url = "http://localhost:11434/api/generate"
    
    # Prepare the request payload
    payload = {
        "model": request.model,
        "prompt": request.prompt,
        "temperature": request.temperature,
        "max_tokens": request.max_tokens,
    }
    
    # Add any additional parameters if provided
    if request.additional_params:
        payload.update(request.additional_params)
    
    headers = {"Content-Type": "application/json"}
    
    # Your existing stream control logic
    delay_map = {
        "slow": 0.05,      # 50ms between chunks
        "medium": 0.02,    # 20ms between chunks
        "fast": 0.01       # 10ms between chunks
    }
    chunk_delay = delay_map.get(request.stream_speed, 0.02)
    
    def chunk_text(text, avg_chunk_size=3):
        """Split text into smaller chunks for smoother streaming."""
        parts = re.split(r'(\s+)', text)
        chunks = []
        current_chunk = ""
        
        for part in parts:
            current_chunk += part
            # Once we reach desired average size, add to chunks
            if len(current_chunk) >= avg_chunk_size:
                chunks.append(current_chunk)
                current_chunk = ""
        
        # Don't forget any remaining text
        if current_chunk:
            chunks.append(current_chunk)
            
        return chunks
    
    async def generate_stream():
        with requests.post(url, headers=headers, json=payload, stream=True) as response:
            if response.status_code != 200:
                yield json.dumps({"error": f"API Error: {response.status_code}"}) + "\n"
                return
            
            accumulated_text = ""
            buffer = ""
            
            for line in response.iter_lines():
                if line:
                    try:
                        json_data = json.loads(line.decode('utf-8'))
                        if "response" in json_data:
                            text_chunk = json_data["response"]
                            buffer += text_chunk
                            
                            # Process buffer in smaller chunks for smoother streaming
                            if len(buffer) > 0:
                                small_chunks = chunk_text(buffer)
                                for small_chunk in small_chunks:
                                    accumulated_text += small_chunk
                                    yield small_chunk
                                    await asyncio.sleep(chunk_delay)  # Control the pace
                                buffer = ""
                            
                    except json.JSONDecodeError:
                        yield json.dumps({"error": "Failed to decode response"}) + "\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/plain"
    )

@app.post("/api/generate_raw")
async def generate_raw(request: GenerateRequest):
    """
    Stream the raw JSON responses from the LLM API.
    """
    # Define the target LLM API endpoint
    url = "http://localhost:11434/api/generate"
    
    # Prepare the request payload
    payload = {
        "model": request.model,
        "prompt": request.prompt,
        "temperature": request.temperature,
        "max_tokens": request.max_tokens,
    }
    
    if request.additional_params:
        payload.update(request.additional_params)
    
    headers = {"Content-Type": "application/json"}
    
    async def generate_stream():
        with requests.post(url, headers=headers, json=payload, stream=True) as response:
            if response.status_code != 200:
                yield json.dumps({"error": f"API Error: {response.status_code}"}) + "\n"
                return
            
            for line in response.iter_lines():
                if line:
                    yield line + b"\n"
                    await asyncio.sleep(0.01)  
    
    return StreamingResponse(
        generate_stream(),
        media_type="application/x-ndjson"
    )

# New API endpoints for the chat interface
@app.post("/api/send_message")
async def send_message(request: GenerateRequest):
    """Proxy the message to the LLM service and stream the response."""
    # Forward the request to our internal API
    url = "http://localhost:11434/api/generate"
    
    # Prepare the request payload
    payload = {
        "model": request.model,
        "prompt": request.prompt,
        "temperature": request.temperature,
        "max_tokens": request.max_tokens,
    }
    
    # Add any additional parameters if provided
    if request.additional_params:
        payload.update(request.additional_params)
    
    headers = {"Content-Type": "application/json"}
    
    async def generate_stream():
        with requests.post(url, headers=headers, json=payload, stream=True) as response:
            if response.status_code != 200:
                yield json.dumps({"error": f"API Error: {response.status_code}"}) + "\n"
                return
            
            for line in response.iter_lines():
                if line:
                    try:
                        json_data = json.loads(line.decode('utf-8'))
                        if "response" in json_data:
                            yield json_data["response"]
                    except json.JSONDecodeError:
                        yield json.dumps({"error": "Failed to decode response"}) + "\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/plain"
    )
# Create a directory for storing threads if it doesn't exist
THREADS_DIR = "threads"
os.makedirs(THREADS_DIR, exist_ok=True)


@app.post("/api/save_thread")
async def save_thread(request: ThreadSaveRequest):
    """Save the current thread with a name and all chat history."""
    try:
        logger.info(f"Saving thread: {request.name} with {len(request.data)} messages")
        
        # Determine thread ID - use existing or create new
        thread_id = request.id if request.id else str(int(datetime.now().timestamp()))
        
        if request.id:
            logger.info(f"Updating existing thread with ID: {thread_id}")
        else:
            logger.info(f"Creating new thread with ID: {thread_id}")
        
        # Create a thread object with metadata
        thread = {
            "id": thread_id,
            "name": request.name,
            "created_at": request.saved_at if request.saved_at else datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "model": request.model or "unknown",
            "messages": request.data
        }
        
        # Save to a file - in a real app, you'd use a database
        filename = os.path.join(THREADS_DIR, f"{thread_id}.json")
        with open(filename, 'w') as f:
            json.dump(thread, f, indent=2)
            
        logger.info(f"Thread saved successfully: {thread['name']} (ID: {thread_id}) with {len(request.data)} messages")
            
        return JSONResponse({
            "success": True, 
            "message": f"Thread '{request.name}' saved",
            "thread_id": thread_id
        })
    except Exception as e:
        # Log the error
        logger.error(f"Error saving thread: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return JSONResponse(
            {"success": False, "message": f"Failed to save thread: {str(e)}"},
            status_code=500
        )

@app.get("/api/get_thread/{thread_id}")
async def get_thread(thread_id: str):
    """Get a specific thread by ID with full chat history."""
    try:
        # In a real app, you'd query a database
        file_path = os.path.join(THREADS_DIR, f"{thread_id}.json")
        
        if not os.path.exists(file_path):
            print(f"Thread not found: {thread_id}")
            return JSONResponse(
                {"success": False, "message": "Thread not found"},
                status_code=404
            )
            
        with open(file_path, 'r') as f:
            thread = json.load(f)
            
        print(f"Thread loaded: {thread['name']} (ID: {thread_id}) with {len(thread['messages'])} messages")
            
        return JSONResponse({
            "success": True,
            "thread": thread
        })
    except Exception as e:
        print(f"Error retrieving thread {thread_id}: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            {"success": False, "message": f"Error loading thread: {str(e)}"},
            status_code=500
        )

@app.get("/api/get_threads")
async def get_threads():
    """Get all saved threads."""
    threads = []
    
    try:
        # In a real app, you'd query a database
        for filename in os.listdir(THREADS_DIR):
            if filename.endswith(".json"):
                file_path = os.path.join(THREADS_DIR, filename)
                with open(file_path, 'r') as f:
                    thread = json.load(f)
                    threads.append({
                        "id": thread["id"],
                        "name": thread["name"],
                        "created_at": thread["created_at"]
                    })
        
        # Sort threads by creation time (newest first)
        threads.sort(key=lambda x: x["created_at"], reverse=True)
        
        return JSONResponse(threads)
    except Exception as e:
        # If there's an error or no threads, return empty list
        print(f"Error getting threads: {str(e)}")
        return JSONResponse([])
@app.delete("/api/delete_thread/{thread_id}")
async def delete_thread(thread_id: str):
    """Delete a specific thread by ID."""
    try:
        logger.info(f"Attempting to delete thread with ID: {thread_id}")
        
        # Check if thread file exists
        file_path = os.path.join(THREADS_DIR, f"{thread_id}.json")
        
        if not os.path.exists(file_path):
            logger.warning(f"Thread not found: {thread_id}")
            return JSONResponse(
                {"success": False, "message": "Thread not found"},
                status_code=404
            )
        
        # Read thread info for logging before deletion
        try:
            with open(file_path, 'r') as f:
                thread_data = json.load(f)
                thread_name = thread_data.get('name', 'Unknown')
        except Exception as e:
            thread_name = "Unknown"
            logger.error(f"Error reading thread before deletion: {str(e)}")
        
        # Delete the thread file
        os.remove(file_path)
        
        logger.info(f"Thread deleted successfully: {thread_name} (ID: {thread_id})")
        
        return JSONResponse({
            "success": True,
            "message": f"Thread deleted successfully",
            "thread_id": thread_id
        })
    except Exception as e:
        logger.error(f"Error deleting thread {thread_id}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return JSONResponse(
            {"success": False, "message": f"Error deleting thread: {str(e)}"},
            status_code=500
        )
    

@app.post("/api/check_model")
async def check_model(request: ModelCheckRequest):
    """
    Check if a model is available locally in Ollama.
    """
    logger.info(f"Checking if model exists: {request.model}")
    
    try:
        # Call Ollama API to list models
        response = requests.get("http://localhost:11434/api/tags")
        
        if response.status_code != 200:
            logger.error(f"Failed to get models list: {response.status_code}")
            return {"exists": False, "error": f"Failed to check models: {response.status_code}"}
        
        models_data = response.json()
        models = [model["name"] for model in models_data.get("models", [])]
        
        # Check if the requested model exists
        model_exists = request.model in models
        logger.info(f"Model {request.model} exists: {model_exists}")
        
        return {"exists": model_exists}
        
    except Exception as e:
        logger.error(f"Error checking model: {str(e)}")
        return {"exists": False, "error": str(e)}

@app.post("/api/install_model")
async def install_model(request: ModelInstallRequest):
    """
    Install a model using Ollama pull command.
    """
    logger.info(f"Installing model: {request.model}")
    
    try:
        # Check if Ollama service is running
        try:
            health_check = requests.get("http://localhost:11434/api/tags", timeout=5)
            if health_check.status_code != 200:
                logger.error(f"Ollama service appears to be down: {health_check.status_code}")
                raise HTTPException(
                    status_code=503, 
                    detail="Ollama service is not responding. Make sure it's running."
                )
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Ollama service connection error: {str(e)}")
            raise HTTPException(
                status_code=503, 
                detail="Cannot connect to Ollama service. Please ensure it's running."
            )
        
        # Start the pull process
        process = subprocess.Popen(
            ["ollama", "pull", request.model],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # For log capture (optional, doesn't affect the frontend experience)
        def log_output():
            for line in process.stdout:
                logger.info(f"Ollama pull output: {line.strip()}")
            for line in process.stderr:
                if "error" in line.lower() or "failed" in line.lower():
                    logger.error(f"Ollama pull error: {line.strip()}")
                else:
                    logger.info(f"Ollama pull progress: {line.strip()}")
        
        # Run logging in a separate thread to not block
        import threading
        threading.Thread(target=log_output, daemon=True).start()
        
        # Wait for process to start
        await asyncio.sleep(1)
        
        # Check if process immediately failed
        if process.poll() is not None and process.returncode != 0:
            error_output = process.stderr.read()
            logger.error(f"Model installation failed: {error_output}")
            
            # Check for common errors
            if "no such host" in error_output.lower() or "lookup" in error_output.lower():
                raise HTTPException(
                    status_code=500,
                    detail="Network error: DNS resolution failed. Check your internet connection and DNS settings."
                )
            
            raise HTTPException(status_code=500, detail=f"Model installation failed: {error_output}")
        
        # Return success response - the actual download continues in the background
        logger.info(f"Model installation started: {request.model}")
        return {"success": True, "message": f"Model {request.model} installation started"}
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error installing model: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    

@app.get("/api/check_all_models")
async def check_all_models():
    """
    Get information about all available models in the dropdown and check their installation status.
    """
    logger.info("Checking all models")
    
    try:
        # Call Ollama API to list models
        response = requests.get("http://localhost:11434/api/tags")
        
        if response.status_code != 200:
            logger.error(f"Failed to get models list: {response.status_code}")
            raise HTTPException(status_code=500, detail="Failed to fetch models from Ollama")
        
        models_data = response.json()
        installed_models = [model["name"] for model in models_data.get("models", [])]
        
        # Get the list of models from the dropdown (MODELS global variable)
        available_models = MODELS
        
        # Create the result
        models_info = []
        for model_name in available_models:
            models_info.append({
                "name": model_name,
                "installed": model_name in installed_models
            })
        
        logger.info(f"Found {len(installed_models)} installed models")
        return {"models": models_info}
        
    except Exception as e:
        logger.error(f"Error checking models: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
@app.get("/api/check_dns")
async def check_dns():
    """
    Check DNS connectivity to common model hosting services.
    """
    hosts_to_check = [
        "r2.cloudflarestorage.com",
        "huggingface.co",
        "google.com"  # For general internet connectivity
    ]
    
    results = {}
    
    for host in hosts_to_check:
        try:
            # Try to resolve the hostname
            ip_address = socket.gethostbyname(host)
            results[host] = {
                "resolved": True,
                "ip_address": ip_address
            }
        except socket.gaierror:
            results[host] = {
                "resolved": False,
                "error": "Could not resolve hostname"
            }
        except Exception as e:
            results[host] = {
                "resolved": False,
                "error": str(e)
            }
    
    # Get system DNS settings
    dns_servers = get_system_dns_servers()
    
    return {
        "dns_checks": results,
        "system_dns": dns_servers,
        "system": platform.system()
    }
def get_system_dns_servers():
    system = platform.system()
    dns_servers = []
    
    try:
        if system == "Windows":
            # On Windows, use ipconfig /all
            result = subprocess.run(["ipconfig", "/all"], capture_output=True, text=True)
            output = result.stdout
            for line in output.split('\n'):
                if "DNS Servers" in line:
                    parts = line.split(':')
                    if len(parts) > 1:
                        # Extract the server address
                        server = parts[1].strip()
                        if server:
                            dns_servers.append(server)
        
        elif system == "Darwin" or system == "Linux":
            # On macOS/Linux try to read resolv.conf
            if os.path.exists('/etc/resolv.conf'):
                with open('/etc/resolv.conf', 'r') as f:
                    for line in f:
                        if line.startswith('nameserver'):
                            parts = line.split()
                            if len(parts) > 1:
                                dns_servers.append(parts[1])
    except Exception as e:
        logger.error(f"Error detecting DNS servers: {e}")
    
    return dns_servers
# Import missing modules at the end to prevent circular imports
@app.get("/api/list_small_models")
async def list_small_models():
    """
    List available small models that are easy to download and use.
    """
    logger.info("Listing small models")
    
    # Define small models with their details
    small_models_info = [
        {
            "name": "tinyllama:1.1b",
            "description": "Tiny LLaMA model, very fast and lightweight",
            "size": "1.1 GB"
        },
        {
            "name": "phi:mini",
            "description": "Small but powerful model from Microsoft",
            "size": "1.6 GB"
        },
        {
            "name": "gemma:2b",
            "description": "Google's lightweight model for everyday tasks",
            "size": "1.8 GB"
        },
        {
            "name": "mistral:7b-instruct-v0.2-q4_0",
            "description": "Quantized Mistral model with good performance",
            "size": "4.1 GB"
        },
        {
            "name": "nous-hermes2:yi-1.5-9b-q4_0",
            "description": "Fast instruction-tuned model with good performance",
            "size": "5.0 GB"
        }
    ]
    
    try:
        # Call Ollama API to get installed models
        response = requests.get("http://localhost:11434/api/tags")
        
        if response.status_code != 200:
            # If we can't get installed models, still return our list
            return {"models": small_models_info}
        
        models_data = response.json()
        installed_models = [model["name"] for model in models_data.get("models", [])]
        
        # Mark models as installed
        for model in small_models_info:
            model["installed"] = model["name"] in installed_models
        
        logger.info(f"Listed {len(small_models_info)} small models")
        return {"models": small_models_info}
        
    except Exception as e:
        logger.error(f"Error listing small models: {str(e)}")
        # Return the predefined list even if we couldn't check installation status
        return {"models": small_models_info}
import asyncio
import re

if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)