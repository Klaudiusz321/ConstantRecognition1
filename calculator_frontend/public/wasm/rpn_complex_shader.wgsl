// Constant Recognition - WebGPU Complex Compute Shader
// Evaluates complex RPN expressions in parallel on GPU/Metal/D3D/Vulkan.

const PI: f32 = 3.14159265358979323846;
const E: f32 = 2.71828182845904523536;
const PHI: f32 = 1.61803398874989484820;
const NEG_ONE: f32 = -1.0;
const SQRT_TWO_PI: f32 = 2.50662827463100050242;

const N_CONST: u32 = 14u;
const STACK_SIZE: u32 = 16u;

struct Params {
    search_target: vec2<f32>,
    threshold: f32,
    K: u32,
    total_combinations: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
    form_radix_0: vec4<u32>,
    form_radix_1: vec4<u32>,
    form_radix_2: vec4<u32>,
    batch_start: u32,
    _pad3: u32,
    _pad4: u32,
    _pad5: u32,
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
@group(0) @binding(2) var<storage, read_write> results: array<Result>;
@group(0) @binding(3) var<storage, read_write> global_counter: Counter;

fn cabs(z: vec2<f32>) -> f32 {
    return length(z);
}

fn atan2_compat(y: f32, x: f32) -> f32 {
    if (x > 0.0) {
        return atan(y / x);
    }
    if (x < 0.0 && y >= 0.0) {
        return atan(y / x) + PI;
    }
    if (x < 0.0 && y < 0.0) {
        return atan(y / x) - PI;
    }
    if (x == 0.0 && y > 0.0) {
        return PI * 0.5;
    }
    if (x == 0.0 && y < 0.0) {
        return -PI * 0.5;
    }
    return 0.0;
}

fn sinh_compat(x: f32) -> f32 {
    return 0.5 * (exp(x) - exp(-x));
}

fn cosh_compat(x: f32) -> f32 {
    return 0.5 * (exp(x) + exp(-x));
}

fn cadd(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return a + b;
}

fn csub(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return a - b;
}

fn cmul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

fn cdiv(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    let denom = b.x * b.x + b.y * b.y;
    return vec2<f32>(
        (a.x * b.x + a.y * b.y) / denom,
        (a.y * b.x - a.x * b.y) / denom
    );
}

fn cexp(z: vec2<f32>) -> vec2<f32> {
    let scale = exp(z.x);
    return vec2<f32>(scale * cos(z.y), scale * sin(z.y));
}

fn clog(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(log(cabs(z)), atan2_compat(z.y, z.x));
}

fn cpow(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return cexp(cmul(b, clog(a)));
}

fn csqrt(z: vec2<f32>) -> vec2<f32> {
    let r = cabs(z);
    let real = sqrt(max(0.0, (r + z.x) * 0.5));
    let negative_zero = bitcast<u32>(z.y) == 0x80000000u;
    let sign = select(1.0, -1.0, z.y < 0.0 || negative_zero);
    let imag = sign * sqrt(max(0.0, (r - z.x) * 0.5));
    return vec2<f32>(real, imag);
}

fn csin(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(sin(z.x) * cosh_compat(z.y), cos(z.x) * sinh_compat(z.y));
}

fn ccos(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(cos(z.x) * cosh_compat(z.y), -sin(z.x) * sinh_compat(z.y));
}

fn ctan(z: vec2<f32>) -> vec2<f32> {
    return cdiv(csin(z), ccos(z));
}

fn csinh(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(sinh_compat(z.x) * cos(z.y), cosh_compat(z.x) * sin(z.y));
}

fn ccosh(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(cosh_compat(z.x) * cos(z.y), sinh_compat(z.x) * sin(z.y));
}

fn ctanh(z: vec2<f32>) -> vec2<f32> {
    return cdiv(csinh(z), ccosh(z));
}

fn casin(z: vec2<f32>) -> vec2<f32> {
    let iz = vec2<f32>(-z.y, z.x);
    let z2 = cmul(z, z);
    let one_minus_z2 = vec2<f32>(1.0 - z2.x, -z2.y);
    let term = cadd(iz, csqrt(one_minus_z2));
    let ln_term = clog(term);
    return vec2<f32>(ln_term.y, -ln_term.x);
}

fn cacos(z: vec2<f32>) -> vec2<f32> {
    let asin_z = casin(z);
    return vec2<f32>(PI * 0.5 - asin_z.x, -asin_z.y);
}

fn catan(z: vec2<f32>) -> vec2<f32> {
    let num = vec2<f32>(z.x, 1.0 + z.y);
    let den = vec2<f32>(-z.x, 1.0 - z.y);
    let ln_term = clog(cdiv(num, den));
    return vec2<f32>(-ln_term.y * 0.5, ln_term.x * 0.5);
}

fn casinh(z: vec2<f32>) -> vec2<f32> {
    let z2 = cmul(z, z);
    return clog(cadd(z, csqrt(vec2<f32>(z2.x + 1.0, z2.y))));
}

fn cacosh(z: vec2<f32>) -> vec2<f32> {
    let z_minus_1 = vec2<f32>(z.x - 1.0, z.y);
    let z_plus_1 = vec2<f32>(z.x + 1.0, z.y);
    return clog(cadd(z, cmul(csqrt(z_minus_1), csqrt(z_plus_1))));
}

fn catanh(z: vec2<f32>) -> vec2<f32> {
    let t1 = clog(vec2<f32>(1.0 + z.x, z.y));
    let t2 = clog(vec2<f32>(1.0 - z.x, -z.y));
    return csub(t1, t2) * 0.5;
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

fn get_constant(idx: u32) -> vec2<f32> {
    switch idx {
        case 0u: { return vec2<f32>(PI, 0.0); }
        case 1u: { return vec2<f32>(E, 0.0); }
        case 2u: { return vec2<f32>(NEG_ONE, 0.0); }
        case 3u: { return vec2<f32>(PHI, 0.0); }
        case 4u: { return vec2<f32>(0.0, 1.0); }
        case 5u: { return vec2<f32>(1.0, 0.0); }
        case 6u: { return vec2<f32>(2.0, 0.0); }
        case 7u: { return vec2<f32>(3.0, 0.0); }
        case 8u: { return vec2<f32>(4.0, 0.0); }
        case 9u: { return vec2<f32>(5.0, 0.0); }
        case 10u: { return vec2<f32>(6.0, 0.0); }
        case 11u: { return vec2<f32>(7.0, 0.0); }
        case 12u: { return vec2<f32>(8.0, 0.0); }
        case 13u: { return vec2<f32>(9.0, 0.0); }
        default: { return vec2<f32>(0.0, 0.0); }
    }
}

fn apply_unary(op: u32, x: vec2<f32>) -> vec2<f32> {
    switch op {
        case 0u: { return clog(x); }
        case 1u: { return cexp(x); }
        case 2u: { return cdiv(vec2<f32>(1.0, 0.0), x); }
        case 3u: { return vec2<f32>(gamma_lanczos(x.x), 0.0); }
        case 4u: { return csqrt(x); }
        case 5u: { return cmul(x, x); }
        case 6u: { return csin(x); }
        case 7u: { return casin(x); }
        case 8u: { return ccos(x); }
        case 9u: { return cacos(x); }
        case 10u: { return ctan(x); }
        case 11u: { return catan(x); }
        case 12u: { return csinh(x); }
        case 13u: { return casinh(x); }
        case 14u: { return ccosh(x); }
        case 15u: { return cacosh(x); }
        case 16u: { return ctanh(x); }
        case 17u: { return catanh(x); }
        default: { return x; }
    }
}

fn apply_binary(op: u32, a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    switch op {
        case 0u: { return cadd(a, b); }
        case 1u: { return cmul(a, b); }
        case 2u: { return csub(a, b); }
        case 3u: { return cdiv(a, b); }
        case 4u: { return cpow(a, b); }
        default: { return vec2<f32>(0.0, 0.0); }
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

fn evaluate_rpn(slots: ptr<function, array<u32, 12>>, K: u32) -> vec2<f32> {
    var stack: array<vec2<f32>, 16>;
    var sp: u32 = 0u;

    for (var i = 0u; i < K; i++) {
        let t = ternary_form[i];
        let slot = (*slots)[i];

        if (t == 0u) {
            stack[sp] = get_constant(slot);
            sp = sp + 1u;
        } else if (t == 1u) {
            if (sp >= 1u) {
                stack[sp - 1u] = apply_unary(slot, stack[sp - 1u]);
            }
        } else {
            if (sp >= 2u) {
                sp = sp - 1u;
                stack[sp - 1u] = apply_binary(slot, stack[sp - 1u], stack[sp]);
            }
        }
    }

    if (sp == 1u) {
        return stack[0];
    }
    return vec2<f32>(1e38, 1e38);
}

fn is_nan2(v: vec2<f32>) -> bool {
    return !(v.x == v.x) || !(v.y == v.y);
}

fn is_inf2(v: vec2<f32>) -> bool {
    return abs(v.x) > 3.4e38 || abs(v.y) > 3.4e38;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= params.total_combinations) {
        return;
    }

    let real_idx = idx + params.batch_start;
    var slots: array<u32, 12>;
    idx_to_slots(real_idx, params.K, &slots);

    let computed = evaluate_rpn(&slots, params.K);
    if (is_nan2(computed) || is_inf2(computed)) {
        return;
    }

    let diff = cabs(computed - params.search_target);
    if (diff < params.threshold) {
        let write_index = atomicAdd(&global_counter.count, 1u);
        if (write_index < 1024u) {
            results[write_index].error = diff;
            results[write_index].idx = real_idx;
            results[write_index].valid = 1u;
        }
    }
}
