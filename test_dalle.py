#!/usr/bin/env python3
"""Test DALL-E 3 image generation directly via OpenAI SDK"""
import os
from openai import OpenAI

api_key = os.environ.get("OPENAI_API_KEY")
print(f"API key length: {len(api_key) if api_key else 0}")
print(f"API key prefix: {api_key[:10] if api_key else 'NONE'}...")

# Test 1: Try with the default OpenAI endpoint (no base_url override)
print("\n--- Test 1: Default OpenAI endpoint ---")
try:
    client = OpenAI()  # Uses OPENAI_API_KEY and default base_url
    response = client.images.generate(
        model="dall-e-3",
        prompt="A friendly golden retriever puppy sitting on green grass",
        n=1,
        size="1024x1024",
        quality="standard",
        response_format="url",
    )
    print(f"SUCCESS! Generated {len(response.data)} image(s)")
    for i, img in enumerate(response.data):
        print(f"  Image {i+1} URL: {img.url[:80]}...")
        if img.revised_prompt:
            print(f"  Revised prompt: {img.revised_prompt[:80]}...")
except Exception as e:
    print(f"FAILED: {e}")

# Test 2: Try with the Manus proxy endpoint
print("\n--- Test 2: Manus proxy endpoint ---")
try:
    client2 = OpenAI(base_url="https://api.manus.im/api/llm-proxy/v1")
    response2 = client2.images.generate(
        model="dall-e-3",
        prompt="A friendly golden retriever puppy sitting on green grass",
        n=1,
        size="1024x1024",
        quality="standard",
        response_format="url",
    )
    print(f"SUCCESS! Generated {len(response2.data)} image(s)")
    for i, img in enumerate(response2.data):
        print(f"  Image {i+1} URL: {img.url[:80]}...")
except Exception as e:
    print(f"FAILED: {e}")
