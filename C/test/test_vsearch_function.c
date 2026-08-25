#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

#include "../vsearch_RPN_core.h"
#include "../CALC4.h"

int test_function_square(void) {
    printf("Running test_function_square... ");
    
    DataPoint data[] = {
        {0.0, 0.0, 0.0},
        {1.0, 1.0, 0.0},
        {2.0, 4.0, 0.0},
        {3.0, 9.0, 0.0},
        {4.0, 16.0, 0.0}
    };
    int n_data = sizeof(data) / sizeof(data[0]);
    
    char* result = search_function(
        data, n_data,
        1, 4,
        0, 1,
        CALC4_CONSTS, CALC4_N_CONST,
        CALC4_FUNCS,  CALC4_N_UNARY,
        CALC4_OPS,    CALC4_N_BINARY,
        ERROR_MSE,
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

int test_function_linear(void) {
    printf("Running test_function_linear... ");
    
    DataPoint data[] = {
        {1.0, 3.14159265, 0.0},
        {2.0, 6.28318530, 0.0},
        {3.0, 9.42477796, 0.0},
        {4.0, 12.56637061, 0.0}
    };
    int n_data = sizeof(data) / sizeof(data[0]);
    
    char* result = search_function(
        data, n_data,
        1, 5,
        0, 1,
        CALC4_CONSTS, CALC4_N_CONST,
        CALC4_FUNCS,  CALC4_N_UNARY,
        CALC4_OPS,    CALC4_N_BINARY,
        ERROR_MSE,
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

int test_k_and_worker_contract(void) {
    printf("Running test_k_and_worker_contract... ");
    DataPoint data[] = {{0.0, 0.0, 0.0}};

    char* invalid_k = search_function(
        data, 1,
        1, 33,
        0, 1,
        CALC4_CONSTS, CALC4_N_CONST,
        CALC4_FUNCS,  CALC4_N_UNARY,
        CALC4_OPS,    CALC4_N_BINARY,
        ERROR_MSE,
        COMPARE_STRICT);
    char* invalid_workers = search_function(
        data, 1,
        1, 2,
        0, 0,
        CALC4_CONSTS, CALC4_N_CONST,
        CALC4_FUNCS,  CALC4_N_UNARY,
        CALC4_OPS,    CALC4_N_BINARY,
        ERROR_MSE,
        COMPARE_STRICT);

    int passed = invalid_k != NULL && invalid_workers != NULL &&
        strstr(invalid_k, "MinK") != NULL &&
        strstr(invalid_workers, "ncpus") != NULL;
    printf(passed ? "[PASS]\n" : "[FAIL]\n");
    if (!passed) {
        printf("K output: %s\nWorker output: %s\n",
               invalid_k ? invalid_k : "(null)",
               invalid_workers ? invalid_workers : "(null)");
    }
    free(invalid_k);
    free(invalid_workers);
    return passed;
}

int main() {
    printf("=== Backend Function Search Tests ===\n");
    int passed = 0;
    int total = 3;
    
    passed += test_function_square();
    passed += test_function_linear();
    passed += test_k_and_worker_contract();
    
    printf("=====================================\n");
    printf("Results: %d/%d passed\n", passed, total);
    
    if (passed == total) {
        return 0;
    } else {
        return 1;
    }
}
