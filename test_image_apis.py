#!/usr/bin/env python3
"""Test multiple image generation APIs to find what works from this sandbox"""
import os
import requests
import time
import base64

RESULTS = []

def test_result(name, success, details=""):
    status = "PASS" if success else "FAIL"
    RESULTS.append((name, status, details))
    print(f"[{status}] {name}: {details}")

# ─── Test 1: Pollinations.ai (new endpoint) ─────────────────────────────────
print("\n=== Test 1: Pollinations.ai ===")
try:
    # Try the image.pollinations.ai endpoint with a simple GET
    url = "https://image.pollinations.ai/prompt/a%20golden%20retriever%20puppy?width=512&height=512&nologo=true&seed=42"
    print(f"  GET {url}")
    resp = requests.get(url, timeout=60, allow_redirects=True)
    print(f"  Status: {resp.status_code}, Content-Type: {resp.headers.get('content-type', 'unknown')}, Size: {len(resp.content)} bytes")
    if resp.status_code == 200 and len(resp.content) > 1000:
        with open("/home/ubuntu/ultra-computer/sandbox/images/test_pollinations.png", "wb") as f:
            f.write(resp.content)
        test_result("Pollinations.ai (image.pollinations.ai)", True, f"Got {len(resp.content)} bytes image")
    else:
        test_result("Pollinations.ai (image.pollinations.ai)", False, f"Status {resp.status_code}, size {len(resp.content)}")
except Exception as e:
    test_result("Pollinations.ai (image.pollinations.ai)", False, str(e))

# ─── Test 2: Pollinations.ai OpenAI-compatible endpoint ─────────────────────
print("\n=== Test 2: Pollinations.ai OpenAI-compatible ===")
try:
    url = "https://image.pollinations.ai/openai/images/generations"
    payload = {
        "model": "flux",
        "prompt": "a golden retriever puppy",
        "n": 1,
        "size": "1024x1024"
    }
    print(f"  POST {url}")
    resp = requests.post(url, json=payload, timeout=60)
    print(f"  Status: {resp.status_code}, Content-Type: {resp.headers.get('content-type', 'unknown')}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"  Response: {str(data)[:200]}")
        test_result("Pollinations.ai OpenAI-compat", True, f"Got response")
    else:
        print(f"  Body: {resp.text[:200]}")
        test_result("Pollinations.ai OpenAI-compat", False, f"Status {resp.status_code}")
except Exception as e:
    test_result("Pollinations.ai OpenAI-compat", False, str(e))

# ─── Test 3: Together.ai free tier ──────────────────────────────────────────
print("\n=== Test 3: Together.ai (needs key) ===")
together_key = os.environ.get("TOGETHER_API_KEY", "")
if together_key:
    try:
        url = "https://api.together.xyz/v1/images/generations"
        headers = {"Authorization": f"Bearer {together_key}"}
        payload = {"model": "stabilityai/stable-diffusion-xl-base-1.0", "prompt": "a golden retriever puppy", "n": 1}
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        test_result("Together.ai", resp.status_code == 200, f"Status {resp.status_code}")
    except Exception as e:
        test_result("Together.ai", False, str(e))
else:
    test_result("Together.ai", False, "No TOGETHER_API_KEY")

# ─── Test 4: Manus proxy - try images endpoint ──────────────────────────────
print("\n=== Test 4: Manus proxy images endpoint ===")
try:
    api_key = os.environ.get("OPENAI_API_KEY", "")
    base_url = os.environ.get("OPENAI_BASE_URL", "https://api.manus.im/api/llm-proxy/v1")
    url = f"{base_url}/images/generations"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"model": "dall-e-3", "prompt": "a golden retriever puppy", "n": 1, "size": "1024x1024"}
    print(f"  POST {url}")
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    print(f"  Status: {resp.status_code}, Body: {resp.text[:200]}")
    test_result("Manus proxy /images/generations", resp.status_code == 200, f"Status {resp.status_code}")
except Exception as e:
    test_result("Manus proxy /images/generations", False, str(e))

# ─── Test 5: Manus proxy - try gpt-image-1 ──────────────────────────────────
print("\n=== Test 5: Manus proxy gpt-image-1 ===")
try:
    api_key = os.environ.get("OPENAI_API_KEY", "")
    base_url = os.environ.get("OPENAI_BASE_URL", "https://api.manus.im/api/llm-proxy/v1")
    url = f"{base_url}/images/generations"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"model": "gpt-image-1", "prompt": "a golden retriever puppy", "n": 1, "size": "1024x1024"}
    print(f"  POST {url}")
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    print(f"  Status: {resp.status_code}, Body: {resp.text[:200]}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"  Data keys: {list(data.keys()) if isinstance(data, dict) else 'not dict'}")
        test_result("Manus proxy gpt-image-1", True, f"Got response!")
    else:
        test_result("Manus proxy gpt-image-1", False, f"Status {resp.status_code}")
except Exception as e:
    test_result("Manus proxy gpt-image-1", False, str(e))

# ─── Test 6: NVIDIA Build API (needs key) ───────────────────────────────────
print("\n=== Test 6: NVIDIA Build API ===")
nvidia_key = os.environ.get("NVIDIA_API_KEY", "")
if nvidia_key:
    try:
        url = "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3_5-large"
        headers = {"Authorization": f"Bearer {nvidia_key}", "Accept": "application/json"}
        payload = {"prompt": "a golden retriever puppy", "steps": 30, "seed": 42}
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        test_result("NVIDIA Build API", resp.status_code == 200, f"Status {resp.status_code}")
    except Exception as e:
        test_result("NVIDIA Build API", False, str(e))
else:
    test_result("NVIDIA Build API", False, "No NVIDIA_API_KEY")

# ─── Summary ─────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("SUMMARY:")
print("=" * 60)
for name, status, details in RESULTS:
    print(f"  [{status}] {name}: {details}")

passing = [r for r in RESULTS if r[1] == "PASS"]
print(f"\n{len(passing)}/{len(RESULTS)} tests passed")
