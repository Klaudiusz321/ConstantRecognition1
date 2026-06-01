#include <stdio.h>
#include <complex.h>

int main() {
    double complex z = ctan(cacos(-2.0));
    printf("%f %f\n", creal(z), cimag(z));
    return 0;
}
