#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../bidirectional_search.h"
#include "../CALC4.h"

static char* run(double target, int max_k) {
    return search_bidirectional_constant(
        target, 0.0, max_k,
        CALC4_CONSTS, CALC4_N_CONST,
        CALC4_FUNCS, CALC4_N_UNARY,
        CALC4_OPS, CALC4_N_BINARY,
        0.9);
}

static char* run_forward(double target, int max_k) {
    return search_constant_with_cr(
        target, 0.0, 1, max_k, 0, 1,
        CALC4_CONSTS, CALC4_N_CONST,
        CALC4_FUNCS, CALC4_N_UNARY,
        CALC4_OPS, CALC4_N_BINARY,
        ERROR_REL, COMPARE_STRICT, 0.9);
}

static double constant_value(const char* name) {
    for (int i = 0; i < CALC4_N_CONST; i++) {
        if (strcmp(CALC4_CONSTS[i].name, name) == 0) return CALC4_CONSTS[i].value;
    }
    assert(!"Unknown test constant");
    return NAN;
}

static double apply_unary(const char* name, double value) {
    for (int i = 0; i < CALC4_N_UNARY; i++) {
        if (strcmp(CALC4_FUNCS[i].name, name) == 0) return CALC4_FUNCS[i].func(value);
    }
    assert(!"Unknown test unary operation");
    return NAN;
}

static double apply_binary(const char* name, double top, double below) {
    for (int i = 0; i < CALC4_N_BINARY; i++) {
        if (strcmp(CALC4_OPS[i].name, name) == 0) return CALC4_OPS[i].func(top, below);
    }
    assert(!"Unknown test binary operation");
    return NAN;
}

static void assert_same_minimal_k(double target, int max_k, int expected_k) {
    char expected[32];
    snprintf(expected, sizeof(expected), "\"K\":%d", expected_k);
    char* bidirectional = run(target, max_k);
    char* forward = run_forward(target, max_k);
    assert(bidirectional != NULL && forward != NULL);
    if (strstr(bidirectional, "\"result\":\"SUCCESS\"") == NULL ||
        strstr(forward, "\"result\":\"SUCCESS\"") == NULL) {
        fprintf(stderr, "Differential target %.17g (K<=%d)\nBIDI: %s\nFORWARD: %s\n",
                target, max_k, bidirectional, forward);
    }
    assert(strstr(bidirectional, "\"result\":\"SUCCESS\"") != NULL);
    assert(strstr(forward, "\"result\":\"SUCCESS\"") != NULL);
    assert(strstr(bidirectional, expected) != NULL);
    assert(strstr(forward, expected) != NULL);
    free(bidirectional);
    free(forward);
}

int main(void) {
    char* direct = run(M_PI, 9);
    assert(direct != NULL);
    assert(strstr(direct, "\"result\":\"SUCCESS\"") != NULL);
    assert(strstr(direct, "\"RPN\":\"PI\"") != NULL);
    assert(strstr(direct, "\"K\":1") != NULL);
    assert(strstr(direct, "\"minimality_proven\":true") != NULL);
    free(direct);

    /* Core RPN order: PI EULER PLUS TWO TIMES = 2 * (PI + E). */
    double k5_target = 2.0 * (M_PI + M_E);
    char* k5 = run(k5_target, 5);
    assert(k5 != NULL);
    assert(strstr(k5, "\"result\":\"SUCCESS\"") != NULL);
    assert(strstr(k5, "\"K\":5") != NULL);
    assert(strstr(k5, "\"strategy\":\"BIDIRECTIONAL_MITM\"") != NULL);
    assert(strstr(k5, "\"minimality_proven\":true") != NULL);
    free(k5);

    /* Differential checks against the established exhaustive enumerator.
       These cover constants, unary roots and both non-commutative inverses. */
    const double pi = constant_value("PI");
    const double euler = constant_value("EULER");
    const double two = constant_value("TWO");
    assert_same_minimal_k(apply_unary("SIN", pi), 2, 2);
    assert_same_minimal_k(apply_binary("SUBTRACT", pi, euler), 3, 3);
    assert_same_minimal_k(apply_binary("DIVIDE", two, pi), 3, 3);
    assert_same_minimal_k(
        apply_unary("SIN", apply_binary("PLUS", euler, pi)), 4, 4);

    /* Balanced K=7 root join: (PI + E) * (2 + PI). */
    double k7_target = (M_PI + M_E) * (2.0 + M_PI);
    char* k7 = run(k7_target, 7);
    assert(k7 != NULL);
    assert(strstr(k7, "\"result\":\"SUCCESS\"") != NULL);
    assert(strstr(k7, "\"fallback_required\":true") != NULL);
    assert(strstr(k7, "\"frontier_entries\":") != NULL);
    free(k7);

    char* invalid = run(1.0, BIDIRECTIONAL_MAX_K + 1);
    assert(invalid != NULL);
    assert(strstr(invalid, "\"result\":\"ERROR\"") != NULL);
    free(invalid);

    puts("bidirectional native audit PASS");
    return 0;
}
