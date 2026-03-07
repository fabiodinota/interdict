#!/usr/bin/env python3
"""
Probe Interdict with a single chat completion request.

Usage:
    python scripts/test/probe.py
    python scripts/test/probe.py "custom message"

Reads credentials from scripts/test/.env.test — never pass keys on the CLI.
Requires: pip install openai python-dotenv
"""

import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    sys.exit("Missing dependency: pip install python-dotenv")

try:
    import openai
except ImportError:
    sys.exit("Missing dependency: pip install openai")

import os

SCRIPT_DIR = Path(__file__).parent
ENV_FILE = SCRIPT_DIR / ".env.test"

if not ENV_FILE.exists():
    sys.exit(
        f"ERROR: {ENV_FILE} not found.\n"
        f"       cp {SCRIPT_DIR}/.env.test.example {ENV_FILE}  then fill in your keys."
    )

load_dotenv(ENV_FILE)

api_key = os.environ.get("OPENAI_API_KEY")
proxy = os.environ.get("INTERDICT_PROXY")
ca_cert = os.environ.get("INTERDICT_CA_CERT")
vendor_url = os.environ.get("TEST_VENDOR_URL", "https://api.openai.com/v1")
model = os.environ.get("TEST_MODEL", "gpt-4o-mini")

missing = [k for k, v in {
    "OPENAI_API_KEY": api_key,
    "INTERDICT_PROXY": proxy,
    "INTERDICT_CA_CERT": ca_cert,
}.items() if not v]

if missing:
    sys.exit(f"ERROR: missing required vars in .env.test: {', '.join(missing)}")

# Strip /chat/completions suffix if present — openai SDK adds its own path
base_url = vendor_url.removesuffix("/chat/completions")

message = sys.argv[1] if len(sys.argv) > 1 else "Hello from Interdict probe"

print(f"Proxy : {proxy}")
print(f"Vendor: {base_url}")
print(f"Model : {model}")
print("---")

# The openai SDK uses HTTPS_PROXY / http_proxy env vars automatically,
# and REQUESTS_CA_BUNDLE / SSL_CERT_FILE for custom CAs.
os.environ["HTTPS_PROXY"] = proxy
os.environ["SSL_CERT_FILE"] = ca_cert

client = openai.OpenAI(api_key=api_key, base_url=base_url)

response = client.chat.completions.create(
    model=model,
    messages=[{"role": "user", "content": message}],
)

print(response.choices[0].message.content)
