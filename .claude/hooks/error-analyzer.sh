#!/bin/bash
# Usage: ./hooks/error-analyzer.sh "error message here"

ERROR="$1"

echo "🔍 Analyzing error against PITFALLS.md..."

if echo "$ERROR" | grep -qi "buffer"; then
  echo "❌ SSE buffering detected (Pitfall 1) — must use zero-copy sliding window"
fi

if echo "$ERROR" | grep -qi "unbounded"; then
  echo "❌ Unbounded channel (Pitfall 2) — replace with bounded mpsc::channel(N)"
fi

if echo "$ERROR" | grep -qi "too many parts"; then
  echo "❌ ClickHouse too-many-parts (Pitfall 3) — batch to 1000+ rows"
fi

if echo "$ERROR" | grep -qi "wasmtime"; then
  echo "❌ Wasmtime Store-per-request (Pitfall 5) — enable PoolingAllocationConfig"
fi

echo "✅ Analysis complete"