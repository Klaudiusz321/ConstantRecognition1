#include <stdio.h>
#include <complex.h>

int main() {
    double complex z = cacos(-2.0);
    printf("acos(-2) = %f %f\n", creal(z), cimag(z));
    return 0;
}
