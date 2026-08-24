#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../vsearch_RPN_core.h"

static double square_value(double value) { return value * value; }
static double add_core_order(double top, double below) { return top + below; }

int main(void) {
    const DataPoint data[] = {
        {.x = 3.0,  .y = 5.0,  .dy = 0.0, .x2 = 4.0},
        {.x = 5.0,  .y = 13.0, .dy = 0.0, .x2 = 12.0},
        {.x = 8.0,  .y = 17.0, .dy = 0.0, .x2 = 15.0},
        {.x = 7.0,  .y = 25.0, .dy = 0.0, .x2 = 24.0},
        {.x = 20.0, .y = 29.0, .dy = 0.0, .x2 = 21.0},
    };
    const UnaryOp unary_ops[] = {
        {sqrt, "SQRT"},
        {square_value, "SQR"},
    };
    const BinaryOp binary_ops[] = {
        {add_core_order, "PLUS"},
    };

    char* result = search_multivariate(
        data, (int)ARRAY_SIZE(data),
        1, 6, 0, 1,
        NULL, 0,
        unary_ops, (int)ARRAY_SIZE(unary_ops),
        binary_ops, (int)ARRAY_SIZE(binary_ops),
        ERROR_MSE, COMPARE_STRICT);

    const int passed = result != NULL &&
        strstr(result, "\"result\":\"SUCCESS\"") != NULL &&
        strstr(result, "C1") != NULL &&
        strstr(result, "C2") != NULL &&
        strstr(result, "SQRT") != NULL;

    if (!passed) {
        fprintf(stderr, "Multivariate recognition failed:\n%s\n", result ? result : "(null)");
    } else {
        puts("Multivariate F(C1,C2) recognition: PASS");
    }
    free(result);
    return passed ? 0 : 1;
}
