# Performance Improvements — Hardware Acceleration

> This document tracks identified performance gaps in llama.rn hardware acceleration and the plan to address them. Audit conducted April 2026.

---

## Current State

| Hardware | Platform | Status | Notes |
|----------|----------|--------|-------|
| Metal GPU | iOS | Fully used (99 layers) | Maximized |
| Adreno OpenCL GPU | Android | Limited (0 default, 12–24 cap) | Default is CPU-only |
| Hexagon HTP (NPU) | Android | Unused | `.so` files shipped but never activated |
| Flash Attention | Both | Enabled by default | Good |
| KV Cache (quantized) | iOS | Supported (q8_0 / q4_0) | Good |
| KV Cache (quantized) | Android GPU | Forced F16 | Wastes memory |
| CLIP Vision GPU | iOS | Enabled (>4GB RAM) | Good |
| CLIP Vision GPU | Android | CPU only | Slower vision inference |
| Context shifting | Android GPU | Disabled | Crashes Adreno GPU — upstream bug |
| n_threads | Both | Hardcoded to 4 | Ignores actual P-core count |
| Embeddings | Both | CPU only, 2 threads | Low priority — model is small |

**Relevant files:**
- `src/services/llmHelpers.ts` — `initLlama` params, GPU layer caps, thread count, flash attn, KV cache type
- `src/services/llm.ts` — multimodal GPU, context shifting guard, GPU info capture
- `src/services/rag/embedding.ts` — embedding context init
- `android/app/src/main/assets/ggml-hexagon/` — Hexagon HTP shared libraries (v69/73/75/79/81)

---

## Improvement 1: Activate Hexagon HTP (NPU) on Android

**Impact: High** — Snapdragon 8 Gen 1+ users (SM8450+) have a dedicated neural processor that is completely idle today despite the `.so` libraries already being shipped in the APK.

**What needs to change:**
- Pass `devices: ['HTP0']` in `initLlama` for qualifying devices
- Detect Snapdragon generation at runtime to gate this (SoC name from `react-native-device-info` or `android.os.Build.SOC_MODEL`)
- HTP and GPU are mutually exclusive — disable `n_gpu_layers` when HTP is active
- HTP is experimental in llama.rn (v0.12.x); wrap in try/catch and fall back to OpenCL GPU if init fails
- Requires `libcdsprpc.so` to be declared in the Android manifest

**Known risks:**
- Snapdragon 7 Gen 1 (SM7450) has compatibility issues (#279 in llama.rn, reopened Jan 2026) — exclude explicitly
- llama.rn marks this as experimental; a fallback chain (HTP → OpenCL → CPU) is essential

**Fallback chain:**
```
HTP (SM8450+, excluding SM7450) → OpenCL GPU (Adreno 700+) → CPU
```

---

## Improvement 2: Raise Android GPU Default

**Impact: Medium** — `DEFAULT_GPU_LAYERS` is `0` on Android (`src/services/llmHelpers.ts:14`), meaning all Android users run pure CPU inference unless they manually change it in settings. The RAM-based caps (`ANDROID_GPU_LAYER_CAPS`) already exist to prevent crashes, so the default being 0 is overly conservative.

**What needs to change:**
- Change `DEFAULT_GPU_LAYERS` on Android from `0` to a RAM-gated value (e.g. call `getGpuLayersForDevice()` at init time)
- Devices with ≤4GB RAM stay at 0 (already handled by the cap table)
- Devices with 6GB get 0 → consider raising to 8–12 layers
- Devices with 8GB get 12 layers (already capped)
- Devices with >8GB get 24 layers (already capped)
- Keep the 8-second GPU init timeout and CPU fallback that's already in place

**Risk:** Low — safety caps and timeout fallback already exist.

---

## Improvement 3: Dynamic Thread Count

**Impact: Medium** — `n_threads` is hardcoded to `4` (`src/services/llmHelpers.ts:12`). Modern flagship SoCs have more P-cores than this:

| SoC | P-cores | Current threads | Opportunity |
|-----|---------|-----------------|-------------|
| Snapdragon 8 Gen 3 | 8 | 4 | +4 threads |
| Snapdragon 8 Gen 2 | 4 (prime) + 3 (perf) | 4 | marginal |
| Apple A18 | 6 | 4 | +2 threads |
| Apple A17 | 6 | 4 | +2 threads |

**What needs to change:**
- Use `react-native-device-info`'s `getSystemAvailableFeatures` or llama.rn's own device info to detect physical core count
- Set `n_threads = min(physicalCores, 8)` — cap at 8 to avoid E-core spillover on Android
- iOS: `getOptimalThreadCount()` already exists in `llmHelpers.ts` but returns a hardcoded 4 — update it to use actual core count

**Risk:** Low. Thread count is already user-configurable in settings; this just improves the default.

---

## Improvement 4: Android KV Cache Quantization on GPU

**Impact: Medium** — When `n_gpu_layers > 0` on Android, the KV cache is forced to F16 (`src/services/llmHelpers.ts:63`). Using q8_0 KV cache halves the KV memory footprint, allowing longer context or more layers on the same device.

**What needs to change:**
- Test q8_0 KV cache stability on Android with OpenCL GPU enabled
- If stable, change the F16 guard to only apply when flash_attn is off
- Gate on llama.rn version — this may require a llama.cpp version that has stable quantized KV on Adreno

**Risk:** Medium — quantized KV on Adreno is less tested. Needs device coverage testing before enabling by default. Could be an opt-in setting first.

---

## Improvement 5: Android CLIP Vision GPU

**Impact: Medium for vision model users** — The CLIP vision encoder is always CPU-only on Android (`src/services/llm.ts:137`). On iOS it's GPU-offloaded when RAM >4GB.

**What needs to change:**
- Extend the `useGpuForClip` check to Android when `n_gpu_layers > 0` and RAM >6GB
- Test with Adreno OpenCL — CLIP GPU offload may have the same instability issues as LLM GPU on Android

**Risk:** Medium — same Adreno driver instability concerns as LLM GPU. Low priority until LLM GPU is stable on Android.

---

## Improvement 6: Context Shifting on Android GPU

**Impact: Medium** — Context shifting (KV cache reuse across turns) is disabled on Android GPU (`src/services/llm.ts:158`) because the ggml set operation crashes the Adreno backend. Without it, the KV cache is fully rebuilt on every generation once the context fills.

**What needs to change:**
- This is blocked on an upstream llama.rn / llama.cpp fix
- Track llama.rn issue tracker for the Adreno `ggml_set` crash resolution
- Re-enable `ctx_shift` on Android GPU once the upstream fix lands and is picked up

**Risk:** None — just needs to track upstream.

---

## Recommended Implementation Order

| Priority | Improvement | Effort | Risk |
|----------|-------------|--------|------|
| 1 | Raise Android GPU default | Low | Low |
| 2 | Dynamic thread count | Low | Low |
| 3 | Hexagon HTP activation | Medium | Medium |
| 4 | Android KV cache quantization | Medium | Medium |
| 5 | Android CLIP vision GPU | Medium | Medium |
| 6 | Context shifting (Android GPU) | None (upstream) | None |

Start with 1 and 2 — they are low-risk, low-effort, and immediately benefit all Android users. HTP (3) is the highest ceiling but needs careful fallback handling and device exclusion lists.

---

**Last Updated:** April 2026
