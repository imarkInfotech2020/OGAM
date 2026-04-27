# Codex HTP / llama.rn Fix Notes

**Date:** April 24, 2026

## Summary

This note captures the current findings and code changes around:

- Android OpenCL crash during `llama.rn` init
- `llama.rn` package upgrade
- experimental HTP tuning changes for testing

## Verified Findings

### 1. Current repo version

Current dependency in this repo:

- `llama.rn: ^0.12.0-rc.5`

Source:

- [package.json](/Users/admin/Desktop/off-grid-mobile-ai/package.json:39)

### 2. Verified upstream package fix

Verified upstream release:

- `llama.rn` `0.12.0-rc.9`

Verified release note:

- `guard partial context init failures (d44fefb), closes #332`

Verified source:

- https://github.com/mybigday/llama.rn/releases/tag/v0.12.0-rc.9

Interpretation:

- `rc.9` adds native hardening for partial context initialization failures
- this is a safety fix
- it does not by itself prove the OpenCL init parameters are valid

### 3. Verified OpenCL crash evidence

Upstream issue:

- `llama.rn` issue `#229`

Verified source:

- https://github.com/mybigday/llama.rn/issues/229

What that issue shows:

- device: Adreno 740 / Snapdragon 8 Gen 2
- Android 15
- OpenCL enabled
- explicit:
  - `cache_type_k: "q8_0"`
  - `cache_type_v: "q8_0"`
- crash during `initLlama()`

Maintainer guidance in that issue:

- do not set `cache_type_k` / `cache_type_v`

Reporter confirmed:

- removing those params fixed the issue in that setup

## Working Interpretation

There are two related but distinct things:

1. **Root-path avoidance**
   - On affected Android OpenCL setups, passing explicit `cache_type_k/v` can trigger the bad init path.
   - App-side fix: omit `cache_type_k/v` for OpenCL.

2. **Crash hardening**
   - Older `llama.rn` versions handled partial init failure less safely.
   - Package fix: upgrade to at least `0.12.0-rc.9`.

Recommended conclusion:

- do both
- upgrade package
- keep app-side OpenCL guard

## Changes Applied In This Repo

### 1. OpenCL guard

File:

- [src/services/llmHelpers.ts](/Users/admin/Desktop/off-grid-mobile-ai/src/services/llmHelpers.ts)

Change:

- for OpenCL, omit `cache_type_k` and `cache_type_v`
- for non-OpenCL backends, keep explicit cache params

Reason:

- avoids the known-bad OpenCL init path documented in issue `#229`

### 2. Package bump

File:

- [package.json](/Users/admin/Desktop/off-grid-mobile-ai/package.json:39)

Change:

- `llama.rn` upgraded from `^0.12.0-rc.5` to `^0.12.0-rc.9`

Reason:

- picks up upstream partial-init hardening from release `0.12.0-rc.9`

### 3. HTP testing changes

Files:

- [src/services/llm.ts](/Users/admin/Desktop/off-grid-mobile-ai/src/services/llm.ts)
- [src/services/llmHelpers.ts](/Users/admin/Desktop/off-grid-mobile-ai/src/services/llmHelpers.ts)

Changes:

- `devices: ['HTP0']` -> `devices: ['HTP*']`
- Android `use_mmap: false`
- `n_parallel: 1`

Reason:

- these are experimental tuning changes for HTP testing, based on the repo investigation notes

## Meaning of HTP Changes

### `devices: ['HTP*']`

- uses all available HTP sessions/devices exposed by the backend
- broader than `['HTP0']`
- intended to avoid artificially pinning HTP to one target

### `use_mmap: false` on Android

- disables memory-mapped model loading on Android
- tests whether buffered/repacked loading behaves better than mmap for HTP/mobile
- iOS behavior was not changed by this tweak

### `n_parallel: 1`

- this is not CPU thread count
- it means single parallel inference slot / serial mode
- mainly a stability-oriented setting
- meant to reduce concurrency and memory pressure while testing HTP
- not primarily a raw speed optimization

## What Is Still Pending

Dependency upgrade is not fully materialized yet.

Still needed:

- `npm install`
- `cd ios && pod install` if syncing iOS native deps later

So currently:

- source files are patched
- lockfiles / native install artifacts may still be stale

## Caution

What is verified:

- `rc.9` contains the partial-init hardening
- issue `#229` shows explicit OpenCL `cache_type_k/v` can trigger the crash path

What is not proven:

- that every OpenCL device fails the same way
- that package upgrade alone fixes the OpenCL config problem
- that HTP changes are definitively faster

## Best Next Step

Compare this config with another working Android `llama.rn` app and ask for their exact runtime `initLlama` params for:

- OpenCL
- HTP

Especially:

- `devices`
- `n_gpu_layers`
- `n_ctx`
- `n_batch`
- `n_ubatch`
- `n_threads`
- `n_parallel`
- `use_mmap`
- `flash_attn_type`
- `kv_unified`
- `no_extra_bufts`
- `cache_type_k`
- `cache_type_v`
- tested devices
- actual performance / crash results
