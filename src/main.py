"""
main.py — MOCK VERSION
All external service/function calls are replaced with hardcoded sample data
so the full WebSocket pipeline can be tested without any real dependencies.
"""

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import json
import asyncio
import time
# ---------------------------------------------------------------------------
# Mock history schema (mirrors HistoryCreateRequest)
# ---------------------------------------------------------------------------
class HistoryCreateRequest:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


# ---------------------------------------------------------------------------
# SAMPLE DATA CONSTANTS
# ---------------------------------------------------------------------------

SAMPLE_C_CODE = """\
#include <stdio.h>
#include <stdlib.h>

#define N 1024

void matrix_add(float *A, float *B, float *C, int n) {
    for (int i = 0; i < n * n; i++)
        C[i] = A[i] + B[i];
}

int main() {
    float *A = malloc(N * N * sizeof(float));
    float *B = malloc(N * N * sizeof(float));
    float *C = malloc(N * N * sizeof(float));
    for (int i = 0; i < N * N; i++) { A[i] = 1.0f; B[i] = 2.0f; }
    matrix_add(A, B, C, N);
    printf("C[0] = %f\\n", C[0]);
    free(A); free(B); free(C);
    return 0;
}
"""

SAMPLE_EXECUTION_SERIAL_TIME = 42.731   # ms

SAMPLE_FLAT_PROFILE = """\
Flat profile:
Each sample counts as 0.01 seconds.
  %   cumulative   self              self     total
 time   seconds   seconds    calls  ms/call  ms/call  name
 75.00      0.03     0.03        1    30.00    30.00  matrix_add
 25.00      0.04     0.01     1024     0.01     0.01  malloc
"""

SAMPLE_CALL_CHAIN = """\
main
  └─ matrix_add (called 1 time, 30.00 ms)
  └─ malloc      (called 2 times, 0.02 ms)
"""

SAMPLE_MEMORY_PROFILE = """\
Memory access trace (mcprof):
Function         | Reads    | Writes   | Cache Miss %
matrix_add       | 2097152  | 1048576  | 12.3%
main             | 4        | 4        | 0.1%
"""

# Tiny 1x1 white PNG as a stand-in for real PDF graphs
SAMPLE_GRAPH_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)

SAMPLE_PROMPTS = [
    {
        "prompt_id": 1,
        "prompt": (
            "Translate the following C matrix-addition kernel to CUDA. "
            "Use a 2D thread/block layout, handle boundary checks, and "
            "copy data to/from the device properly.\n\n" + SAMPLE_C_CODE
        ),
    },
    {
        "prompt_id": 2,
        "prompt": (
            "Translate the following C matrix-addition kernel to optimised CUDA. "
            "Use shared memory tiling with 16x16 tiles to improve memory locality.\n\n"
            + SAMPLE_C_CODE
        ),
    },
    {
        "prompt_id": 3,
        "prompt": (
            "Translate the following C matrix-addition kernel to CUDA using "
            "unified memory (cudaMallocManaged) and a flat 1D grid.\n\n"
            + SAMPLE_C_CODE
        ),
    },
]

SAMPLE_CUDA_CODES = [
    # Candidate 1 — basic
    """\
#include <cuda_runtime.h>
#include <stdio.h>
#define N 1024

__global__ void matrix_add(float *A, float *B, float *C, int n) {
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    if (row < n && col < n)
        C[row * n + col] = A[row * n + col] + B[row * n + col];
}

int main() {
    size_t bytes = N * N * sizeof(float);
    float *hA, *hB, *hC, *dA, *dB, *dC;
    hA = (float*)malloc(bytes); hB = (float*)malloc(bytes); hC = (float*)malloc(bytes);
    for (int i = 0; i < N*N; i++) { hA[i] = 1.0f; hB[i] = 2.0f; }
    cudaMalloc(&dA, bytes); cudaMalloc(&dB, bytes); cudaMalloc(&dC, bytes);
    cudaMemcpy(dA, hA, bytes, cudaMemcpyHostToDevice);
    cudaMemcpy(dB, hB, bytes, cudaMemcpyHostToDevice);
    dim3 block(16, 16);
    dim3 grid((N+15)/16, (N+15)/16);
    matrix_add<<<grid, block>>>(dA, dB, dC, N);
    cudaMemcpy(hC, dC, bytes, cudaMemcpyDeviceToHost);
    printf("C[0] = %f\\n", hC[0]);
    cudaFree(dA); cudaFree(dB); cudaFree(dC);
    free(hA); free(hB); free(hC);
    return 0;
}
""",
    # Candidate 2 — shared memory tiling
    """\
#include <cuda_runtime.h>
#include <stdio.h>
#define N 1024
#define TILE 16

__global__ void matrix_add_tiled(float *A, float *B, float *C, int n) {
    __shared__ float sA[TILE][TILE], sB[TILE][TILE];
    int row = blockIdx.y * TILE + threadIdx.y;
    int col = blockIdx.x * TILE + threadIdx.x;
    if (row < n && col < n) {
        sA[threadIdx.y][threadIdx.x] = A[row*n+col];
        sB[threadIdx.y][threadIdx.x] = B[row*n+col];
        __syncthreads();
        C[row*n+col] = sA[threadIdx.y][threadIdx.x] + sB[threadIdx.y][threadIdx.x];
    }
}

int main() {
    size_t bytes = N * N * sizeof(float);
    float *hA = (float*)malloc(bytes), *hB = (float*)malloc(bytes), *hC = (float*)malloc(bytes);
    for (int i = 0; i < N*N; i++) { hA[i]=1.0f; hB[i]=2.0f; }
    float *dA, *dB, *dC;
    cudaMalloc(&dA,bytes); cudaMalloc(&dB,bytes); cudaMalloc(&dC,bytes);
    cudaMemcpy(dA,hA,bytes,cudaMemcpyHostToDevice);
    cudaMemcpy(dB,hB,bytes,cudaMemcpyHostToDevice);
    dim3 block(TILE,TILE); dim3 grid((N+TILE-1)/TILE,(N+TILE-1)/TILE);
    matrix_add_tiled<<<grid,block>>>(dA,dB,dC,N);
    cudaMemcpy(hC,dC,bytes,cudaMemcpyDeviceToHost);
    printf("C[0]=%f\\n",hC[0]);
    cudaFree(dA); cudaFree(dB); cudaFree(dC);
    free(hA); free(hB); free(hC);
    return 0;
}
""",
    # Candidate 3 — unified memory
    """\
#include <cuda_runtime.h>
#include <stdio.h>
#define N 1024

__global__ void matrix_add_um(float *A, float *B, float *C, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n*n) C[idx] = A[idx] + B[idx];
}

int main() {
    size_t bytes = N * N * sizeof(float);
    float *A, *B, *C;
    cudaMallocManaged(&A, bytes);
    cudaMallocManaged(&B, bytes);
    cudaMallocManaged(&C, bytes);
    for (int i = 0; i < N*N; i++) { A[i]=1.0f; B[i]=2.0f; }
    int threads = 256;
    int blocks = (N*N + threads - 1) / threads;
    matrix_add_um<<<blocks, threads>>>(A, B, C, N);
    cudaDeviceSynchronize();
    printf("C[0]=%f\\n", C[0]);
    cudaFree(A); cudaFree(B); cudaFree(C);
    return 0;
}
""",
]

# True = compiled successfully, False = compilation failed
SAMPLE_COMPILE_RESULTS = [True, True, False]

# Execution times in ms (-1 = did not compile/run, -2 = runtime error)
SAMPLE_TIMERS = [5.214, 3.871, -1.0]

SAMPLE_BEST_METRICS = {
    "runs": [
        {"run": 1, "time_ms": 5.3},
        {"run": 2, "time_ms": 5.2},
        {"run": 3, "time_ms": 5.1},
    ],
    "bw_htod": 11.2,   # GB/s
    "bw_dtoh": 10.8,   # GB/s
    "ncu_summary": {
        "sm_utilization": "72%",
        "memory_throughput": "85%",
        "achieved_occupancy": "0.94",
    },
    "ncu_kernel_summary": {},
}


# ---------------------------------------------------------------------------
# MOCK SERVICE FUNCTIONS  (replace real imports)
# ---------------------------------------------------------------------------

def mock_save_c_code(c_code: str) -> str:
    """Returns a fake source directory path."""
    print("[MOCK] save_c_code called")
    return "/tmp/mock_source_dir"


def mock_run_gprof(source_dir: str):
    """Returns (execution_time_ms, flat_profile_str)."""
    print("[MOCK] run_gprof called")
    return SAMPLE_EXECUTION_SERIAL_TIME, SAMPLE_FLAT_PROFILE


def mock_run_mcprof(source_dir: str):
    """Returns (call_chain, memory_profile, call_graph_pdf_path, comm_pdf_path)."""
    print("[MOCK] run_mcprof called")
    # Return None for PDF paths — the b64 helper will just return None gracefully
    return SAMPLE_CALL_CHAIN, SAMPLE_MEMORY_PROFILE, None, None


def mock_generating_prompt(source_dir: str) -> list:
    """Returns a list of prompt dicts."""
    print("[MOCK] generating_prompt called")
    return SAMPLE_PROMPTS


def mock_c_to_cuda_translate(prompt: str) -> str:
    """Returns raw LLM text (with a code fence) for the next queued candidate."""
    print("[MOCK] c_to_cuda_translate called")
    # Pop the next code from the buffer in order; wrap in a code fence
    if not hasattr(mock_c_to_cuda_translate, "_idx"):
        mock_c_to_cuda_translate._idx = 0
    idx = mock_c_to_cuda_translate._idx % len(SAMPLE_CUDA_CODES)
    mock_c_to_cuda_translate._idx += 1
    return f"```cuda\n{SAMPLE_CUDA_CODES[idx]}\n```"


def mock_save_and_compile_controller(cuda_code: str):
    """Returns (ok, error_msg, compiled_path, clean_code)."""
    print("[MOCK] save_and_compile_controller called")
    if not hasattr(mock_save_and_compile_controller, "_idx"):
        mock_save_and_compile_controller._idx = 0
    idx = mock_save_and_compile_controller._idx % len(SAMPLE_COMPILE_RESULTS)
    mock_save_and_compile_controller._idx += 1
    ok = SAMPLE_COMPILE_RESULTS[idx]
    path = f"/tmp/mock_cuda_{idx+1}" if ok else None
    return ok, (None if ok else "nvcc: mock compile error"), path, cuda_code


def mock_execute_cuda_code(path: str):
    """Returns (success, error_msg, time_seconds, metrics_dict)."""
    print(f"[MOCK] execute_cuda_code called for {path}")
    # Derive index from path name
    try:
        idx = int(path.rsplit("_", 1)[-1]) - 1
    except Exception:
        idx = 0
    t = SAMPLE_TIMERS[idx] if idx < len(SAMPLE_TIMERS) else -1.0
    if t < 0:
        return False, "mock runtime error", 0.0, {}
    return True, None, t / 1000.0, SAMPLE_BEST_METRICS   # convert ms → s


def mock_add_history_item(payload: HistoryCreateRequest) -> dict:
    """Simulates DB insert and returns a fake saved record."""
    print("[MOCK] add_history_item called")
    return {"id": "mock-history-id-12345", "status": "saved"}


def mock_get_b64(path) -> str | None:
    """Returns a tiny sample base64 PNG instead of reading a real PDF."""
    print(f"[MOCK] _get_b64 called with path={path}")
    return SAMPLE_GRAPH_B64


def mock_save_all_performance_plots(*args, **kwargs):
    print("[MOCK] save_all_performance_plots called (no-op)")


def mock_save_candidates_comparison_plot(*args, **kwargs):
    print("[MOCK] save_candidates_comparison_plot called (no-op)")


# ---------------------------------------------------------------------------
# HISTORY PAYLOAD BUILDER  (unchanged from original)
# ---------------------------------------------------------------------------

def _build_history_payload(
    c_code, execution_serial_time, flat_profile, call_chain, memory_profile,
    c_graph_base64, comm_graph_base64, prompts, compiled_cuda_programs,
    timers, best_candidate, best_code, best_time, best_metrics=None,
) -> HistoryCreateRequest:
    prompts_payload = [
        {
            "prompt_id": idx + 1,
            "prompt_text": (p.get("prompt") or p.get("content") if isinstance(p, dict) else str(p)),
        }
        for idx, p in enumerate(prompts)
    ]

    cuda_codes_payload = []
    for idx, entry in enumerate(compiled_cuda_programs):
        if not entry:
            continue
        compiled_path = entry[0] if len(entry) > 0 else None
        clean_code    = entry[1] if len(entry) > 1 else None
        prompt_id     = entry[2] if len(entry) > 2 else idx + 1
        cuda_time     = timers[idx] if idx < len(timers) and timers[idx] >= 0 else None
        compiled      = bool(compiled_path)
        executable    = compiled and cuda_time is not None
        cuda_codes_payload.append({
            "candidate_id": idx + 1,
            "prompt_id": prompt_id,
            "cuda_code": clean_code,
            "stats": {
                "compiled": compiled,
                "compile_error": None if compiled else "Generation not compiled",
                "executable": executable,
                "cuda_time": cuda_time,
            },
        })

    best_cuda_payload = None
    if best_candidate is not None and best_code:
        best_cuda_payload = {
            "candidate_id": best_candidate,
            "prompt_id": best_candidate,
            "cuda_code": best_code,
            "cuda_time": best_time if best_time != float("inf") else None,
            "speedup": None,
        }

    return HistoryCreateRequest(
        name=f"CUDA pipeline run - {datetime.now(timezone.utc).isoformat()}",
        timestamp=datetime.now(timezone.utc),
        c_code=c_code,
        timebasedprofiling={
            "execution_time": execution_serial_time,
            "flat_profile": flat_profile,
        },
        membasedprofiling={
            "call_chain": call_chain,
            "memory_profile": memory_profile,
            "call_graph_base64": c_graph_base64,
            "comm_graph_base64": comm_graph_base64,
        },
        prompts=prompts_payload,
        cuda_codes=cuda_codes_payload,
        best_cuda_code=best_cuda_payload,
        performance_metrics={
            "timers": timers,
            "runs": best_metrics.get("runs", []) if best_metrics else [],
            "bw_htod": best_metrics.get("bw_htod") if best_metrics else None,
            "bw_dtoh": best_metrics.get("bw_dtoh") if best_metrics else None,
            "ncu_summary": best_metrics.get("ncu_summary", {}) if best_metrics else {},
        } if best_metrics or timers else None,
    )


# ---------------------------------------------------------------------------
# FASTAPI APP
# ---------------------------------------------------------------------------

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    print("\n" + "=" * 60)
    print("🚀 SERVER STARTING (MOCK MODE — no real model loading)")
    print("=" * 60 + "\n")


@app.on_event("shutdown")
async def shutdown_event():
    print("\n" + "=" * 60)
    print("🛑 SERVER SHUTTING DOWN")
    print("=" * 60 + "\n")


# ---------------------------------------------------------------------------
# WEBSOCKET ENDPOINT
# ---------------------------------------------------------------------------

@app.websocket("/c_to_cuda")
async def ws_c_to_cuda(websocket: WebSocket):
    await websocket.accept()

    try:
        # ===== STEP 0 — RECEIVE C CODE =====
        try:
            data = await websocket.receive_text()
            c_code = json.loads(data).get("c_code", SAMPLE_C_CODE)
            print("📥 Received C code from websocket client\n")
        except Exception:
            print("Client disconnected before sending C code.")
            return

        # ===== STEP 1 — SAVE C CODE (MOCK) =====
        source_dir = await asyncio.to_thread(mock_save_c_code, c_code)

        # ===== STEP 2 — PROFILING: GPROF (MOCK) =====
        print("Going for gprof profiling")
        execution_serial_time, flat_profile = await asyncio.to_thread(mock_run_gprof, source_dir)

        if execution_serial_time == -1:
            try:
                await websocket.send_json({"action": "error", "payload": f"C compilation failed:\n{flat_profile}"})
            except Exception:
                pass
            return

        def format_dynamic_time(time_ms: float) -> str:
            if time_ms < 0:
                return "N/A"
            if time_ms >= 1000.0:
                return f"{time_ms / 1000.0:.3f} s"
            return f"{time_ms:.3f} ms"

        print("gprof C Profiling completed.")
        try:
            time.sleep(1)  # Simulate some delay before sending results
            await websocket.send_json({
                "action": "gprof_profiling",
                "payload": {
                    "c_time": execution_serial_time,
                    "c_time_str": format_dynamic_time(execution_serial_time),
                    "time_profile": flat_profile,
                },
            })
        except Exception:
            return

        print("Sent gprof profiling data to websocket client.\n")

        # ===== STEP 2.5 — PROFILING: MCPROF (MOCK) =====
        print("Going for mcprof profiling")
        call_chain, memory_profile, call_graph_pdf, comm_pdf = await asyncio.to_thread(mock_run_mcprof, source_dir)
        print("mcprof C Profiling completed.")
        time.sleep(2)  # Simulate some delay before sending results

        c_graph_b64  = await asyncio.to_thread(mock_get_b64, call_graph_pdf)
        cm_graph_b64 = await asyncio.to_thread(mock_get_b64, comm_pdf)

        try:
            await websocket.send_json({
                "action": "mcprof_profiling",
                "payload": {
                    "memory_profile": memory_profile,
                    "call_graph": c_graph_b64,
                    "comm_graph": cm_graph_b64,
                },
            })
        except Exception:
            return

        print("Sent mcprof profiling data to websocket client.\n")

        # ===== STEP 3 — PROMPT GENERATION (MOCK) =====
        prompts = await asyncio.to_thread(mock_generating_prompt, source_dir)
        print(f"All prompt generation tasks completed. ({len(prompts)} prompts)")
        time.sleep(2)  # Simulate some delay before sending prompts
        try:
            await websocket.send_json({
                "action": "prompt_generation",
                "payload": {"prompts": prompts},
            })
        except Exception:
            return

        # ===== STEP 4 — LLM TRANSLATION / CUDA GENERATION (MOCK) =====
        def extract_code_block(text: str) -> str | None:
            start = text.find("```")
            if start == -1:
                return None
            first_newline = text.find("\n", start)
            if first_newline == -1:
                return None
            end = text.find("```", first_newline + 1)
            if end == -1:
                return None
            return text[first_newline + 1 : end].strip()

        # Reset mock call counters so indices are consistent per pipeline run
        mock_c_to_cuda_translate._idx = 0
        mock_save_and_compile_controller._idx = 0

        print("Starting LLM Generation Sequence...")
        cuda_codes_buffer = []

        for idx, prompt in enumerate(prompts):
            time.sleep(2)  # Simulate delay for LLM generation
            print(f"  Sending Prompt {idx + 1} to LLM (MOCK)...")
            try:
                llm_response = await asyncio.to_thread(mock_c_to_cuda_translate, prompt["prompt"])
                cuda_code = extract_code_block(llm_response)
                cuda_codes_buffer.append(cuda_code)
                try:
                    await websocket.send_json({
                        "action": "cuda_generation_chunk",
                        "payload": {"prompt_id": idx + 1, "cuda_code": cuda_code},
                    })
                except Exception:
                    pass
            except Exception as e:
                print(f"  Error generating prompt {idx + 1}: {e}")
                cuda_codes_buffer.append(None)
                try:
                    await websocket.send_json({
                        "action": "cuda_generation_chunk",
                        "payload": {"prompt_id": idx + 1, "cuda_code": None},
                    })
                except Exception:
                    pass

        print("All LLM Generation tasks completed.\n")

        # ===== STEP 5 — COMPILE GENERATED CODES (MOCK) =====
        print("Starting Hardware Compilation Sequence...")
        compiled_cuda_programs = []
        cuda_codes = []

        for idx, cuda_code in enumerate(cuda_codes_buffer):
            time.sleep(4)  # Simulate delay for compilation
            try:
                if cuda_code is None:
                    cuda_codes.append(None)
                    compiled_cuda_programs.append([None, None, idx + 1])
                    try:
                        await websocket.send_json({
                            "action": "cuda_compilation_chunk",
                            "payload": {"prompt_id": idx + 1, "compilable": False},
                        })
                    except Exception:
                        pass
                    continue

                print(f"  Compiling CUDA Generation {idx + 1} (MOCK)...")
                ok, err, compiled_path, clean_code = await asyncio.to_thread(
                    mock_save_and_compile_controller, cuda_code
                )
                cuda_codes.append(clean_code)
                compiled_cuda_programs.append(
                    [compiled_path, clean_code, idx + 1] if ok else [None, clean_code, idx + 1]
                )
                try:
                    await websocket.send_json({
                        "action": "cuda_compilation_chunk",
                        "payload": {"prompt_id": idx + 1, "compilable": ok},
                    })
                except Exception:
                    pass

            except Exception as e:
                print(f"  Compilation Exception for prompt {idx + 1}: {e}")
                compiled_cuda_programs.append([None, None, idx + 1])
                if len(cuda_codes) <= idx:
                    cuda_codes.append(None)
                try:
                    await websocket.send_json({
                        "action": "cuda_compilation_chunk",
                        "payload": {"prompt_id": idx + 1, "compilable": False},
                    })
                except Exception:
                    pass

        print("All Hardware Compilation tasks completed.")

        # ===== STEP 6 — EXECUTE & PROFILE (MOCK) =====
        timers = [-1.0] * len(cuda_codes)
        best_time = float("inf")
        best_code = "Error in evaluating CUDA programs."
        best_code_idx = 0
        first_program_dir = None
        best_metrics: dict = {}

        print("\nStarting Hardware Execution Sequence...")
        for idx, (path, code, prompt_id) in enumerate(compiled_cuda_programs):
            if path is None:
                timers[idx] = -1
                executable = False
                cuda_time = -1
            else:
                if first_program_dir is None:
                    import os
                    first_program_dir = os.path.dirname(os.path.abspath(path)) if "/" in path else "/tmp/mock_dir"

                print(f"  Executing CUDA program {idx + 1} (MOCK)...")
                success, error_msg, cuda_execution_time, _metrics = await asyncio.to_thread(
                    mock_execute_cuda_code, path
                )

                if success:
                    cuda_time_ms = cuda_execution_time * 1000.0
                    timers[idx] = cuda_time_ms
                    executable = True
                    cuda_time = cuda_time_ms
                    if cuda_time_ms < best_time:
                        best_time = cuda_time_ms
                        best_code = code
                        best_code_idx = idx
                        best_metrics = _metrics
                else:
                    timers[idx] = -2
                    executable = False
                    cuda_time = -1

            try:
                await websocket.send_json({
                    "action": "cuda_execution_chunk",
                    "payload": {
                        "prompt_id": prompt_id,
                        "executable": executable,
                        "cuda_time": cuda_time,
                        "cuda_time_str": format_dynamic_time(cuda_time) if executable else "N/A",
                    },
                })
            except Exception:
                pass

        print("Hardware Execution phase complete!")

        # ===== GENERATE PLOTS (MOCK) =====
        try:
            mock_save_all_performance_plots(
                first_program_dir,
                best_metrics.get("runs", []),
                best_metrics.get("ncu_kernel_summary", {}),
                best_metrics.get("bw_htod"),
                best_metrics.get("bw_dtoh"),
            )
            mock_save_candidates_comparison_plot(
                timers,
                first_program_dir,
                best_idx=best_code_idx if best_time < float("inf") else None,
            )
            print("[Graphs] Mock performance plots generated.")
        except Exception as plot_exc:
            print(f"[Graphs] Plot generation failed (non-fatal): {plot_exc}")

        # ===== FINAL RESULT =====
        try:
            await websocket.send_json({
                "action": "final_result",
                "payload": {
                    "cuda_code": best_code,
                    "cuda_time": best_time,
                    "performance_metrics": {
                        "timers": timers,
                        "runs": best_metrics.get("runs", []),
                        "bw_htod": best_metrics.get("bw_htod"),
                        "bw_dtoh": best_metrics.get("bw_dtoh"),
                        "ncu_summary": best_metrics.get("ncu_summary", {}),
                    },
                },
            })
        except Exception:
            await websocket.send_json({"action": "error", "payload": "Error deciding best CUDA code."})
            return

        # ===== SAVE TO DB (MOCK) =====
        try:
            history_payload = _build_history_payload(
                c_code=c_code,
                execution_serial_time=execution_serial_time,
                flat_profile=flat_profile,
                call_chain=call_chain,
                memory_profile=memory_profile,
                c_graph_base64=c_graph_b64,
                comm_graph_base64=cm_graph_b64,
                prompts=prompts,
                compiled_cuda_programs=compiled_cuda_programs,
                timers=timers,
                best_candidate=best_code_idx + 1,
                best_code=best_code,
                best_time=best_time,
                best_metrics=best_metrics,
            )
            saved_item = await asyncio.to_thread(mock_add_history_item, history_payload)
            print(f"History record saved successfully: {saved_item.get('id')}")
            try:
                await websocket.send_json({
                    "action": "history_saved",
                    "payload": {"id": saved_item.get("id")},
                })
            except Exception:
                pass
        except Exception as save_exc:
            print(f"Failed to save history record: {save_exc}")

    except Exception as e:
        try:
            await websocket.send_json({"action": "error", "payload": str(e)})
        except Exception:
            pass

    finally:
        try:
            await websocket.close()
        except Exception:
            pass