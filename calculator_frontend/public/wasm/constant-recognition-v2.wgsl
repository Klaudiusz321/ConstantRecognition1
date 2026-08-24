// Constant Recognition WebGPU v2
// GPU phase: FP32 screening. Every emitted candidate must be verified on CPU/WASM in FP64.

const MAX_K: u32 = 16u;
const MAX_OPS: u32 = 32u;
const WORKGROUP_SIZE: u32 = 256u;
const MAX_F32: f32 = 3.402823466e38;
const PI_F32: f32 = 3.14159265358979323846;
const SQRT_TWO_PI_F32: f32 = 2.50662827463100050242;

struct Params {
    // x = target, y = relative screening threshold
    target_threshold: vec4<f32>,
    // x = K, y = batch count, z = candidate capacity, w = workgroup count
    sizes: vec4<u32>,
    // x = terminal count, y = unary count, z = binary count, w = constant count
    counts: vec4<u32>,
    // x = mode (0 constant, 1 f(x), 2 F(C1,C2)), y = data-point count
    search: vec4<u32>,
}

struct FormData {
    ternary: array<u32, 16>,
    radix: array<u32, 16>,
    base_digits: array<u32, 16>,
    constant_ops: array<u32, 32>,
    unary_ops: array<u32, 32>,
    binary_ops: array<u32, 32>,
}

struct Candidate {
    local_index: u32,
    relative_error: f32,
    value: f32,
    flags: u32,
}

struct CandidateBuffer {
    values: array<Candidate>,
}

struct SearchState {
    count: atomic<u32>,
    overflow: atomic<u32>,
    _pad0: u32,
    _pad1: u32,
}

struct DataPoint {
    // x = first variable, y = second variable, z = target, w = optional dy
    values: vec4<f32>,
}

struct DataPointBuffer {
    values: array<DataPoint>,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> form_data: FormData;
@group(0) @binding(2) var<storage, read_write> candidates: CandidateBuffer;
@group(0) @binding(3) var<storage, read_write> state: SearchState;
@group(0) @binding(4) var<storage, read_write> group_best: CandidateBuffer;
@group(0) @binding(5) var<storage, read> data_points: DataPointBuffer;

var<workgroup> wg_error: array<f32, 256>;
var<workgroup> wg_value: array<f32, 256>;
var<workgroup> wg_index: array<u32, 256>;
var<workgroup> wg_valid: array<u32, 256>;

struct EvalResult {
    value: f32,
    valid: u32,
}

fn finite_f32(value: f32) -> bool {
    // NaN is the only floating-point value not equal to itself. Infinite
    // values compare greater than the largest finite f32 magnitude.
    return value == value && abs(value) < MAX_F32;
}

fn constant_value(op: u32) -> f32 {
    switch op {
        case 0u: { return PI_F32; }
        case 1u: { return 2.71828182845904523536; }
        case 2u: { return -1.0; }
        case 3u: { return 1.61803398874989484820; }
        case 4u: { return 1.0; }
        case 5u: { return 2.0; }
        case 6u: { return 3.0; }
        case 7u: { return 4.0; }
        case 8u: { return 5.0; }
        case 9u: { return 6.0; }
        case 10u: { return 7.0; }
        case 11u: { return 8.0; }
        case 12u: { return 9.0; }
        default: { return MAX_F32; }
    }
}

// Lanczos g=7 approximation. It is a screening approximation only; the CPU/WASM
// verifier remains authoritative. Recursion is avoided because WGSL forbids it.
fn gamma_lanczos(input: f32) -> f32 {
    if (!finite_f32(input)) {
        return MAX_F32;
    }

    let reflected = input < 0.5;
    var z = select(input, 1.0 - input, reflected);
    z = z - 1.0;

    var x = 0.99999999999980993;
    x = x + 676.5203681218851 / (z + 1.0);
    x = x - 1259.1392167224028 / (z + 2.0);
    x = x + 771.32342877765313 / (z + 3.0);
    x = x - 176.61502916214059 / (z + 4.0);
    x = x + 12.507343278686905 / (z + 5.0);
    x = x - 0.13857109526572012 / (z + 6.0);
    x = x + 9.9843695780195716e-6 / (z + 7.0);
    x = x + 1.5056327351493116e-7 / (z + 8.0);

    let t = z + 7.5;
    let ordinary = SQRT_TWO_PI_F32 * pow(t, z + 0.5) * exp(-t) * x;
    if (!reflected) {
        return ordinary;
    }

    let denominator = sin(PI_F32 * input) * ordinary;
    return PI_F32 / denominator;
}

fn apply_unary(op: u32, x: f32) -> f32 {
    switch op {
        case 0u: { return log(x); }
        case 1u: { return exp(x); }
        case 2u: { return 1.0 / x; }
        case 3u: { return gamma_lanczos(x); }
        case 4u: { return sqrt(x); }
        case 5u: { return x * x; }
        case 6u: { return sin(x); }
        case 7u: { return asin(x); }
        case 8u: { return cos(x); }
        case 9u: { return acos(x); }
        case 10u: { return tan(x); }
        case 11u: { return atan(x); }
        case 12u: { return sinh(x); }
        case 13u: { return asinh(x); }
        case 14u: { return cosh(x); }
        case 15u: { return acosh(x); }
        case 16u: { return tanh(x); }
        case 17u: { return atanh(x); }
        default: { return MAX_F32; }
    }
}

// IMPORTANT: this matches vsearch_RPN_core.c, which calls func(top, below).
// Therefore SUBTRACT is top-below, DIVIDE is top/below and POWER is top^below.
fn apply_binary_core_order(op: u32, top: f32, below: f32) -> f32 {
    switch op {
        case 0u: { return top + below; }
        case 1u: { return top * below; }
        case 2u: { return top - below; }
        case 3u: { return top / below; }
        case 4u: { return pow(top, below); }
        default: { return MAX_F32; }
    }
}

// Add a u32 local offset to a CPU-provided mixed-radix base. The CPU stores the
// full tile start as bigint; this avoids any u64 requirement in WGSL.
fn decode_slots(local_index: u32, K: u32, slots: ptr<function, array<u32, 16>>) {
    var carry = local_index;
    for (var reverse = 0u; reverse < K; reverse = reverse + 1u) {
        let position = K - 1u - reverse;
        let radix = max(form_data.radix[position], 1u);
        let addend = carry % radix;
        carry = carry / radix;

        var sum = form_data.base_digits[position] + addend;
        if (sum >= radix) {
            sum = sum - radix;
            carry = carry + 1u;
        }
        (*slots)[position] = sum;
    }
}

fn evaluate_expression(
    slots: ptr<function, array<u32, 16>>,
    K: u32,
    variable_values: vec2<f32>,
) -> EvalResult {
    var stack: array<f32, 16>;
    var sp = 0u;

    for (var i = 0u; i < K; i = i + 1u) {
        let kind = form_data.ternary[i];
        let slot = (*slots)[i];

        if (kind == 0u) {
            if (sp >= MAX_K || slot >= params.counts.x) {
                return EvalResult(0.0, 0u);
            }
            var value = MAX_F32;
            if (slot < params.counts.w) {
                value = constant_value(form_data.constant_ops[slot]);
            } else {
                let variable_index = slot - params.counts.w;
                if (variable_index >= 2u) {
                    return EvalResult(0.0, 0u);
                }
                value = select(variable_values.x, variable_values.y, variable_index == 1u);
            }
            stack[sp] = value;
            sp = sp + 1u;
        } else if (kind == 1u) {
            if (sp < 1u || slot >= params.counts.y) {
                return EvalResult(0.0, 0u);
            }
            // Deliberately retain non-finite intermediates. vsearch_RPN_core.c
            // only rejects a non-finite final value, and operations such as
            // INV can turn an overflowed intermediate into a finite result.
            let value = apply_unary(form_data.unary_ops[slot], stack[sp - 1u]);
            stack[sp - 1u] = value;
        } else {
            if (sp < 2u || slot >= params.counts.z) {
                return EvalResult(0.0, 0u);
            }
            sp = sp - 1u;
            let top = stack[sp];
            let below = stack[sp - 1u];
            let value = apply_binary_core_order(form_data.binary_ops[slot], top, below);
            stack[sp - 1u] = value;
        }
    }

    if (sp != 1u || !finite_f32(stack[0])) {
        return EvalResult(0.0, 0u);
    }
    return EvalResult(stack[0], 1u);
}

fn contains_all_variables(slots: ptr<function, array<u32, 16>>, K: u32) -> bool {
    let variable_count = params.counts.x - params.counts.w;
    var found = vec2<u32>(0u, 0u);
    for (var i = 0u; i < K; i = i + 1u) {
        if (form_data.ternary[i] == 0u && (*slots)[i] >= params.counts.w) {
            let variable_index = (*slots)[i] - params.counts.w;
            if (variable_index == 0u) { found.x = 1u; }
            if (variable_index == 1u) { found.y = 1u; }
        }
    }
    return variable_count >= 1u && found.x == 1u && (variable_count == 1u || found.y == 1u);
}

fn relative_error(value: f32, target_value: f32) -> f32 {
    if (target_value == 0.0) {
        return abs(value);
    }
    return abs(value / target_value - 1.0);
}

@compute @workgroup_size(256)
fn search(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_index) local_id: u32,
    @builtin(workgroup_id) workgroup_id: vec3<u32>,
) {
    let local_index = global_id.x;
    var value = 0.0;
    var error = MAX_F32;
    var valid = 0u;

    if (local_index < params.sizes.y) {
        var slots: array<u32, 16>;
        decode_slots(local_index, params.sizes.x, &slots);

        if (params.search.x != 0u) {
            if (contains_all_variables(&slots, params.sizes.x)) {
                var total_error = 0.0;
                var first_value = 0.0;
                for (var point_index = 0u; point_index < params.search.y; point_index = point_index + 1u) {
                    let point = data_points.values[point_index].values;
                    let evaluated = evaluate_expression(&slots, params.sizes.x, point.xy);
                    if (point_index == 0u) {
                        first_value = evaluated.value;
                    }
                    if (evaluated.valid == 0u) {
                        total_error = total_error + 1e10;
                    } else {
                        let scale = select(1.0, point.w, point.w > 0.0);
                        let residual = (evaluated.value - point.z) / scale;
                        total_error = total_error + residual * residual;
                    }
                }
                value = first_value;
                error = total_error / f32(max(params.search.y, 1u));
                valid = select(0u, 1u, finite_f32(error));
            }
        } else {
            let evaluated = evaluate_expression(&slots, params.sizes.x, vec2<f32>(0.0, 0.0));
            if (evaluated.valid == 1u) {
                value = evaluated.value;
                error = relative_error(value, params.target_threshold.x);
                valid = select(0u, 1u, finite_f32(error));
            }
        }

        if (valid == 1u && error <= params.target_threshold.y) {
            let output_index = atomicAdd(&state.count, 1u);
            if (output_index < params.sizes.z) {
                candidates.values[output_index] = Candidate(local_index, error, value, 1u);
            } else {
                atomicStore(&state.overflow, 1u);
            }
        }
    }

    wg_error[local_id] = error;
    wg_value[local_id] = value;
    wg_index[local_id] = local_index;
    wg_valid[local_id] = valid;
    workgroupBarrier();

    for (var stride = WORKGROUP_SIZE / 2u; stride > 0u; stride = stride / 2u) {
        if (local_id < stride) {
            let other = local_id + stride;
            let other_valid = wg_valid[other];
            let this_valid = wg_valid[local_id];
            let other_is_better = other_valid == 1u && (
                this_valid == 0u ||
                wg_error[other] < wg_error[local_id] ||
                (wg_error[other] == wg_error[local_id] && wg_index[other] < wg_index[local_id])
            );
            if (other_is_better) {
                wg_error[local_id] = wg_error[other];
                wg_value[local_id] = wg_value[other];
                wg_index[local_id] = wg_index[other];
                wg_valid[local_id] = 1u;
            }
        }
        workgroupBarrier();
    }

    if (local_id == 0u && workgroup_id.x < params.sizes.w) {
        group_best.values[workgroup_id.x] = Candidate(
            wg_index[0], wg_error[0], wg_value[0], wg_valid[0]
        );
    }
}
