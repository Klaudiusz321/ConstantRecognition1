/* vsearch_RPN_wasm.c - WASM wrapper for JS frontend
 *
 * Author: Andrzej Odrzywolek, andrzej.odrzywolek@uj.edu.pl
 * Date: January 2, 2025
 *
 * This file provides:
 *   - String parsing for runtime-configurable calculators
 *   - WASM exported functions for JavaScript frontend
 *   - Backward compatibility with existing web interface
 *
 * Compilation:
 *   emcc -O2 -Wall vsearch_RPN_wasm.c vsearch_RPN_core.c utils.c -s WASM=1 -s EXPORTED_FUNCTIONS='["_search_RPN","_search_RPN_with_cr","_search_RPN_hybrid","_vsearch_RPN","_free"]'  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]'  -o vsearch.js
 *
 * WebAssembly (emcc, Windows):
 * Install emsdk
 *
 * git clone https://github.com/emscripten-core/emsdk.git
 * cd emsdk
 * emsdk> .\emsdk install latest
 *        .\emsdk activate latest
 */

#ifdef _WIN32
#define strdup _strdup
#endif

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "vsearch_RPN_core.h"
#include "CALC4.h"

/* ============================================================================
 * STRING-BASED WRAPPER
 * Parses comma-separated strings → calls core with arrays
 * Uses .name fields from CALC4 tables - no duplication!
 * ============================================================================ */

#define MAX_OPS 64

static void parse_calculator_lists(
    const char* const_list,
    const char* fun_list,
    const char* op_list,
    ConstOp* const_ops, int* n_const,
    UnaryOp* unary_ops, int* n_unary,
    BinaryOp* binary_ops, int* n_binary)
{
    *n_const = 0;
    *n_unary = 0;
    *n_binary = 0;

    if (const_list == NULL) {
        *n_const = CALC4_N_CONST;
        for (int i = 0; i < CALC4_N_CONST; i++) const_ops[i] = CALC4_CONSTS[i];
    } else if (const_list[0] != '\0') {
        char* copy = strdup(const_list);
        char* token = strtok(copy, ",");
        while (token != NULL && *n_const < MAX_OPS) {
            for (int i = 0; i < CALC4_N_CONST; i++) {
                if (strcmp(token, CALC4_CONSTS[i].name) == 0) {
                    const_ops[(*n_const)++] = CALC4_CONSTS[i];
                    break;
                }
            }
            token = strtok(NULL, ",");
        }
        free(copy);
    }

    if (fun_list == NULL) {
        *n_unary = CALC4_N_UNARY;
        for (int i = 0; i < CALC4_N_UNARY; i++) unary_ops[i] = CALC4_FUNCS[i];
    } else if (fun_list[0] != '\0') {
        char* copy = strdup(fun_list);
        char* token = strtok(copy, ",");
        while (token != NULL && *n_unary < MAX_OPS) {
            for (int i = 0; i < CALC4_N_UNARY; i++) {
                if (strcmp(token, CALC4_FUNCS[i].name) == 0) {
                    unary_ops[(*n_unary)++] = CALC4_FUNCS[i];
                    break;
                }
            }
            token = strtok(NULL, ",");
        }
        free(copy);
    }

    if (op_list == NULL) {
        *n_binary = CALC4_N_BINARY;
        for (int i = 0; i < CALC4_N_BINARY; i++) binary_ops[i] = CALC4_OPS[i];
    } else if (op_list[0] != '\0') {
        char* copy = strdup(op_list);
        char* token = strtok(copy, ",");
        while (token != NULL && *n_binary < MAX_OPS) {
            for (int i = 0; i < CALC4_N_BINARY; i++) {
                if (strcmp(token, CALC4_OPS[i].name) == 0) {
                    binary_ops[(*n_binary)++] = CALC4_OPS[i];
                    break;
                }
            }
            token = strtok(NULL, ",");
        }
        free(copy);
    }
}

static char* vsearch_RPN_with_cr(
    double z, double dz,
    int MinK, int MaxK,
    int cpu_id, int ncpus,
    const char* const_list,
    const char* fun_list,
    const char* op_list,
    double cr_threshold)
{
    ConstOp const_ops[MAX_OPS];
    UnaryOp unary_ops[MAX_OPS];
    BinaryOp binary_ops[MAX_OPS];
    int n_const, n_unary, n_binary;
    parse_calculator_lists(
        const_list, fun_list, op_list,
        const_ops, &n_const, unary_ops, &n_unary, binary_ops, &n_binary);

    return search_constant_with_cr(z, dz, MinK, MaxK, cpu_id, ncpus,
                                   const_ops, n_const,
                                   unary_ops, n_unary,
                                   binary_ops, n_binary,
                                   ERROR_REL, COMPARE_STRICT, cr_threshold);
}

char* vsearch_RPN(
    double z, double dz,
    int MinK, int MaxK,
    int cpu_id, int ncpus,
    const char* const_list,
    const char* fun_list,
    const char* op_list)
{
    return vsearch_RPN_with_cr(
        z, dz, MinK, MaxK, cpu_id, ncpus,
        const_list, fun_list, op_list, 1.05);
}

static char* vsearch_function_custom(
    const DataPoint* data, int n_data,
    int MinK, int MaxK,
    int cpu_id, int ncpus,
    const char* const_list,
    const char* fun_list,
    const char* op_list)
{
    ConstOp const_ops[MAX_OPS];
    UnaryOp unary_ops[MAX_OPS];
    BinaryOp binary_ops[MAX_OPS];
    int n_const, n_unary, n_binary;
    parse_calculator_lists(
        const_list, fun_list, op_list,
        const_ops, &n_const, unary_ops, &n_unary, binary_ops, &n_binary);

    return search_function(
        data, n_data, MinK, MaxK, cpu_id, ncpus,
        const_ops, n_const, unary_ops, n_unary, binary_ops, n_binary,
        ERROR_MSE, COMPARE_STRICT);
}

static char* vsearch_multivariate_custom(
    const DataPoint* data, int n_data,
    int MinK, int MaxK,
    int cpu_id, int ncpus,
    const char* const_list,
    const char* fun_list,
    const char* op_list)
{
    ConstOp const_ops[MAX_OPS];
    UnaryOp unary_ops[MAX_OPS];
    BinaryOp binary_ops[MAX_OPS];
    int n_const, n_unary, n_binary;
    parse_calculator_lists(
        const_list, fun_list, op_list,
        const_ops, &n_const, unary_ops, &n_unary, binary_ops, &n_binary);

    return search_multivariate(
        data, n_data, MinK, MaxK, cpu_id, ncpus,
        const_ops, n_const, unary_ops, n_unary, binary_ops, n_binary,
        ERROR_MSE, COMPARE_STRICT);
}

static char* vsearch_batch_custom(
    const DataPoint* data, int n_data,
    int MinK, int MaxK,
    int cpu_id, int ncpus,
    const char* const_list,
    const char* fun_list,
    const char* op_list,
    double cr_threshold)
{
    ConstOp const_ops[MAX_OPS];
    UnaryOp unary_ops[MAX_OPS];
    BinaryOp binary_ops[MAX_OPS];
    int n_const, n_unary, n_binary;
    parse_calculator_lists(
        const_list, fun_list, op_list,
        const_ops, &n_const, unary_ops, &n_unary, binary_ops, &n_binary);

    return vsearch_core(
        MODE_BATCH, data, n_data, MinK, MaxK, cpu_id, ncpus,
        const_ops, n_const, unary_ops, n_unary, binary_ops, n_binary,
        ERROR_REL, COMPARE_STRICT, n_data, cr_threshold);
}

/* ============================================================================
 * WASM EXPORTED FUNCTIONS
 * ============================================================================ */

#ifdef __EMSCRIPTEN__
#include <emscripten.h>

/* Legacy API: uses full CALC4 calculator */
EMSCRIPTEN_KEEPALIVE
char* search_RPN(double z, double dz, int MinK, int MaxK, int cpu_id, int ncpus) {
    return search_constant(z, dz, MinK, MaxK, cpu_id, ncpus,
                          CALC4_CONSTS, CALC4_N_CONST,
                          CALC4_FUNCS,  CALC4_N_UNARY,
                          CALC4_OPS,    CALC4_N_BINARY,
                          ERROR_REL, COMPARE_STRICT);
}

EMSCRIPTEN_KEEPALIVE
char* search_RPN_with_cr(double z, double dz, int MinK, int MaxK, int cpu_id, int ncpus, double cr_threshold) {
    return search_constant_with_cr(z, dz, MinK, MaxK, cpu_id, ncpus,
                          CALC4_CONSTS, CALC4_N_CONST,
                          CALC4_FUNCS,  CALC4_N_UNARY,
                          CALC4_OPS,    CALC4_N_BINARY,
                          ERROR_REL, COMPARE_STRICT, cr_threshold);
}

/* Hybrid search (same as search_RPN for now - placeholder for FP32+FP64) */
EMSCRIPTEN_KEEPALIVE
char* search_RPN_hybrid(double z, double dz, int MinK, int MaxK, int cpu_id, int ncpus) {
    return search_constant(z, dz, MinK, MaxK, cpu_id, ncpus,
                          CALC4_CONSTS, CALC4_N_CONST,
                          CALC4_FUNCS,  CALC4_N_UNARY,
                          CALC4_OPS,    CALC4_N_BINARY,
                          ERROR_REL, COMPARE_STRICT);
}

/* Configurable search via strings */
EMSCRIPTEN_KEEPALIVE
char* search_RPN_custom(double z, double dz, int MinK, int MaxK, int cpu_id, int ncpus,
                        const char* consts, const char* funcs, const char* ops) {
    return vsearch_RPN(z, dz, MinK, MaxK, cpu_id, ncpus, consts, funcs, ops);
}

EMSCRIPTEN_KEEPALIVE
char* search_RPN_custom_with_cr(
    double z, double dz, int MinK, int MaxK, int cpu_id, int ncpus,
    const char* consts, const char* funcs, const char* ops, double cr_threshold)
{
    return vsearch_RPN_with_cr(
        z, dz, MinK, MaxK, cpu_id, ncpus,
        consts, funcs, ops, cr_threshold);
}

/* Function recognition via WASM */
EMSCRIPTEN_KEEPALIVE
char* search_function_wasm(
    const double* x_values, const double* y_values, const double* dy_values,
    int n_data,
    int MinK, int MaxK,
    int cpu_id, int ncpus)
{
    if (n_data < 1 || n_data > VSEARCH_MAX_FUNCTION_ROWS) {
        return strdup("{\"error\":\"Function search supports 1 to 4096 data rows\",\"status\":\"ERROR\"}");
    }
    if (x_values == NULL || y_values == NULL) {
        return strdup("{\"error\":\"Function data arrays are required\",\"status\":\"ERROR\"}");
    }
    /* Convert arrays to DataPoint array */
    DataPoint* data = (DataPoint*)malloc(n_data * sizeof(DataPoint));
    if (!data) {
        return strdup("{\"error\":\"Memory allocation failed\"}");
    }
    
    for (int i = 0; i < n_data; i++) {
        data[i].x = x_values[i];
        data[i].y = y_values[i];
        data[i].dy = (dy_values != NULL) ? dy_values[i] : 0.0;
    }
    
    char* result = search_function(
        data, n_data,
        MinK, MaxK,
        cpu_id, ncpus,
        CALC4_CONSTS, CALC4_N_CONST,
        CALC4_FUNCS,  CALC4_N_UNARY,
        CALC4_OPS,    CALC4_N_BINARY,
        ERROR_MSE, COMPARE_STRICT);
    
    free(data);
    return result;
}

EMSCRIPTEN_KEEPALIVE
char* search_function_custom_wasm(
    const double* x_values, const double* y_values, const double* dy_values,
    int n_data,
    int MinK, int MaxK,
    int cpu_id, int ncpus,
    const char* consts, const char* funcs, const char* ops)
{
    if (n_data < 1 || n_data > VSEARCH_MAX_FUNCTION_ROWS) {
        return strdup("{\"error\":\"Function search supports 1 to 4096 data rows\",\"status\":\"ERROR\"}");
    }
    if (x_values == NULL || y_values == NULL) {
        return strdup("{\"error\":\"Function data arrays are required\",\"status\":\"ERROR\"}");
    }
    DataPoint* data = (DataPoint*)malloc(n_data * sizeof(DataPoint));
    if (!data) return strdup("{\"error\":\"Memory allocation failed\"}");

    for (int i = 0; i < n_data; i++) {
        data[i].x = x_values[i];
        data[i].y = y_values[i];
        data[i].dy = (dy_values != NULL) ? dy_values[i] : 0.0;
    }

    char* result = vsearch_function_custom(
        data, n_data, MinK, MaxK, cpu_id, ncpus,
        consts, funcs, ops);
    free(data);
    return result;
}

/* Two-variable F(C1,C2) recognition via WASM. */
EMSCRIPTEN_KEEPALIVE
char* search_multivariate_wasm(
    const double* c1_values, const double* c2_values,
    const double* y_values, const double* dy_values,
    int n_data,
    int MinK, int MaxK,
    int cpu_id, int ncpus)
{
    if (n_data < 1 || n_data > VSEARCH_MAX_FUNCTION_ROWS) {
        return strdup("{\"error\":\"Two-variable search supports 1 to 4096 data rows\",\"status\":\"ERROR\"}");
    }
    if (c1_values == NULL || c2_values == NULL || y_values == NULL) {
        return strdup("{\"error\":\"Two-variable data arrays are required\",\"status\":\"ERROR\"}");
    }
    DataPoint* data = (DataPoint*)malloc(n_data * sizeof(DataPoint));
    if (!data) return strdup("{\"error\":\"Memory allocation failed\"}");

    for (int i = 0; i < n_data; i++) {
        data[i].x = c1_values[i];
        data[i].x2 = c2_values[i];
        data[i].y = y_values[i];
        data[i].dy = (dy_values != NULL) ? dy_values[i] : 0.0;
    }

    char* result = search_multivariate(
        data, n_data, MinK, MaxK, cpu_id, ncpus,
        CALC4_CONSTS, CALC4_N_CONST,
        CALC4_FUNCS, CALC4_N_UNARY,
        CALC4_OPS, CALC4_N_BINARY,
        ERROR_MSE, COMPARE_STRICT);
    free(data);
    return result;
}

EMSCRIPTEN_KEEPALIVE
char* search_multivariate_custom_wasm(
    const double* c1_values, const double* c2_values,
    const double* y_values, const double* dy_values,
    int n_data,
    int MinK, int MaxK,
    int cpu_id, int ncpus,
    const char* consts, const char* funcs, const char* ops)
{
    if (n_data < 1 || n_data > VSEARCH_MAX_FUNCTION_ROWS) {
        return strdup("{\"error\":\"Two-variable search supports 1 to 4096 data rows\",\"status\":\"ERROR\"}");
    }
    if (c1_values == NULL || c2_values == NULL || y_values == NULL) {
        return strdup("{\"error\":\"Two-variable data arrays are required\",\"status\":\"ERROR\"}");
    }
    DataPoint* data = (DataPoint*)malloc(n_data * sizeof(DataPoint));
    if (!data) return strdup("{\"error\":\"Memory allocation failed\"}");

    for (int i = 0; i < n_data; i++) {
        data[i].x = c1_values[i];
        data[i].x2 = c2_values[i];
        data[i].y = y_values[i];
        data[i].dy = (dy_values != NULL) ? dy_values[i] : 0.0;
    }

    char* result = vsearch_multivariate_custom(
        data, n_data, MinK, MaxK, cpu_id, ncpus,
        consts, funcs, ops);
    free(data);
    return result;
}

/* Batch (Multiple Constants) recognition via WASM */
EMSCRIPTEN_KEEPALIVE
char* search_batch_wasm(
    const double* x_values, const double* y_values, const double* dy_values,
    int n_data,
    int MinK, int MaxK,
    int cpu_id, int ncpus)
{
    if (n_data < 1 || n_data > VSEARCH_MAX_BATCH_TARGETS) {
        return strdup("{\"error\":\"Batch search supports 1 to 512 targets\",\"status\":\"ERROR\"}");
    }
    if (x_values == NULL || y_values == NULL) {
        return strdup("{\"error\":\"Batch data arrays are required\",\"status\":\"ERROR\"}");
    }
    /* Convert arrays to DataPoint array */
    DataPoint* data = (DataPoint*)malloc(n_data * sizeof(DataPoint));
    if (!data) {
        return strdup("{\"error\":\"Memory allocation failed\"}");
    }
    
    for (int i = 0; i < n_data; i++) {
        data[i].x = x_values[i];
        data[i].y = y_values[i];
        data[i].dy = (dy_values != NULL) ? dy_values[i] : 0.0;
    }
    
    char* result = search_batch(
        data, n_data,
        n_data, /* num_to_find */
        MinK, MaxK,
        cpu_id, ncpus,
        CALC4_CONSTS, CALC4_N_CONST,
        CALC4_FUNCS,  CALC4_N_UNARY,
        CALC4_OPS,    CALC4_N_BINARY,
        ERROR_REL, COMPARE_STRICT);
    
    free(data);
    return result;
}

EMSCRIPTEN_KEEPALIVE
char* search_batch_with_cr_wasm(
    const double* x_values, const double* y_values, const double* dy_values,
    int n_data,
    int MinK, int MaxK,
    int cpu_id, int ncpus,
    double cr_threshold)
{
    if (n_data < 1 || n_data > VSEARCH_MAX_BATCH_TARGETS) {
        return strdup("{\"error\":\"Batch search supports 1 to 512 targets\",\"status\":\"ERROR\"}");
    }
    if (x_values == NULL || y_values == NULL) {
        return strdup("{\"error\":\"Batch data arrays are required\",\"status\":\"ERROR\"}");
    }
    DataPoint* data = (DataPoint*)malloc(n_data * sizeof(DataPoint));
    if (!data) return strdup("{\"error\":\"Memory allocation failed\"}");

    for (int i = 0; i < n_data; i++) {
        data[i].x = x_values[i];
        data[i].y = y_values[i];
        data[i].dy = (dy_values != NULL) ? dy_values[i] : 0.0;
    }

    char* result = vsearch_core(
        MODE_BATCH, data, n_data, MinK, MaxK, cpu_id, ncpus,
        CALC4_CONSTS, CALC4_N_CONST,
        CALC4_FUNCS, CALC4_N_UNARY,
        CALC4_OPS, CALC4_N_BINARY,
        ERROR_REL, COMPARE_STRICT, n_data, cr_threshold);
    free(data);
    return result;
}

EMSCRIPTEN_KEEPALIVE
char* search_batch_custom_wasm(
    const double* x_values, const double* y_values, const double* dy_values,
    int n_data,
    int MinK, int MaxK,
    int cpu_id, int ncpus,
    const char* consts, const char* funcs, const char* ops)
{
    if (n_data < 1 || n_data > VSEARCH_MAX_BATCH_TARGETS) {
        return strdup("{\"error\":\"Batch search supports 1 to 512 targets\",\"status\":\"ERROR\"}");
    }
    if (x_values == NULL || y_values == NULL) {
        return strdup("{\"error\":\"Batch data arrays are required\",\"status\":\"ERROR\"}");
    }
    DataPoint* data = (DataPoint*)malloc(n_data * sizeof(DataPoint));
    if (!data) return strdup("{\"error\":\"Memory allocation failed\"}");

    for (int i = 0; i < n_data; i++) {
        data[i].x = x_values[i];
        data[i].y = y_values[i];
        data[i].dy = (dy_values != NULL) ? dy_values[i] : 0.0;
    }

    char* result = vsearch_batch_custom(
        data, n_data, MinK, MaxK, cpu_id, ncpus,
        consts, funcs, ops, 1.05);
    free(data);
    return result;
}

EMSCRIPTEN_KEEPALIVE
char* search_batch_custom_with_cr_wasm(
    const double* x_values, const double* y_values, const double* dy_values,
    int n_data,
    int MinK, int MaxK,
    int cpu_id, int ncpus,
    const char* consts, const char* funcs, const char* ops,
    double cr_threshold)
{
    if (n_data < 1 || n_data > VSEARCH_MAX_BATCH_TARGETS) {
        return strdup("{\"error\":\"Batch search supports 1 to 512 targets\",\"status\":\"ERROR\"}");
    }
    if (x_values == NULL || y_values == NULL) {
        return strdup("{\"error\":\"Batch data arrays are required\",\"status\":\"ERROR\"}");
    }
    DataPoint* data = (DataPoint*)malloc(n_data * sizeof(DataPoint));
    if (!data) return strdup("{\"error\":\"Memory allocation failed\"}");

    for (int i = 0; i < n_data; i++) {
        data[i].x = x_values[i];
        data[i].y = y_values[i];
        data[i].dy = (dy_values != NULL) ? dy_values[i] : 0.0;
    }

    char* result = vsearch_batch_custom(
        data, n_data, MinK, MaxK, cpu_id, ncpus,
        consts, funcs, ops, cr_threshold);
    free(data);
    return result;
}

#endif /* __EMSCRIPTEN__ */
