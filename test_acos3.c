#include <stdio.h>
#include <complex.h>

int main() {
    double complex z = ctan(cacos(2.0));
    double complex z2 = z * -1;
    printf("tan(acos(2)) = %f %f\n", creal(z), cimag(z));
    printf("tan(acos(2)) * -1 = %f %f\n", creal(z2), cimag(z2));
    return 0;
}
