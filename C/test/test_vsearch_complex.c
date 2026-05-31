#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define USE_COMPLEX 1

#include "../vsearch_RPN_core.h"
#include "../CALC4.h"

int test_complex_euler(void) {
    printf("Running test_complex_euler... ");
    
    // Euler's identity: e^(i*pi) = -1
    // We want to find the constant -1
    // Target is -1 + 0i
    double complex target = -1.0 + 0.0 * I;
    
    char* result = search_constant(
        target, 0.0,
        1, 6,
        0, 1,
        CALC4_CONSTS, CALC4_N_CONST,
        CALC4_FUNCS,  CALC4_N_UNARY,
        CALC4_OPS,    CALC4_N_BINARY,
        ERROR_ABS,
        COMPARE_STRICT);
    
    int passed = 0;
    if (strstr(result, "\"SUCCESS\"") != NULL) {
        passed = 1;
        printf("[PASS]\n");
    } else {
        printf("[FAIL]\n");
        printf("Output: %s\n", result);
    }
    
    free(result);
    return passed;
}

int main() {
    printf("=== Backend Complex Search Tests ===\n");
    int passed = 0;
    int total = 1;
    
    passed += test_complex_euler();
    
    printf("=====================================\n");
    printf("Results: %d/%d passed\n", passed, total);
    
    if (passed == total) {
        return 0;
    } else {
        return 1;
    }
}
