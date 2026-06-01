#include <stdio.h>
#include <complex.h>

int main() {
    double complex b = 2.0 + 0.0 * I;
    double complex a = -1.0 + 0.0 * I;
    double complex res = b / a;
    printf("b / a = %f %f\n", creal(res), cimag(res));
    double complex a_cos = cacos(res);
    double complex t = ctan(a_cos);
    printf("ctan(cacos) = %f %f\n", creal(t), cimag(t));
    return 0;
}
