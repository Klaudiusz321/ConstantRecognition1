#include <stdio.h>
#include <complex.h>
#include <math.h>

int main() {
    double complex z = cacos(-2.0);
    double complex z2 = ctan(z);
    printf("z = %f %f\n", creal(z), cimag(z));
    printf("ctan(z) = %f %f\n", creal(z2), cimag(z2));
    
    double complex manual_z = M_PI - 1.3169578969248166 * I;
    double complex manual_z2 = ctan(manual_z);
    printf("manual ctan = %f %f\n", creal(manual_z2), cimag(manual_z2));
    return 0;
}
