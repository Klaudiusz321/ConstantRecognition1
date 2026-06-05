// Function/sequence recognition - WebGPU real-valued compute shader.
// Constant slots include one extra symbol: x.

const PI: f32 = 3.14159265358979323846;
const E: f32 = 2.71828182845904523536;
const PHI: f32 = 1.61803398874989484820;
const NEG_ONE: f32 = -1.0;
const SQRT_TWO_PI: f32 = 2.50662827463100050242;
const MAX_RESULTS: u32 = 16384u;

struct Params {
    threshold: f32,
    K: u32,
    total_combinations: u32,
    point_count: u32,
    form_radix_0: vec4<u32>,
    form_radix_1: vec4<u32>,
    form_radix_2: vec4<u32>,
    batch_start: u32,
    _pad1: u32,
    _pad2: u32,
    _pad3: u32,
}

struct Point {
    x: f32,
    y: f32,
}

struct Counter {
    count: atomic<u32>
}

struct Result {
    error: f32,
    idx: u32,
    valid: u32,
    _pad: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> ternary_form: array<u32>;
@group(0) @binding(2) var<storage, read> points: array<Point>;
@group(0) @binding(3) var<storage, read_write> results: array<Result>;
@group(0) @binding(4) var<storage, read_write> global_counter: Counter;

fn get_constant(idx: u32, x: f32) -> f32 {
    switch idx {
        case 0u: { return x; }
        case 1u: { return PI; }
        case 2u: { return E; }
        case 3u: { return NEG_ONE; }
        case 4u: { return PHI; }
        case 5u: { return 1.0; }
        case 6u: { return 2.0; }
        case 7u: { return 3.0; }
        case 8u: { return 4.0; }
        case 9u: { return 5.0; }
        case 10u: { return 6.0; }
        case 11u: { return 7.0; }
        case 12u: { return 8.0; }
        case 13u: { return 9.0; }
        default: { return 0.0; }
    }
}

fn gamma_lanczos_core(z: f32) -> f32 {
    let shifted = z - 1.0;
    var x = 0.99999999999980993;
    x = x + 676.5203681218851 / (shifted + 1.0);
    x = x - 1259.1392167224028 / (shifted + 2.0);
    x = x + 771.32342877765313 / (shifted + 3.0);
    x = x - 176.61502916214059 / (shifted + 4.0);
    x = x + 12.507343278686905 / (shifted + 5.0);
    x = x - 0.13857109526572012 / (shifted + 6.0);
    x = x + 0.000009984369578019572 / (shifted + 7.0);
    x = x + 0.00000015056327351493116 / (shifted + 8.0);
    let t = shifted + 7.5;
    return SQRT_TWO_PI * pow(t, shifted + 0.5) * exp(-t) * x;
}

fn gamma_lanczos(z: f32) -> f32 {
    if (z < 0.5) {
        return PI / (sin(PI * z) * gamma_lanczos_core(1.0 - z));
    }
    return gamma_lanczos_core(z);
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
        default: { return x; }
    }
}

fn apply_binary(op: u32, a: f32, b: f32) -> f32 {
    switch op {
        case 0u: { return a + b; }
        case 1u: { return a * b; }
        case 2u: { return a - b; }
        case 3u: { return a / b; }
        case 4u: { return pow(a, b); }
        default: { return 0.0; }
    }
}

fn get_radix(i: u32) -> u32 {
    if (i < 4u) {
        return params.form_radix_0[i];
    } else if (i < 8u) {
        return params.form_radix_1[i - 4u];
    }
    return params.form_radix_2[i - 8u];
}

fn idx_to_slots(idx: u32, K: u32, slots: ptr<function, array<u32, 12>>) {
    var remaining = idx;
    for (var i = 0u; i < K; i++) {
        let radix = get_radix(i);
        (*slots)[i] = remaining % radix;
        remaining = remaining / radix;
    }
}

fn uses_variable(slots: ptr<function, array<u32, 12>>, K: u32) -> bool {
    for (var i = 0u; i < K; i++) {
        if (ternary_form[i] == 0u && (*slots)[i] == 0u) {
            return true;
        }
    }
    return false;
}

fn evaluate_rpn(slots: ptr<function, array<u32, 12>>, K: u32, x_value: f32) -> f32 {
    var stack: array<f32, 16>;
    var sp: u32 = 0u;

    for (var i = 0u; i < K; i++) {
        let t = ternary_form[i];
        let slot = (*slots)[i];

        if (t == 0u) {
            stack[sp] = get_constant(slot, x_value);
            sp = sp + 1u;
        } else if (t == 1u) {
            if (sp >= 1u) {
                stack[sp - 1u] = apply_unary(slot, stack[sp - 1u]);
            }
        } else {
            if (sp >= 2u) {
                sp = sp - 1u;
                stack[sp - 1u] = apply_binary(slot, stack[sp], stack[sp - 1u]);
            }
        }
    }

    if (sp == 1u) {
        return stack[0];
    }
    return 1e38;
}

fn is_bad(v: f32) -> bool {
    return !(v == v) || abs(v) > 3.4e38;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= params.total_combinations || params.point_count == 0u) {
        return;
    }

    let real_idx = idx + params.batch_start;
    var slots: array<u32, 12>;
    idx_to_slots(real_idx, params.K, &slots);

    if (!uses_variable(&slots, params.K)) {
        return;
    }

    var mse = 0.0;
    for (var point_index = 0u; point_index < params.point_count; point_index++) {
        let computed = evaluate_rpn(&slots, params.K, points[point_index].x);
        if (is_bad(computed)) {
            return;
        }
        let diff = computed - points[point_index].y;
        mse = mse + diff * diff;
    }
    mse = mse / f32(params.point_count);

    if (mse < params.threshold) {
        let write_index = atomicAdd(&global_counter.count, 1u);
        if (write_index < MAX_RESULTS) {
            results[write_index].error = mse;
            results[write_index].idx = real_idx;
            results[write_index].valid = 1u;
        }
    }
}
