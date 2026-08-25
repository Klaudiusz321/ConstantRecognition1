# WebGPU scientific execution model and validation

Audit date: 2026-08-25

## Meaning of K

`K` is the exact number of RPN calculator tokens in one candidate expression. It is not a CPU-thread count, GPU-thread count, tile size, operation count or memory parameter. For a fixed valid RPN structure, the number of concrete candidates is the product of the position radices. The total search size at level `K` is the sum of those products across all stack-valid structures.

CPU worker count, WebGPU workgroup count and tile size change elapsed time and resource use only. They must not change `K`, the candidate order or the unique candidate count.

## Parallel decomposition

The CPU performs the control work:

- generates stack-valid RPN structures as a stream;
- computes exact mixed-radix sizes with `bigint`;
- assigns a non-overlapping tile interval `[start, start + count)`;
- packs the calculator and tile base digits;
- decodes returned indices and verifies every reported candidate in FP64;
- enforces abort, time and evaluation limits.

The GPU performs data-parallel screening:

- one invocation evaluates exactly one mixed-radix combination;
- one workgroup contains 256 invocations;
- a tile uses `ceil(count / 256)` workgroups;
- each invocation evaluates all observations of its own expression for `f(x)` or `F(C1,C2)`;
- each workgroup reduces its invocations to one winner;
- a second GPU pipeline reduces all workgroup winners to the globally best requested set before CPU readback.

The default tile is 1,048,576 candidates, or 4,096 workgroups. Tiles are capped by `maxComputeWorkgroupsPerDimension` and a 32-bit local invocation offset. The full tile start remains a CPU `bigint`; the shader receives mixed-radix base digits, so levels whose global index exceeds `u32` remain addressable without overlap or precision loss.

Multiple numerical targets currently reuse one engine but are searched sequentially. A future two-dimensional target/candidate dispatch is possible, but it would need a separate result-compaction design and is not part of the present correctness contract.

## CPU-to-GPU transfer

For every tile the host writes:

- parameters: 64 bytes;
- RPN form, radices, tile digits and opcode tables: 576 bytes;
- zeroed atomic search state: 16 bytes.

That is 656 bytes per constant-search tile. Function observations use 16 bytes per row and are packed once per search. They are uploaded again only if a buffer resize invalidates the resident copy; they are no longer retransferred for every tile.

## GPU-to-CPU transfer

Every tile returns:

- search state: 16 bytes;
- at most `groupBestToVerify * 16` bytes after GPU reduction;
- exactly `thresholdCandidateCount * 16` bytes only when threshold candidates exist.

At the default `groupBestToVerify = 32`, a full tile now maps 528 bytes before optional threshold results. The previous path mapped 65,552 bytes (state plus all 4,096 workgroup winners). This is a 124-fold reduction for the fixed part of a full-tile readback.

Candidate-buffer overflow is never treated as truncation. The CPU bisects and reruns the affected interval until every sub-tile fits. Retry dispatches increase physical work but not the reported unique search-space count.

## Device memory

Buffers persist across tiles and grow to power-of-two capacities. A resize destroys the previous buffer set before rebinding the replacement. All buffers are destroyed when the engine or device is destroyed.

For the default 65,536 candidate capacity, a full 4,096-workgroup tile, one data row and 32 reduced winners, the persistent footprint is:

- storage/uniform buffers: 1,115,296 bytes;
- CPU-readable staging buffers: 1,049,104 bytes;
- total allocated buffer bytes: 2,164,400 bytes (about 2.06 MiB).

The engine checks `maxBufferSize`, `maxStorageBufferBindingSize`, workgroup size, workgroup storage and dispatch limits before use. Every search summary exposes measured dispatch count, data-upload count, candidate-readback count, byte traffic and peak allocation.

## Numerical correctness boundary

WGSL screening is FP32. All values presented as scientific results are decoded and recomputed by the CPU FP64 verifier, so an accepted output cannot rely only on the FP32 value. Inputs that overflow FP32 or silently underflow from non-zero to zero are rejected from the GPU path and can fall back to CPU/WASM.

This makes returned results sound with respect to the FP64 verifier, but FP32 screening is not a formal proof of completeness relative to an exhaustive FP64 search. A mathematically complete GPU search would require FP64 support or validated interval/error-bound arithmetic for every operation, including transcendental functions. The workgroup-best safety channel reduces false-negative risk but does not turn FP32 into such a proof. Reports must therefore distinguish “GPU-screened and CPU-verified” from “FP64-exhaustive”.

## Validation matrix

GPU readiness now requires real dispatch and readback evidence for:

- all 13 constants;
- all 18 unary functions, including Gamma and a valid `ARCTANH` chain;
- all 5 binary operators and the professor-core `func(top, below)` operand order;
- four-workgroup global-best reduction and its exact 80-byte readback;
- one-variable recognition with two tiles and exactly one dataset upload;
- two-variable recognition requiring both `C1` and `C2`;
- forced one-slot candidate-buffer overflow with recovery of all 13 indices;
- CPU FP64 acceptance after GPU FP32 screening.

Automated tests also cover exact form counts through deep `K`, mixed-radix indices above `u32`, carry boundaries, non-finite intermediate recovery, FP32 input compatibility, memory accounting and shader regression guards.

WebGPU synchronization follows the specification's ownership model: mapped buffers are not submitted for GPU use until unmapped, and `mapAsync()` resolves only after earlier queue use of that buffer has completed. See the [WebGPU specification](https://www.w3.org/TR/webgpu/).
